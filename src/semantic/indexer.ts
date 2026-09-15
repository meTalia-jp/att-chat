import type { EmbeddingProvider, EmbeddingSpaceSpec } from './contracts.ts';
import { identifySpace } from './space.ts';
import { validateEmbedding } from './validation.ts';
import { SemanticIndexRepository, inputHashes } from './index-repository.ts';

/** One inference at a time. No database transaction spans an await. */
export class BackgroundIndexer {
  private busy = false;
  private controller?: AbortController;
  readonly spaceId: string;
  private repo: SemanticIndexRepository;
  private provider: EmbeddingProvider;
  private spec: EmbeddingSpaceSpec;
  private now: () => number;
  constructor(repo: SemanticIndexRepository, provider: EmbeddingProvider, spec: EmbeddingSpaceSpec, now = Date.now) {
    this.repo=repo; this.provider=provider; this.spec=structuredClone(spec); this.now=now;
    this.spaceId=repo.registerSpace(spec,now());
  }
  cancel() { this.controller?.abort(); }
  async tick(): Promise<boolean> {
    if (this.busy) return false;
    this.busy=true;
    try {
      const info=await this.provider.getModelInfo(), identity=identifySpace(this.spec);
      if (info.space_id!==identity.space_id || info.fingerprint!==identity.fingerprint || info.dimensions!==this.spec.dimensions || info.provider_id!==this.spec.provider || info.model_id!==this.spec.model || info.revision!==this.spec.model_revision || info.input_token_limit!==this.spec.input_token_limit) throw new Error('SPACE_MISMATCH');
      this.repo.supplement(this.spaceId,this.now());
      const lease=this.repo.claim(this.spaceId,this.now());
      if (!lease) return false;
      const hashes=inputHashes(lease.content,this.spec);
      if (hashes.source_hash!==lease.source_hash || hashes.input_hash!==lease.input_hash) { this.repo.markStale(lease.turn_id,lease.space_id,this.now()); return true; }
      this.controller=new AbortController();
      let timedOut=false;
      // Abort asks the provider to stop; do not start another call until it returns.
      const timer=setTimeout(() => { timedOut=true; this.controller?.abort(); },30000);
      try {
        const result=validateEmbedding(await this.provider.embed(lease.content,{purpose:'document',signal:this.controller.signal}),info);
        if (timedOut) this.repo.saveFailed(lease,'TIMEOUT',true,this.now());
        else if (this.controller.signal.aborted) this.repo.saveFailed(lease,'CANCELLED',false,this.now());
        else if (result.ok) this.repo.saveReady(lease,result,this.now());
        else this.repo.saveFailed(lease,result.error.code,result.error.retryable,this.now());
      } catch (error) {
        // A DB write failure may leave the lease intact. Recovery retries it with a new token.
        const sqlite=(error as {errcode?:number})?.errcode;
        this.repo.saveFailed(lease,sqlite===5 || sqlite===6?'DB_BUSY':sqlite?'STORAGE_ERROR':'PROVIDER_ERROR',!sqlite || sqlite===5 || sqlite===6,this.now());
      } finally { clearTimeout(timer); this.controller=undefined; }
      return true;
    } finally { this.busy=false; }
  }
}
