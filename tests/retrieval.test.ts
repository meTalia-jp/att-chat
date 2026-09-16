import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase } from '../src/server/storage/database.ts';
import { Repository } from '../src/server/storage/repository.ts';
import { RetrievalRepository } from '../src/retrieval/repository.ts';
import { RetrievalError,RetrievalService } from '../src/retrieval/service.ts';
import { createAppServer } from '../src/server/http.ts';

function fixture(){
  const db=openDatabase(':memory:'),chat=new Repository(db),a=chat.createConversation('会話A'),b=chat.createConversation('会話B'),now='2026-01-01T00:00:00.000Z';
  const insert=db.prepare('INSERT INTO turns VALUES(?,?,?,?,?,?,?,?)');
  insert.run('a0',a.conversation_id,0,'user','user 0','completed',now,now);
  insert.run('a1',a.conversation_id,1,'assistant','assistant 1','completed',now,now);
  insert.run('a4',a.conversation_id,4,'assistant','generating 4','generating',now,null);
  insert.run('a5',a.conversation_id,5,'assistant','failed 5','failed',now,now);
  insert.run('a6',a.conversation_id,6,'assistant','cancelled 6','cancelled',now,now);
  insert.run('a7',a.conversation_id,7,'user','user 7','completed',now,now);
  insert.run('a10',a.conversation_id,10,'assistant','assistant 10','completed',now,now);
  insert.run('b1',b.conversation_id,1,'assistant','assistant B1','completed',now,now);
  const service=new RetrievalService(new RetrievalRepository(db));
  return {db,chat,service,a,b};
}
async function useFixture(fn:(f:ReturnType<typeof fixture>)=>unknown){const f=fixture();try{await fn(f);}finally{f.db.close();}}
function expectCode(fn:()=>unknown,code:string){assert.throws(fn,(error:unknown)=>error instanceof RetrievalError&&error.code===code);}

test('S4 getTurn completed User/Assistantと自然なDTO',()=>useFixture(f=>{
  const user=f.service.getTurn('a0'),assistant=f.service.getTurn('a1');
  assert.deepEqual(user,{conversation_id:f.a.conversation_id,conversation_title:'会話A',turn_id:'a0',sequence_no:0,role:'user',status:'completed',content:'user 0',created_at:'2026-01-01T00:00:00.000Z',completed_at:'2026-01-01T00:00:00.000Z'});
  assert.equal(assistant.role,'assistant');assert.equal(assistant.content,'assistant 1');assert(!('finalized_at' in assistant));
}));
test('S4 getTurn not found / incomplete anchorを区別',()=>useFixture(f=>{
  expectCode(()=>f.service.getTurn('missing'),'TURN_NOT_FOUND');
  for(const id of ['a4','a5','a6'])expectCode(()=>f.service.getTurn(id),'INCOMPLETE_ANCHOR');
}));
test('S4 default前後1件、completed限定、sequence欠番を順序として扱う',()=>useFixture(f=>{
  const result=f.service.getTurnContext('a7');
  assert.deepEqual(result.turns.map(t=>t.turn_id),['a1','a7','a10']);
  assert.deepEqual(result.metadata,{before_requested:1,after_requested:1,before_returned:1,after_returned:1});
  assert.deepEqual(result.turns.map(t=>t.role),['assistant','user','assistant']);
}));
test('S4 before/after 0、両方0',()=>useFixture(f=>{
  assert.deepEqual(f.service.getTurnContext('a7',0,1).turns.map(t=>t.turn_id),['a7','a10']);
  assert.deepEqual(f.service.getTurnContext('a7',1,0).turns.map(t=>t.turn_id),['a1','a7']);
  const only=f.service.getTurnContext('a7',0,0);assert.deepEqual(only.turns.map(t=>t.turn_id),['a7']);assert.equal(only.metadata.before_returned,0);assert.equal(only.metadata.after_returned,0);
}));
test('S4 Conversation先頭/末尾boundaryと要求件数metadata',()=>useFixture(f=>{
  const first=f.service.getTurnContext('a0',10,3);assert.deepEqual(first.turns.map(t=>t.turn_id),['a0','a1','a7','a10']);assert.equal(first.metadata.before_returned,0);assert.equal(first.metadata.after_returned,3);
  const last=f.service.getTurnContext('a10',3,10);assert.deepEqual(last.turns.map(t=>t.turn_id),['a0','a1','a7','a10']);assert.equal(last.metadata.before_returned,3);assert.equal(last.metadata.after_returned,0);
}));
test('S4 cross-conversation非混入・別Conversation anchor',()=>useFixture(f=>{
  const a=f.service.getTurnContext('a7',10,10);assert(a.turns.every(t=>t.conversation_id===f.a.conversation_id));assert(!a.turns.some(t=>t.turn_id==='b1'));
  const b=f.service.getTurnContext('b1',10,10);assert.deepEqual(b.turns.map(t=>t.turn_id),['b1']);assert.equal(b.turns[0].conversation_title,'会話B');
}));
test('S4 deterministic ordering',()=>useFixture(f=>{
  const first=f.service.getTurnContext('a7',10,10),second=f.service.getTurnContext('a7',10,10);assert.deepEqual(first,second);
  assert.deepEqual(first.turns.map(t=>t.sequence_no),[0,1,7,10]);
}));
test('S4 before/after不正値はclampせず拒否',()=>useFixture(f=>{
  for(const value of [-1,11,1.5,NaN,'1',null])expectCode(()=>f.service.getTurnContext('a7',value,1),'INVALID_WINDOW');
  for(const value of [-1,11,1.5,Infinity,'1',null])expectCode(()=>f.service.getTurnContext('a7',1,value),'INVALID_WINDOW');
}));
test('S4 Conversation missing/inconsistentを区別',()=>useFixture(f=>{
  f.db.exec('PRAGMA foreign_keys=OFF');f.db.prepare('DELETE FROM conversations WHERE conversation_id=?').run(f.a.conversation_id);
  expectCode(()=>f.service.getTurn('a0'),'CONVERSATION_INCONSISTENT');
}));
test('S4 Retrievalは全アプリテーブルを完全read-only',()=>useFixture(f=>{
  const tables=(f.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{name:string}>).map(r=>r.name);
  const snapshot=()=>Object.fromEntries(tables.map(name=>[name,f.db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]));
  const before=snapshot();f.service.getTurn('a0');f.service.getTurnContext('a7',10,10);f.service.getTurnContext('b1',0,0);assert.deepEqual(snapshot(),before);
}));
test('S4 HTTP getTurn/context、default、same/cross UI用DTO',()=>useFixture(async f=>{
  const retrieval=new RetrievalService(new RetrievalRepository(f.db)),server=createAppServer(f.chat,'dist',undefined,undefined,retrieval);server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/retrieval/turns`;
  try{
    let response=await fetch(`${base}/a0`);assert.equal(response.status,200);assert.equal((await response.json()).content,'user 0');
    response=await fetch(`${base}/a7/context`);let body=await response.json();assert.deepEqual(body.turns.map((t:{turn_id:string})=>t.turn_id),['a1','a7','a10']);
    response=await fetch(`${base}/b1/context?before=10&after=10`);body=await response.json();assert.deepEqual(body.turns.map((t:{turn_id:string})=>t.turn_id),['b1']);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}));
test('S4 HTTP構造化error、query重複/未知項目/非整数/max超過',()=>useFixture(async f=>{
  const retrieval=new RetrievalService(new RetrievalRepository(f.db)),server=createAppServer(f.chat,'dist',undefined,undefined,retrieval);server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/retrieval/turns`;
  try{
    for(const [url,status,code] of [[`${base}/missing`,404,'TURN_NOT_FOUND'],[`${base}/a4/context`,409,'INCOMPLETE_ANCHOR'],[`${base}/a7/context?before=-1`,400,'INVALID_WINDOW'],[`${base}/a7/context?after=1.5`,400,'INVALID_WINDOW'],[`${base}/a7/context?after=11`,400,'INVALID_WINDOW'],[`${base}/a7/context?before=1&before=2`,400,'INVALID_WINDOW'],[`${base}/a7/context?unknown=1`,400,'INVALID_WINDOW']] as const){const response=await fetch(url);assert.equal(response.status,status);assert.equal((await response.json()).error.code,code);}
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}));
test('S4 DB errorはRetrieval入力errorと混同しない',()=>{
  const db=openDatabase(':memory:'),service=new RetrievalService(new RetrievalRepository(db));db.close();
  assert.throws(()=>service.getTurn('x'),error=>!(error instanceof RetrievalError)&&/closed|not open/i.test((error as Error).message));
});
