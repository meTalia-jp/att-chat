import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Tokenizer } from '@huggingface/tokenizers';
import { InferenceSession, Tensor } from 'onnxruntime-node';
import type { EmbeddingProvider, EmbeddingPurpose, EmbeddingSpaceSpec, EmbeddingResult } from './contracts.ts';
import { identifySpace } from './space.ts';
import { failure, validateEmbedding } from './validation.ts';

export const revision = '761b726dd34fb83930e26aab4e9ac3899aa1fa78';
export const files = {
  'config.json': 'cb99455288675345e1a4f411438d5d0adbba5fbd3a67ea4fb03c015433b996c1',
  'model_quantized.onnx': 'f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193',
  'tokenizer_config.json': 'a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b',
  'tokenizer.json': '0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39',
};
export const spec: EmbeddingSpaceSpec = {
  space_spec_version:1, provider:'builtin-onnx-s1', model:'Xenova/multilingual-e5-small', model_revision:revision,
  tokenizer:`tokenizers-js-0.2.0:${files['tokenizer.json']}:${files['tokenizer_config.json']}`,
  quantization_artifact:`onnxruntime-node-1.21.0:cpu:${files['model_quantized.onnx']}`,
  dimensions:384, pooling:'attention-mask-mean-v1', normalization:'l2-v1', prefixes:{query:'query: ',document:'passage: '},
  preprocessing:'raw-text-prefix-special-tokens-v1', long_text_policy:'reject', input_token_limit:512,
};

/** S2 selective port of S1 at 4c44718. Pinned identity retained; local CPU, single input. */
export class BuiltinEmbeddingProvider implements EmbeddingProvider {
  private tokenizer: Tokenizer;
  private session: InferenceSession;
  private busy = false;
  private closed = false;
  private constructor(tokenizer: Tokenizer, session: InferenceSession) { this.tokenizer=tokenizer; this.session=session; }
  static async load(dir: string) {
    for (const [file, expected] of Object.entries(files)) {
      if(createHash('sha256').update(readFileSync(resolve(dir,file))).digest('hex')!==expected) throw new Error('MODEL_ARTIFACT_MISMATCH');
    }
    const tokenizer=new Tokenizer(JSON.parse(readFileSync(resolve(dir,'tokenizer.json'),'utf8')),JSON.parse(readFileSync(resolve(dir,'tokenizer_config.json'),'utf8')));
    const session=await InferenceSession.create(resolve(dir,'model_quantized.onnx'),{executionProviders:['cpu'],intraOpNumThreads:2,interOpNumThreads:1,executionMode:'sequential',logSeverityLevel:3});
    return new BuiltinEmbeddingProvider(tokenizer,session);
  }
  async getModelInfo() { return {...identifySpace(spec),provider_id:spec.provider,model_id:spec.model,revision,dimensions:384,input_token_limit:512,locality:'in_process_local' as const}; }
  countTokens(text:string,purpose:EmbeddingPurpose) { return this.encode(text,purpose).ids.length; }
  private encode(text:string,purpose:EmbeddingPurpose) { return this.tokenizer.encode(spec.prefixes[purpose]+text,{add_special_tokens:true,return_token_type_ids:true}); }
  async embed(text:string,options:{purpose:EmbeddingPurpose;signal?:AbortSignal}):Promise<EmbeddingResult> {
    if(options.signal?.aborted) return failure('CANCELLED');
    if(this.closed) return failure('MODEL_UNAVAILABLE');
    if(this.busy) return failure('PROVIDER_ERROR',true);
    this.busy=true;
    try {
      const e=this.encode(text,options.purpose),n=e.ids.length;
      if(n>512) return failure('INPUT_TOO_LONG');
      if(options.signal?.aborted) return failure('CANCELLED');
      const tensor=(values:number[])=>new Tensor('int64',BigInt64Array.from(values,BigInt),[1,n]);
      const candidates:Record<string,Tensor>={input_ids:tensor(e.ids),attention_mask:tensor(e.attention_mask),token_type_ids:tensor(e.token_type_ids)};
      const feeds=Object.fromEntries(this.session.inputNames.map(name=>[name,candidates[name]]));
      const output=await this.session.run(feeds);
      if(options.signal?.aborted) return failure('CANCELLED');
      const hidden=output.last_hidden_state;
      if(!hidden || hidden.dims.join(',')!==`1,${n},384`) return failure('INVALID_VECTOR');
      const sums=new Float64Array(384); let count=0;
      for(let i=0;i<n;i++) if(e.attention_mask[i]) {count++; for(let j=0;j<384;j++) sums[j]+=Number(hidden.data[i*384+j]);}
      const vector=Float32Array.from(sums,v=>v/count),norm=Math.hypot(...vector);
      for(let j=0;j<384;j++) vector[j]/=norm;
      const info=await this.getModelInfo();
      return validateEmbedding({ok:true,space_id:info.space_id,vector,input_tokens:n,truncated:false},info);
    } catch { return options.signal?.aborted?failure('CANCELLED'):failure('PROVIDER_ERROR',true); }
    finally {this.busy=false;}
  }
  async dispose() {if(this.busy) throw new Error('INFERENCE_IN_PROGRESS'); if(!this.closed){this.closed=true;await this.session.release();}}
}
