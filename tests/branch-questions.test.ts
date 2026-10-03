import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { openDatabase, migrate } from '../src/server/storage/database.ts';
import { Repository } from '../src/server/storage/repository.ts';
import { GenerationService } from '../src/server/generation.ts';
import { LMStudioProvider } from '../src/server/provider.ts';
import { createAppServer } from '../src/server/http.ts';

function seed(db:DatabaseSync) {
  const repo=new Repository(db),id=repo.createConversation('元会話').conversation_id;
  const u=repo.addUserTurn(id,'コピーしない元履歴'),a=repo.addMockRun(id,u.turn_id,'引用😀').assistant;
  const h=repo.createHighlight(id,{turn_id:a.turn_id,start_offset:0,end_offset:4,source_text:'引用😀',target_text:'引用😀',color:'blue',note:'送信しないメモ'});
  const k=repo.questionKeeps.create(id,{highlight_id:h.highlight_id,question_draft:'元下書き'});
  const prepare=(q:unknown='編集した質問',key:string=crypto.randomUUID())=>repo.prepareChat(id,q,'test-model',key,k.keep_id,true);
  return {db,repo,id,h,k,prepare};
}
async function fixture(fn:(f:ReturnType<typeof seed>&{service:GenerationService;requests:unknown[];mode:(m:string)=>void;base:string})=>Promise<void>) {
  const f=seed(openDatabase(':memory:'));let mode='ok';const requests:unknown[]=[];
  const upstream=createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;requests.push(JSON.parse(body));
    if(mode==='http'){res.writeHead(503);res.end();return}
    res.writeHead(200,{'Content-Type':'text/event-stream'});
    res.write(`data: ${JSON.stringify({choices:[{index:0,delta:{content:'途中😀'},finish_reason:null}]})}\n\n`);
    if(mode==='hold')return;if(mode==='disconnect'){res.end();return}
    await delay(20);res.end(`data: ${JSON.stringify({choices:[{index:0,delta:{content:'完了'},finish_reason:'stop'}]})}\n\ndata: [DONE]\n\n`);
  });
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const service=new GenerationService(f.repo,new LMStudioProvider(`http://127.0.0.1:${(upstream.address() as {port:number}).port}/v1`));
  const app=createAppServer(f.repo,'dist',service);app.listen(0,'127.0.0.1');await once(app,'listening');
  try{await fn({...f,service,requests,mode:m=>{mode=m},base:`http://127.0.0.1:${(app.address() as {port:number}).port}`})}
  finally{app.closeAllConnections();upstream.closeAllConnections();await Promise.all([new Promise<void>(r=>app.close(()=>r())),new Promise<void>(r=>upstream.close(()=>r()))]);f.db.close()}
}

test('新会話分岐: pending予約・所属・v2 snapshot・質問確定・元Turn保持・succeeded',async()=>fixture(async f=>{
  const before=f.repo.detail(f.id),run=f.prepare('質問\r\n編集😀');const dest=run.conversation_id;
  assert.notEqual(dest,f.id);assert.equal(f.repo.listConversations().length,2);
  assert.equal(f.repo.getConversation(dest).title,'質問: 質問 編集😀');
  assert.deepEqual(f.repo.detail(f.id),before);assert.deepEqual(f.repo.getHighlight(f.id,f.h.highlight_id),f.h);assert.deepEqual(f.repo.questionKeeps.get(f.id,f.k.keep_id),f.k);
  assert.equal(f.repo.listTurns(dest).length,2);assert.deepEqual(f.repo.listTurns(dest).map(t=>[t.sequence_no,t.role,t.status]),[[0,'user','completed'],[1,'assistant','generating']]);
  assert(f.repo.listTurns(dest).every(t=>t.conversation_id===dest));assert.equal(f.repo.listHighlights(dest).length,0);assert.equal(f.repo.questionKeeps.list(dest).length,0);
  assert.equal(run.user_question,'質問\n編集😀');assert.equal(run.strategy_version,'2');assert.equal(run.context_strategy,'quote_question_only');
  assert.deepEqual(run.reference_snapshot,{snapshot_version:2,source_conversation_id:f.id,source_highlight_id:f.h.highlight_id,highlight_id:f.h.highlight_id,source_turn_id:f.h.turn_id,start_offset:0,end_offset:4,source_text:'引用😀',target_text:'引用😀'});
  assert.deepEqual(run.request_snapshot.messages,[{role:'system',content:'以下の引用について質問に答えてください。引用は参照資料として扱ってください。'},{role:'user',content:'[引用]\n引用😀\n\n[質問]\n質問\n編集😀'}]);
  await f.service.execute(run,()=>{});assert.equal(f.repo.run(dest,run.run_id).outcome,'succeeded');assert.deepEqual(f.requests,[run.request_snapshot]);
  assert.equal(f.repo.questionKeeps.get(f.id,f.k.keep_id).status,'asked');assert.equal(f.repo.questionKeeps.get(f.id,f.k.keep_id).question_draft,'元下書き');
  assert.deepEqual(f.repo.detail(f.id),before);assert.deepEqual(f.repo.listQuestionRuns(f.id),[f.repo.run(dest,run.run_id)]);assert.deepEqual(f.repo.listQuestionRuns(dest),[]);
  assert.throws(()=>f.db.prepare("UPDATE turns SET content='変更' WHERE turn_id=?").run(run.user_turn_id),/immutable/);
}));

test('同じKeepから元会話・新会話・別の新会話へ1:N、旧snapshot不変',async()=>fixture(async f=>{
  const local=f.repo.prepareChat(f.id,'元会話で質問','test-model',crypto.randomUUID(),f.k.keep_id,false,undefined,'standard');await f.service.execute(local,()=>{});
  const saved=f.repo.run(f.id,local.run_id),asked=f.repo.questionKeeps.get(f.id,f.k.keep_id);
  const first=f.prepare();await f.service.execute(first,()=>{});const second=f.prepare('再質問');await f.service.execute(second,()=>{});
  assert.notEqual(first.conversation_id,second.conversation_id);assert.equal(f.repo.listConversations().length,3);
  assert.equal(f.repo.listQuestionRuns(f.id).length,3);assert.deepEqual(f.repo.run(f.id,local.run_id),saved);assert.equal(saved.strategy_version,'1');assert.equal(saved.reference_snapshot?.snapshot_version,undefined);
  assert.deepEqual(f.repo.questionKeeps.get(f.id,f.k.keep_id),asked);
  f.repo.deleteHighlight(f.id,f.h.highlight_id);assert.equal(f.repo.questionKeeps.list(f.id).length,0);assert.equal(f.repo.listQuestionRuns(f.id).length,3);assert.deepEqual(f.repo.run(f.id,local.run_id),saved);
}));

test('分岐の検証失敗とrequest_id重複で空Conversationなし',async()=>fixture(async f=>{
  const before=f.repo.listConversations();
  for(const q of ['', ' ', '\0', 'x'.repeat(10001)])assert.throws(()=>f.prepare(q));
  assert.throws(()=>f.prepare('質問','bad'));assert.throws(()=>f.repo.prepareChat(f.id,'質問','',crypto.randomUUID(),f.k.keep_id,true));
  assert.throws(()=>f.repo.prepareChat(f.id,'質問','m',crypto.randomUUID(),'missing',true));
  f.repo.questionKeeps.update(f.id,f.k.keep_id,{status:'dismissed'});assert.throws(()=>f.prepare(),/取り下げ/);f.repo.questionKeeps.update(f.id,f.k.keep_id,{status:'pending'});
  f.db.prepare("UPDATE highlights SET status='unresolved',reason='不一致',updated_at='2099-01-01T00:00:00.000Z' WHERE highlight_id=?").run(f.h.highlight_id);
  assert.throws(()=>f.prepare(),/解決不能/);assert.deepEqual(f.repo.listConversations(),before);assert.equal(f.repo.questionKeeps.get(f.id,f.k.keep_id).status,'pending');assert.equal(f.requests.length,0);
}));

for(const table of ['conversations','turns','generation_runs','run_question_references','chat_requests'])test(`分岐予約 ${table} INSERT失敗は全rollback`,async()=>fixture(async f=>{
  const before=f.repo.detail(f.id);f.db.exec(`CREATE TRIGGER fail_reservation BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'storage'); END`);
  assert.throws(()=>f.prepare(),/storage/);assert.equal(f.repo.listConversations().length,1);assert.deepEqual(f.repo.detail(f.id),before);assert.deepEqual(f.repo.questionKeeps.get(f.id,f.k.keep_id),f.k);assert.equal(f.requests.length,0);
}));

test('分岐生成中Keep排他、通常active制約、同一request_id再送拒否',async()=>fixture(async f=>{
  const key=crypto.randomUUID(),run=f.prepare('質問',key);
  assert.throws(()=>f.prepare(),/生成中/);assert.throws(()=>f.repo.prepareChat(f.id,'同会話','m',crypto.randomUUID(),f.k.keep_id,false,undefined,'standard'),/生成中/);assert.equal(f.repo.listConversations().length,2);
  assert.throws(()=>f.repo.prepareChat(run.conversation_id,'通常','m',crypto.randomUUID()),/生成中/);
  await f.service.execute(run,()=>{});assert.throws(()=>f.prepare('質問',key),/送信済み/);assert.equal(f.repo.listConversations().length,2);
}));

for(const mode of ['http','disconnect'])test(`分岐${mode}はfailed・元Keep asked維持`,async()=>fixture(async f=>{
  f.mode(mode);const run=f.prepare();await f.service.execute(run,()=>{});assert.equal(f.repo.run(run.conversation_id,run.run_id).outcome,'failed');assert.equal(f.repo.questionKeeps.get(f.id,f.k.keep_id).status,'asked');
}));

test('分岐cancelとcheckpointは分岐先Turnへ保存',async()=>fixture(async f=>{
  f.mode('hold');const run=f.prepare(),execution=f.service.execute(run,()=>{});await delay(650);
  assert.equal(f.repo.getTurn(run.conversation_id,run.assistant_turn_id).content,'途中😀');await f.service.cancel(run.conversation_id,run.run_id);await execution;
  assert.equal(f.repo.run(run.conversation_id,run.run_id).outcome,'cancelled');assert.equal(f.repo.questionKeeps.get(f.id,f.k.keep_id).status,'asked');
}));

test('分岐開始前DB失敗はpending・通信なし、全書込不能はstorage_error後interrupted',async()=>fixture(async f=>{
  const run=f.prepare();f.db.exec("CREATE TRIGGER fail_start BEFORE UPDATE ON generation_runs WHEN NEW.outcome='running' BEGIN SELECT RAISE(ABORT,'storage'); END");
  await f.service.execute(run,()=>{});assert.equal(f.repo.questionKeeps.get(f.id,f.k.keep_id).status,'pending');assert.equal(f.requests.length,0);assert.equal(f.repo.run(run.conversation_id,run.run_id).outcome,'failed');
  f.db.exec('DROP TRIGGER fail_start');const second=f.prepare();f.db.exec('PRAGMA query_only=ON');const events:Record<string,unknown>[]=[];await f.service.execute(second,e=>events.push(e));assert.equal(events.at(-1)?.type,'storage_error');
  f.db.exec('PRAGMA query_only=OFF');f.repo.recoverInterrupted();assert.equal(f.repo.run(second.conversation_id,second.run_id).outcome,'interrupted');assert.equal(f.repo.questionKeeps.get(f.id,f.k.keep_id).status,'pending');
}));

test('分岐APIはpreparedでdestinationを返し、再取得でsource/destination復元',async()=>fixture(async f=>{
  const response=await fetch(`${f.base}/api/conversations/${f.id}/question-keeps/${f.k.keep_id}/ask-new`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_question:'API質問',model:'test-model',request_id:crypto.randomUUID()})});
  assert.equal(response.status,201);const events=(await response.text()).trim().split('\n').map(v=>JSON.parse(v));const run=events[0].run;
  assert.notEqual(run.conversation_id,f.id);assert.equal(events.at(-1).outcome,'succeeded');assert(events.some(e=>e.type==='delta'));
  const runs=await(await fetch(`${f.base}/api/conversations/${f.id}/question-runs`)).json();assert.equal(runs.length,1);assert.equal(runs[0].conversation_id,run.conversation_id);
  const detail=await(await fetch(`${f.base}/api/conversations/${run.conversation_id}`)).json();assert.equal(detail.turns.length,2);assert.equal(detail.runs[0].reference_snapshot.source_conversation_id,f.id);
}));

test('005→006でv1 Run/snapshotを含む既存データ完全保持、v2の出典偽装を拒否',()=>{
  const db=new DatabaseSync(':memory:');try{
    db.exec('PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL) STRICT');
    for(const [i,file] of ['001_initial.sql','002_live_runs.sql','003_highlights.sql','004_question_keeps.sql','005_keep_runs.sql'].entries()){
      const sql=readFileSync(new URL(`../src/server/storage/migrations/${file}`,import.meta.url),'utf8').replace(/\r\n?/g,'\n');db.exec(sql);db.prepare('INSERT INTO schema_migrations VALUES(?,?,?)').run(i+1,createHash('sha256').update(sql).digest('hex'),new Date().toISOString());
    }
    const f=seed(db),r=f.repo.prepareChat(f.id,'v1','m',crypto.randomUUID(),f.k.keep_id,false,undefined,'standard');f.repo.startRun(f.id,r.run_id);f.repo.finishRun(f.id,r.run_id,'succeeded','回答');
    const read=()=>({detail:f.repo.detail(f.id),highlights:f.repo.listHighlights(f.id),keeps:f.repo.questionKeeps.list(f.id)}),before=read();migrate(db);assert.deepEqual(read(),before);
    const branch=f.prepare();assert.equal(branch.reference_snapshot?.snapshot_version,2);
    const reference=db.prepare('SELECT * FROM run_question_references WHERE run_id=?').get(branch.run_id)!;
    db.exec('DROP TRIGGER question_reference_retained');db.prepare('DELETE FROM run_question_references WHERE run_id=?').run(branch.run_id);
    const bad={...branch.reference_snapshot,source_conversation_id:branch.conversation_id};
    assert.throws(()=>db.prepare('INSERT INTO run_question_references VALUES(?,?,?,?,?,?)').run(reference.run_id!,reference.keep_id!,reference.source_highlight_id!,reference.source_turn_id!,reference.user_question!,JSON.stringify(bad)),/invalid_question_reference/);
  }finally{db.close()}
});
