import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { transaction } from '../server/storage/database.ts';
import type { EmbeddingSpaceSpec, EmbeddingModelInfo } from './contracts.ts';
import { canonicalSerialize, identifySpace } from './space.ts';
import { validateEmbedding } from './validation.ts';

export const MAX_ATTEMPTS = 3;
export const hashText = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
export function inputHashes(content: string, spec: EmbeddingSpaceSpec) {
  // These are the only implemented raw-text input adapters. New preprocessing needs an adapter.
  if (!['identity-v1', 'raw-text-prefix-special-tokens-v1'].includes(spec.preprocessing)) throw new Error('UNSUPPORTED_PREPROCESSING');
  return { source_hash: hashText(content), input_hash: hashText(spec.prefixes.document + content) };
}
export type Lease = {
  turn_id: string; space_id: string; source_hash: string; input_hash: string;
  lease_token: string; lease_until: number; attempt_count: number; content: string;
};
export class SemanticIndexRepository {
  readonly db: DatabaseSync;
  constructor(db: DatabaseSync) { this.db = db; }
  registerSpace(spec: EmbeddingSpaceSpec, now = Date.now()) {
    const identity = identifySpace(spec);
    inputHashes('', spec);
    // Whitelist fields so unknown operational fields/credentials cannot be persisted.
    const clean: EmbeddingSpaceSpec = {
      space_spec_version: spec.space_spec_version, provider: spec.provider, model: spec.model,
      model_revision: spec.model_revision, tokenizer: spec.tokenizer, dimensions: spec.dimensions,
      pooling: spec.pooling, normalization: spec.normalization,
      prefixes: { query: spec.prefixes.query, document: spec.prefixes.document },
      preprocessing: spec.preprocessing, long_text_policy: spec.long_text_policy,
      input_token_limit: spec.input_token_limit, quantization_artifact: spec.quantization_artifact,
    };
    this.db.prepare(`INSERT INTO embedding_spaces VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(space_id) DO NOTHING`)
      .run(identity.space_id, identity.fingerprint, 1, spec.provider, spec.model, spec.model_revision, spec.dimensions, canonicalSerialize(clean), now);
    if (canonicalSerialize(this.getSpace(identity.space_id)) !== canonicalSerialize(clean)) throw new Error('SPACE_MISMATCH');
    return identity.space_id;
  }
  getSpace(id: string): EmbeddingSpaceSpec {
    const row = this.db.prepare('SELECT * FROM embedding_spaces WHERE space_id=?').get(id);
    if (!row) throw new Error('SPACE_MISSING');
    const spec = JSON.parse(row.spec_json as string) as EmbeddingSpaceSpec, identity = identifySpace(spec);
    if (identity.space_id !== id || identity.fingerprint !== row.fingerprint || spec.dimensions !== row.dimensions || spec.provider !== row.provider_id || spec.model !== row.model_id || spec.model_revision !== row.model_revision || spec.space_spec_version !== row.spec_version) throw new Error('SPACE_MISMATCH');
    return spec;
  }
  info(id: string): EmbeddingModelInfo {
    const s = this.getSpace(id);
    return { ...identifySpace(s), provider_id:s.provider, model_id:s.model, revision:s.model_revision, dimensions:s.dimensions, input_token_limit:s.input_token_limit, locality:'in_process_local' };
  }
  row(turn: string, space: string) { return this.db.prepare('SELECT * FROM turn_embeddings WHERE turn_id=? AND space_id=?').get(turn, space); }
  missing(space: string, limit = 100) {
    this.getSpace(space);
    return this.db.prepare(`SELECT t.turn_id,t.content FROM turns t WHERE t.status='completed' AND t.role IN ('user','assistant')
      AND NOT EXISTS(SELECT 1 FROM turn_embeddings e WHERE e.turn_id=t.turn_id AND e.space_id=?) ORDER BY t.created_at,t.turn_id LIMIT ?`).all(space,limit);
  }
  supplement(space: string, now = Date.now(), limit = 100) {
    return transaction(this.db, () => {
      const spec = this.getSpace(space), rows = this.missing(space,limit);
      const insert = this.db.prepare(`INSERT INTO turn_embeddings(turn_id,space_id,source_hash,input_hash,status,created_at,updated_at) VALUES(?,?,?,?,'pending',?,?)`);
      for (const row of rows) { const h = inputHashes(row.content as string,spec); insert.run(row.turn_id,space,h.source_hash,h.input_hash,now,now); }
      return rows.length;
    });
  }
  claim(space: string, now = Date.now(), leaseMs = 60000): Lease | undefined {
    if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0) throw new Error('INVALID_LEASE_DURATION');
    return transaction(this.db, () => {
      this.getSpace(space);
      this.db.prepare(`UPDATE turn_embeddings SET status='failed',error_code='LEASE_EXHAUSTED',lease_token=NULL,lease_until=NULL,updated_at=?
        WHERE space_id=? AND status='pending' AND attempt_count>=? AND (lease_until IS NULL OR lease_until<=?)`).run(now,space,MAX_ATTEMPTS,now);
      const row = this.db.prepare(`SELECT e.*,t.content FROM turn_embeddings e JOIN turns t USING(turn_id)
        WHERE e.space_id=? AND e.status='pending' AND e.attempt_count<? AND e.next_attempt_at<=?
        AND (e.lease_until IS NULL OR e.lease_until<=?) ORDER BY e.created_at,e.turn_id LIMIT 1`).get(space,MAX_ATTEMPTS,now,now);
      if (!row) return;
      const token = randomUUID(), until = now + leaseMs;
      this.db.prepare('UPDATE turn_embeddings SET lease_token=?,lease_until=?,attempt_count=attempt_count+1,updated_at=? WHERE turn_id=? AND space_id=?').run(token,until,now,row.turn_id,space);
      return { ...row, lease_token:token, lease_until:until, attempt_count:Number(row.attempt_count)+1 } as Lease;
    });
  }
  private owned(lease: Lease, now: number) {
    const row = this.row(lease.turn_id,lease.space_id);
    if (!row || row.status !== 'pending' || row.lease_token !== lease.lease_token || Number(row.lease_until)<=now || row.source_hash!==lease.source_hash || row.input_hash!==lease.input_hash) return false;
    const t = this.db.prepare('SELECT content,status FROM turns WHERE turn_id=?').get(lease.turn_id);
    return !!t && t.status==='completed' && hashText(t.content as string)===lease.source_hash && inputHashes(t.content as string,this.getSpace(lease.space_id)).input_hash===lease.input_hash;
  }
  saveReady(lease: Lease, result: unknown, now = Date.now()) {
    const checked = validateEmbedding(result,this.info(lease.space_id));
    if (!checked.ok) throw new Error(checked.error.code);
    const blob = Buffer.alloc(checked.vector.length*4);
    checked.vector.forEach((v,i) => blob.writeFloatLE(v,i*4));
    return transaction(this.db, () => {
      if (!this.owned(lease,now)) return false;
      this.db.prepare(`UPDATE turn_embeddings SET vector=?,input_tokens=?,status='ready',error_code=NULL,lease_token=NULL,lease_until=NULL,updated_at=? WHERE turn_id=? AND space_id=?`)
        .run(blob,checked.input_tokens,now,lease.turn_id,lease.space_id);
      return true;
    });
  }
  saveFailed(lease: Lease, code: string, retryable: boolean, now = Date.now()) {
    return transaction(this.db, () => {
      if (!this.owned(lease,now)) return false;
      const retry = retryable && ['PROVIDER_ERROR','TIMEOUT','DB_BUSY'].includes(code) && lease.attempt_count<MAX_ATTEMPTS;
      this.db.prepare(`UPDATE turn_embeddings SET status=?,vector=NULL,input_tokens=NULL,error_code=?,next_attempt_at=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE turn_id=? AND space_id=?`)
        .run(retry?'pending':'failed',code,retry?now+1000*2**(lease.attempt_count-1):0,now,lease.turn_id,lease.space_id);
      return true;
    });
  }
  markStale(turn: string, space: string, now = Date.now()) {
    this.db.prepare(`UPDATE turn_embeddings SET status='stale',vector=NULL,input_tokens=NULL,error_code='HASH_MISMATCH',lease_token=NULL,lease_until=NULL,updated_at=? WHERE turn_id=? AND space_id=?`).run(now,turn,space);
  }
  rebuild(space: string, now = Date.now()) {
    return transaction(this.db, () => {
      const spec = this.getSpace(space), rows = this.db.prepare("SELECT turn_id,content FROM turns WHERE status='completed' AND role IN ('user','assistant')").all();
      const put = this.db.prepare(`INSERT INTO turn_embeddings(turn_id,space_id,source_hash,input_hash,status,created_at,updated_at) VALUES(?,?,?,?,'pending',?,?)
        ON CONFLICT(turn_id,space_id) DO UPDATE SET source_hash=excluded.source_hash,input_hash=excluded.input_hash,status='pending',vector=NULL,input_tokens=NULL,attempt_count=0,next_attempt_at=0,lease_token=NULL,lease_until=NULL,error_code=NULL,updated_at=excluded.updated_at`);
      for (const row of rows) { const h=inputHashes(row.content as string,spec); put.run(row.turn_id,space,h.source_hash,h.input_hash,now,now); }
      return rows.length;
    });
  }
  counts(space: string) {
    this.getSpace(space);
    const counts = { total_completed:Number(this.db.prepare("SELECT count(*) n FROM turns WHERE status='completed' AND role IN ('user','assistant')").get()!.n), ready:0,pending:0,failed:0,stale:0,input_too_long:0,missing:0 };
    for (const row of this.db.prepare('SELECT status,count(*) n FROM turn_embeddings WHERE space_id=? GROUP BY status').all(space)) counts[row.status as 'ready'|'pending'|'failed'|'stale']=Number(row.n);
    counts.input_too_long=Number(this.db.prepare("SELECT count(*) n FROM turn_embeddings WHERE space_id=? AND error_code='INPUT_TOO_LONG'").get(space)!.n);
    counts.missing=counts.total_completed-counts.ready-counts.pending-counts.failed-counts.stale;
    return counts;
  }
  readVector(turn: string, space: string): Float32Array | undefined {
    const row=this.row(turn,space);
    if (!row || row.status!=='ready') return;
    const t=this.db.prepare('SELECT content FROM turns WHERE turn_id=?').get(turn), spec=this.getSpace(space);
    if (!t || row.source_hash!==hashText(t.content as string) || row.input_hash!==inputHashes(t.content as string,spec).input_hash) { this.markStale(turn,space); return; }
    const blob=Buffer.from(row.vector as Uint8Array);
    if (blob.length!==spec.dimensions*4) throw new Error('INVALID_VECTOR');
    const vector=Float32Array.from({length:spec.dimensions},(_,i)=>blob.readFloatLE(i*4));
    const result=validateEmbedding({ok:true,space_id:space,vector,input_tokens:row.input_tokens,truncated:false},this.info(space));
    if (!result.ok) throw new Error(result.error.code);
    return result.vector;
  }
}
