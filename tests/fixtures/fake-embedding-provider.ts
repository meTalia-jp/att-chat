import { createHash } from 'node:crypto';
import type { EmbeddingProvider, EmbeddingPurpose, EmbeddingModelInfo, EmbeddingResult, EmbeddingSpaceSpec, Locality } from '../../src/semantic/contracts.ts';
import { identifySpace } from '../../src/semantic/space.ts';
import { failure } from '../../src/semantic/validation.ts';

export const fakeSpec: EmbeddingSpaceSpec = { space_spec_version: 1, provider: 'fake', model: 'fixture', model_revision: '1', tokenizer: 'fake-codepoints-v1', quantization_artifact: 'none', dimensions: 4, pooling: 'fake-v1', normalization: 'none', prefixes: {query:'q:',document:'d:'}, preprocessing:'identity-v1', long_text_policy:'reject', input_token_limit:32 };
export type FakeMode = 'normal' | 'dimensions' | 'nan' | 'infinity' | 'zero' | 'space' | 'INPUT_TOO_LONG' | 'MODEL_UNAVAILABLE' | 'PROVIDER_ERROR' | 'CANCELLED';
/** Not semantic embeddings. Each code point is one fake token, including prefix. */
export class FakeEmbeddingProvider implements EmbeddingProvider {
  private spec: EmbeddingSpaceSpec;
  private mode: FakeMode;
  private locality: Locality;
  private disposed = false;
  constructor(mode: FakeMode = 'normal', locality: Locality = 'in_process_local', spec = fakeSpec) { this.mode=mode; this.locality=locality; this.spec=structuredClone(spec); }
  async getModelInfo(): Promise<EmbeddingModelInfo> {
    return { ...identifySpace(this.spec), provider_id:this.spec.provider, model_id:this.spec.model, revision:this.spec.model_revision, dimensions:this.spec.dimensions, input_token_limit:this.spec.input_token_limit, locality:this.locality };
  }
  async embed(text: string, options: {purpose: EmbeddingPurpose; signal?: AbortSignal}): Promise<EmbeddingResult> {
    await Promise.resolve(); // deterministic opportunity for in-flight cancellation
    if (options.signal?.aborted || this.mode==='CANCELLED') return failure('CANCELLED');
    if (this.disposed || this.mode==='MODEL_UNAVAILABLE') return failure('MODEL_UNAVAILABLE');
    if (this.mode==='PROVIDER_ERROR') return failure('PROVIDER_ERROR',true);
    const input = this.spec.prefixes[options.purpose]+text;
    const input_tokens = Array.from(input).length;
    if (this.mode==='INPUT_TOO_LONG' || input_tokens>this.spec.input_token_limit) return failure('INPUT_TOO_LONG');
    const hash=createHash('sha256').update(input).digest();
    const vector=Float32Array.from({length:this.spec.dimensions+(this.mode==='dimensions'?1:0)},(_,i)=>(hash[i%hash.length]+1)/256);
    if(this.mode==='nan') vector[0]=NaN;
    if(this.mode==='infinity') vector[0]=Infinity;
    if(this.mode==='zero') vector.fill(0);
    return {ok:true,space_id:this.mode==='space'?'wrong':identifySpace(this.spec).space_id,vector,input_tokens,truncated:false};
  }
  async dispose() { this.disposed=true; }
}
