import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalSerialize, identifySpace } from '../src/semantic/space.ts';
import { validateEmbedding } from '../src/semantic/validation.ts';
import { FakeEmbeddingProvider, fakeSpec, type FakeMode } from './fixtures/fake-embedding-provider.ts';

test('S0 canonical key順・metadata除外・再現性',()=>{
  const reversed=Object.fromEntries(Object.entries(fakeSpec).reverse());
  assert.deepEqual(identifySpace({...fakeSpec,...reversed,prefixes:{document:'d:',query:'q:'}}),identifySpace(fakeSpec));
  assert.deepEqual(identifySpace({...fakeSpec,...{api_key:'secret',display_name:'name',created_at:'today'}}),identifySpace(fakeSpec));
  assert.equal(canonicalSerialize({b:2,a:{z:0,x:1}}),'{"a":{"x":1,"z":0},"b":2}');
  for(const bad of [undefined,NaN,Infinity,new Date(),[undefined]]) assert.throws(()=>canonicalSerialize(bad));
});
test('S0 identityの各仕様変更を別spaceとして識別',()=>{
  for(const key of ['provider','model','model_revision','tokenizer','quantization_artifact','pooling','normalization','preprocessing'] as const) assert.notEqual(identifySpace({...fakeSpec,[key]:'different'}).space_id,identifySpace(fakeSpec).space_id);
  for(const patch of [{dimensions:8},{input_token_limit:64},{prefixes:{query:'new:',document:'d:'}},{prefixes:{query:'q:',document:'new:'}}]) assert.notEqual(identifySpace({...fakeSpec,...patch}).space_id,identifySpace(fakeSpec).space_id);
  assert.throws(()=>identifySpace({...fakeSpec,dimensions:0}));
  assert.throws(()=>identifySpace({...fakeSpec,input_token_limit:1.2}));
  assert.throws(()=>identifySpace({...fakeSpec,...{long_text_policy:'truncate'}} as unknown as typeof fakeSpec));
  assert.throws(()=>identifySpace({...fakeSpec,...{space_spec_version:2}} as unknown as typeof fakeSpec));
});
test('S0 同一入力は決定的・query/document用途・入力不変',async()=>{
  const provider=new FakeEmbeddingProvider(); const info=await provider.getModelInfo();
  const query=await provider.embed('日本語😀',{purpose:'query'});
  assert.deepEqual(query,await provider.embed('日本語😀',{purpose:'query'}));
  const doc=await provider.embed('日本語😀',{purpose:'document'}); assert.notDeepEqual(query,doc);
  const valid=validateEmbedding(query,info); assert.equal(valid.ok,true);
  if(valid.ok && query.ok){ query.vector.fill(0); assert.ok(valid.vector.some(n=>n!==0)); }
  await provider.dispose(); assert.equal((await provider.embed('q',{purpose:'query'})).ok,false);
});
for(const [mode,code] of [['dimensions','INVALID_VECTOR'],['nan','INVALID_VECTOR'],['infinity','INVALID_VECTOR'],['zero','INVALID_VECTOR'],['space','SPACE_MISMATCH'],['INPUT_TOO_LONG','INPUT_TOO_LONG'],['MODEL_UNAVAILABLE','MODEL_UNAVAILABLE'],['PROVIDER_ERROR','PROVIDER_ERROR'],['CANCELLED','CANCELLED']] as const) {
  test(`S0 ${mode} 拒否・構造化失敗`,async()=>{
    const provider=new FakeEmbeddingProvider(mode as FakeMode);
    const result=validateEmbedding(await provider.embed('q',{purpose:'query'}),await provider.getModelInfo());
    assert.equal(result.ok,false); if(!result.ok) assert.equal(result.error.code,code);
  });
}
test('S0 token上限とtruncate禁止・非Float32Array拒否',async()=>{
  const provider=new FakeEmbeddingProvider(),info=await provider.getModelInfo();
  assert.equal((await provider.embed('a'.repeat(30),{purpose:'query'})).ok,true);
  const over=await provider.embed('a'.repeat(31),{purpose:'query'}); assert.equal(over.ok,false); if(!over.ok)assert.equal(over.error.code,'INPUT_TOO_LONG');
  const good=await provider.embed('a',{purpose:'query'});
  for(const patch of [{vector:[1,2,3,4]},{vector:new Float64Array(4)},{vector:new Float32Array(0)},{truncated:true},{input_tokens:33},{input_tokens:-1}]) assert.equal(validateEmbedding({...good,...patch},info).ok,false);
  assert.equal(validateEmbedding({ok:false,error:{code:'UNKNOWN',retryable:true}},info).ok,false);
});
test('S0 AbortSignal既中断・処理中cancel',async()=>{
  const provider=new FakeEmbeddingProvider(),controller=new AbortController();
  const pending=provider.embed('a',{purpose:'query',signal:controller.signal}); controller.abort();
  const r=await pending; assert.equal(r.ok,false); if(!r.ok)assert.equal(r.error.code,'CANCELLED');
  assert.deepEqual(await provider.embed('a',{purpose:'query',signal:controller.signal}),r);
});
test('S0 localityとProvider/model/revision情報の保持',async()=>{
  for(const locality of ['in_process_local','loopback','external'] as const){
    const info=await new FakeEmbeddingProvider('normal',locality).getModelInfo();
    assert.equal(info.locality,locality); assert.equal(info.provider_id,'fake'); assert.equal(info.model_id,'fixture'); assert.equal(info.revision,'1'); assert.equal(info.dimensions,4); assert.equal(info.input_token_limit,32);
  }
});
