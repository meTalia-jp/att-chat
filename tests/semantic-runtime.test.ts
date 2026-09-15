import test from 'node:test';
import assert from 'node:assert/strict';

test('S1 実モデル契約（明示opt-in）',{skip:!process.env.ATTCHAT_S1_MODEL_DIR},async()=>{
  const {BuiltinPocProvider,spec}=await import('../src/semantic/poc/builtin-provider.ts');
  const {identifySpace}=await import('../src/semantic/space.ts');
  const provider=await BuiltinPocProvider.load(process.env.ATTCHAT_S1_MODEL_DIR!);
  try {
    const info=await provider.getModelInfo(); assert.equal(info.space_id,identifySpace(spec).space_id);
    const a=await provider.embed('過去の会話',{purpose:'query'}),b=await provider.embed('過去の会話',{purpose:'document'});
    assert.equal(a.ok,true); assert.equal(b.ok,true); assert.notDeepEqual(a,b);
    assert.deepEqual(a,await provider.embed('過去の会話',{purpose:'query'}));
    const long=await provider.embed('会話履歴 '.repeat(1000),{purpose:'document'}); assert.equal(long.ok,false);if(!long.ok)assert.equal(long.error.code,'INPUT_TOO_LONG');
    assert.ok(provider.countTokens('会話履歴 '.repeat(1000),'document')>512);
    let boundary=''; while(provider.countTokens(boundary+'a ','document')<=512) boundary+='a ';
    assert.equal(provider.countTokens(boundary,'document'),512);
    assert.equal((await provider.embed(boundary,{purpose:'document'})).ok,true);
    const edge=await provider.embed(boundary+'a ',{purpose:'document'}); assert.equal(edge.ok,false);if(!edge.ok)assert.equal(edge.error.code,'INPUT_TOO_LONG');
    const c=new AbortController();c.abort();const cancelled=await provider.embed('a',{purpose:'query',signal:c.signal});assert.equal(cancelled.ok,false);if(!cancelled.ok)assert.equal(cancelled.error.code,'CANCELLED');
    const running=new AbortController();const pending=provider.embed('長文 '.repeat(80),{purpose:'document',signal:running.signal});running.abort();const stopped=await pending;assert.equal(stopped.ok,false);if(!stopped.ok)assert.equal(stopped.error.code,'CANCELLED');
  }finally{await provider.dispose();}
});
