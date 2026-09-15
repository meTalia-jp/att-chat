import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { JSDOM } from 'jsdom';
import { openDatabase } from '../src/server/storage/database.ts';
import { Repository } from '../src/server/storage/repository.ts';
import { SemanticIndexRepository } from '../src/semantic/index-repository.ts';
import { SemanticSearchService, cosine } from '../src/semantic/search.ts';
import { buildSearchQuery } from '../src/semantic/search-query.ts';
import { FakeEmbeddingProvider,fakeSpec } from './fixtures/fake-embedding-provider.ts';
import { createAppServer } from '../src/server/http.ts';
import { jumpToTurn,locateTurn } from '../src/client/turn-navigation.ts';

async function fixture(fn:(f:Awaited<ReturnType<typeof setup>>)=>unknown){const f=await setup();try{await fn(f);}finally{f.db.close();}}
async function setup(){
  const db=openDatabase(':memory:'),chat=new Repository(db),repo=new SemanticIndexRepository(db),provider=new FakeEmbeddingProvider();
  const a=chat.createConversation('A').conversation_id,b=chat.createConversation('B').conversation_id;
  const user=chat.addUserTurn(a,'query'),assistant=chat.addMockRun(a,user.turn_id,'前文。引用。後文。').assistant;
  const h=chat.createHighlight(a,{turn_id:assistant.turn_id,start_offset:3,end_offset:5,source_text:'引用',target_text:'表示引用',color:'yellow',note:''});
  const other=chat.addUserTurn(b,'another');chat.addMockRun(b,other.turn_id,'another answer');
  const space=repo.registerSpace(fakeSpec);repo.supplement(space);
  let lease;while((lease=repo.claim(space)))repo.saveReady(lease,{ok:true,space_id:space,vector:new Float32Array([1,0,0,0]),input_tokens:5,truncated:false});
  const calls:Array<{text:string;purpose:string}>=[];
  provider.embed=async(text,options)=>{calls.push({text,purpose:options.purpose});return {ok:true,space_id:space,vector:new Float32Array([1,0,0,0]),input_tokens:5,truncated:false};};
  const service=new SemanticSearchService(repo,chat,async()=>({provider,spec:fakeSpec}));
  return {db,chat,repo,provider,space,a,b,user,assistant,h,other,service,calls};
}
test('S3 Q1 target_text・query purpose・default current/self除外/coverage',()=>fixture(async f=>{
  const result=await f.service.search(f.a,f.h.highlight_id,{});
  assert.deepEqual(f.calls,[{text:'表示引用',purpose:'query'}]);assert.deepEqual(result.results.map(r=>r.turn_id),[f.user.turn_id]);
  assert.equal(result.options.top_k,5);assert.equal(result.coverage.ready,4);assert.equal(result.results[0].score,1);
}));
test('S3 Q2 同Turn文脈とtarget、Q1とは独立',()=>fixture(async f=>{
  const result=await f.service.search(f.a,f.h.highlight_id,{variant:'Q2'});
  assert.equal(result.query_text,'前文。表示引用。後文。');assert.equal(f.calls[0].purpose,'query');
  assert.equal(f.chat.getTurn(f.a,f.assistant.turn_id).content,'前文。引用。後文。');
}));
test('S3 Q2 grapheme inward slice、前後150以内',()=>fixture(f=>{
  const text='😀'.repeat(100)+'引用'+'e\u0301'.repeat(100),turn={...f.assistant,content:text};
  const h={...f.h,start_offset:200,end_offset:202,source_text:'引用',target_text:'引用'};
  const q=buildSearchQuery(turn,h,'Q2');assert.equal(q.length,302);assert.equal(q,'😀'.repeat(75)+'引用'+'e\u0301'.repeat(75));
  assert.throws(()=>buildSearchQuery(turn,{...h,start_offset:199},'Q2'));
}));
test('S3 All Conversations / role / top_k / deterministic tie',()=>fixture(async f=>{
  const all=await f.service.search(f.a,f.h.highlight_id,{scope:'all'});assert.equal(all.results.length,3);assert(all.results.some(r=>r.conversation_id===f.b));
  assert.deepEqual((await f.service.search(f.a,f.h.highlight_id,{scope:'all'})).results,all.results);
  assert.equal((await f.service.search(f.a,f.h.highlight_id,{scope:'all',top_k:1})).results.length,1);
  assert.equal((await f.service.search(f.a,f.h.highlight_id,{scope:'all',role:'assistant'})).results.length,1);
  assert.equal((await f.service.search(f.a,f.h.highlight_id,{scope:'all',role:'user'})).results.length,2);
  assert.equal((await f.service.search(f.a,f.h.highlight_id,{role:'assistant'})).results.length,0);
}));
test('S3 top_k範囲・variant・role・scopeの不正値拒否',()=>fixture(async f=>{
  for(const options of [{top_k:0},{top_k:11},{top_k:1.5},{top_k:'5'},{variant:'Q3'},{variant:['Q1']},{role:['all']},{role:'system'},{scope:'other'}])await assert.rejects(f.service.search(f.a,f.h.highlight_id,options));
  assert.equal(f.calls.length,0);
}));
for(const state of ['pending','failed','stale','missing'])test(`S3 ${state}除外`,()=>fixture(async f=>{
  if(state==='missing')f.db.prepare('DELETE FROM turn_embeddings WHERE turn_id=?').run(f.user.turn_id);
  else f.db.prepare('UPDATE turn_embeddings SET status=?,vector=NULL WHERE turn_id=?').run(state,f.user.turn_id);
  const result=await f.service.search(f.a,f.h.highlight_id,{});assert.equal(result.results.length,0);assert.equal(result.coverage[state as 'pending'|'failed'|'stale'|'missing'],1);
}));
test('S3 異space readyだけでは検索されない、検索開始spaceを固定',()=>fixture(async f=>{
  const otherSpec={...fakeSpec,model_revision:'other'},other=f.repo.registerSpace(otherSpec);f.repo.supplement(other);
  let lease;while((lease=f.repo.claim(other)))f.repo.saveReady(lease,{ok:true,space_id:other,vector:new Float32Array([1,0,0,0]),input_tokens:1,truncated:false});
  f.db.prepare('DELETE FROM turn_embeddings WHERE space_id=?').run(f.space);
  let calls=0;const service=new SemanticSearchService(f.repo,f.chat,async()=>{calls++;return {provider:f.provider,spec:fakeSpec};});
  assert.equal((await service.search(f.a,f.h.highlight_id,{scope:'all'})).results.length,0);assert.equal(calls,1);
}));
test('S3 cosine・score降順・thresholdなし',()=>fixture(async f=>{
  assert.equal(cosine(new Float32Array([1,0]),new Float32Array([0,1])),0);assert.equal(cosine(new Float32Array([1,0]),new Float32Array([-1,0])),-1);
  const vector=Buffer.alloc(16);vector.writeFloatLE(-1,0);f.db.prepare('UPDATE turn_embeddings SET vector=? WHERE turn_id=?').run(vector,f.user.turn_id);
  const result=await f.service.search(f.a,f.h.highlight_id,{scope:'all'});assert.equal(result.results.at(-1)!.score,-1);
}));
test('S3 unresolved拒否・会話またぎsource偽装拒否',()=>fixture(async f=>{
  await assert.rejects(f.service.search(f.b,f.h.highlight_id,{}));
  f.db.prepare("UPDATE highlights SET status='unresolved',reason='test',updated_at=? WHERE highlight_id=?").run(new Date(Date.now()+1000).toISOString(),f.h.highlight_id);
  await assert.rejects(f.service.search(f.a,f.h.highlight_id,{}));assert.equal(f.calls.length,0);
}));
test('S3 Provider失敗・cancel・busy',()=>fixture(async f=>{
  f.provider.embed=async()=>({ok:false,error:{code:'INPUT_TOO_LONG',retryable:false}});
  await assert.rejects(f.service.search(f.a,f.h.highlight_id,{}),/INPUT_TOO_LONG/);
  let release!:()=>void;
  f.provider.embed=async()=>{await new Promise<void>(r=>release=r);return {ok:true,space_id:f.space,vector:new Float32Array([1,0,0,0]),input_tokens:1,truncated:false};};
  const controller=new AbortController(),pending=f.service.search(f.a,f.h.highlight_id,{},controller.signal);
  await new Promise(r=>setImmediate(r));await assert.rejects(f.service.search(f.a,f.h.highlight_id,{}),/実行中/);
  controller.abort();release();await assert.rejects(pending,/中断/);
}));
test('S3 HTTP DTOにvectorなし・検索によるTurn/Run不変',()=>fixture(async f=>{
  const server=createAppServer(f.chat,'dist',undefined,f.service);server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const before=f.chat.detail(f.a),port=(server.address() as {port:number}).port;
    const response=await fetch(`http://127.0.0.1:${port}/api/conversations/${f.a}/highlights/${f.h.highlight_id}/related-turns`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope:'all'})});
    assert.equal(response.status,200);const dto=await response.json();
    for(const row of dto.results)assert.deepEqual(Object.keys(row).sort(),['conversation_id','conversation_title','turn_id','sequence_no','role','excerpt','score','space_id','source_hash'].sort());
    assert.equal(JSON.stringify(dto).includes('"vector":'),false);assert.deepEqual(f.chat.detail(f.a),before);
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
}));
test('S3 same / cross conversation Turn Jump、同文取り違えなし',()=>{
  const dom=new JSDOM('<main><article data-turn="a">同文</article><article data-turn="b">同文</article></main>');
  try{
    const root=dom.window.document.querySelector('main')!;let scrolled='';
    dom.window.HTMLElement.prototype.scrollIntoView=function(){scrolled=this.dataset.turn!;};
    const clear=jumpToTurn(root,'b');assert.equal(scrolled,'b');assert(locateTurn(root,'b')?.classList.contains('related-turn-active'));clear();
    root.innerHTML='<article data-turn="cross">別会話の同文</article>';jumpToTurn(root,'cross');assert.equal(scrolled,'cross');assert.throws(()=>jumpToTurn(root,'b'));
  }finally{dom.window.close();}
});
