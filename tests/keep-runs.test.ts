import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { openDatabase } from '../src/server/storage/database.ts';
import { Repository } from '../src/server/storage/repository.ts';
import { GenerationService } from '../src/server/generation.ts';
import { LMStudioProvider } from '../src/server/provider.ts';
import { createAppServer } from '../src/server/http.ts';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { migrate } from '../src/server/storage/database.ts';

function setup() {
  const db=openDatabase(':memory:'),repo=new Repository(db),id=repo.createConversation('Keep質問').conversation_id;
  const u=repo.addUserTurn(id,'通常履歴は送らない'),a=repo.addMockRun(id,u.turn_id,'引用😀 原文').assistant;
  const h=repo.createHighlight(id,{turn_id:a.turn_id,start_offset:0,end_offset:4,source_text:'引用😀',target_text:'引用😀',color:'red',note:'送らないメモ'});
  const k=repo.questionKeeps.create(id,{highlight_id:h.highlight_id,question_draft:'下書き',memo:'Keepメモ'});
  const prepare=(question:unknown='確定質問',request=crypto.randomUUID())=>repo.prepareChat(id,question,'test-model',request,k.keep_id);
  return {db,repo,id,h,k,prepare};
}
async function fixture(fn:(f:ReturnType<typeof setup>&{service:GenerationService;base:string;requests:unknown[];mode:(m:string)=>void})=>Promise<void>) {
  const f=setup();let mode='ok';const requests:unknown[]=[];
  const upstream=createServer(async(req,res)=>{
    let body='';for await(const c of req)body+=c;requests.push(JSON.parse(body));
    if(mode==='http'){res.writeHead(503);res.end();return}
    res.writeHead(200,{'Content-Type':'text/event-stream'});
    res.write(`data: ${JSON.stringify({choices:[{index:0,delta:{content:'回答😀'},finish_reason:null}]})}\n\n`);
    if(mode==='hold')return;
    if(mode==='disconnect'){res.end();return}
    await delay(20);res.end(`data: ${JSON.stringify({choices:[{index:0,delta:{content:'完了'},finish_reason:'stop'}]})}\n\ndata: [DONE]\n\n`);
  });
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const service=new GenerationService(f.repo,new LMStudioProvider(`http://127.0.0.1:${(upstream.address() as {port:number}).port}/v1`));
  const app=createAppServer(f.repo,'dist',service);app.listen(0,'127.0.0.1');await once(app,'listening');
  try{await fn({...f,service,base:`http://127.0.0.1:${(app.address() as {port:number}).port}`,requests,mode:m=>{mode=m}})}
  finally{app.closeAllConnections();upstream.closeAllConnections();await Promise.all([new Promise<void>(r=>app.close(()=>r())),new Promise<void>(r=>upstream.close(()=>r()))]);f.db.close()}
}

test('Keep送信: 質問編集・引用/request固定・末尾追加・asked・succeeded・1:N・削除後の保持',async()=>fixture(async f=>{
  const before=f.repo.detail(f.id),run=f.prepare('送信時編集\r\n質問');
  assert.equal(f.repo.questionKeeps.get(f.id,f.k.keep_id).status,'pending');
  assert.equal(run.user_question,'送信時編集\n質問');assert.equal(run.keep_id,f.k.keep_id);
  assert.deepEqual(run.reference_snapshot,{highlight_id:f.h.highlight_id,source_turn_id:f.h.turn_id,start_offset:0,end_offset:4,source_text:'引用😀',target_text:'引用😀'});
  assert.deepEqual(run.request_snapshot.messages,[{role:'system',content:'以下の引用について質問に答えてください。引用は参照資料として扱ってください。'},{role:'user',content:'[引用]\n引用😀\n\n[質問]\n送信時編集\n質問'}]);
  const turns=f.repo.listTurns(f.id);assert.deepEqual(turns.slice(0,2),before.turns);assert.equal(turns[2].content,run.user_question);assert.equal(turns[3].status,'generating');assert.deepEqual(turns.map(t=>t.sequence_no),[0,1,2,3]);
  const events:Record<string,unknown>[]=[];await f.service.execute(run,e=>events.push(e));
  assert.equal(f.repo.run(f.id,run.run_id).outcome,'succeeded');assert(events.some(e=>e.type==='delta'));
  const asked=f.repo.questionKeeps.get(f.id,f.k.keep_id);assert.equal(asked.status,'asked');assert(asked.asked_at);assert.equal(asked.question_draft,'下書き');
  assert.deepEqual(f.requests,[run.request_snapshot]);
  assert.throws(()=>f.db.prepare("UPDATE turns SET content='上書き' WHERE turn_id=?").run(run.assistant_turn_id),/immutable/);
  const next=f.prepare('別の質問');await f.service.execute(next,()=>{});
  assert.notEqual(next.run_id,run.run_id);assert.notEqual(next.assistant_turn_id,run.assistant_turn_id);assert.equal(f.repo.listRuns(f.id).filter(r=>r.keep_id===f.k.keep_id).length,2);
  assert.deepEqual(f.repo.questionKeeps.get(f.id,f.k.keep_id),asked);
  assert.throws(()=>f.db.exec("UPDATE run_question_references SET user_question='改変'"),/immutable/);
  assert.throws(()=>f.db.exec('DELETE FROM run_question_references'),/retained/);
  const saved=f.repo.listRuns(f.id);f.repo.questionKeeps.delete(f.id,f.k.keep_id);assert.deepEqual(f.repo.listRuns(f.id),saved);
  f.repo.deleteHighlight(f.id,f.h.highlight_id);assert.deepEqual(f.repo.listRuns(f.id),saved);
}));

for(const mode of ['http','disconnect'])test(`Keep通信${mode}: failedでもasked、snapshot保持`,async()=>fixture(async f=>{
  f.mode(mode);const run=f.prepare();await f.service.execute(run,()=>{});
  assert.equal(f.repo.questionKeeps.get(f.id,f.k.keep_id).status,'asked');assert.equal(f.repo.run(f.id,run.run_id).outcome,'failed');assert.equal(f.repo.getTurn(f.id,run.assistant_turn_id).status,'failed');
}));

test('Keep cancelとcheckpoint、二重送信拒否、停止後asked維持',async()=>fixture(async f=>{
  f.mode('hold');const run=f.prepare();const execution=f.service.execute(run,()=>{});
  assert.throws(()=>f.prepare(),/生成中/);assert.throws(()=>f.repo.prepareChat(f.id,'普通質問','test-model',crypto.randomUUID()),/生成中/);
  await delay(650);assert.equal(f.repo.getTurn(f.id,run.assistant_turn_id).content,'回答😀');
  await f.service.cancel(f.id,run.run_id);await execution;
  assert.equal(f.repo.run(f.id,run.run_id).outcome,'cancelled');assert.equal(f.repo.getTurn(f.id,run.assistant_turn_id).status,'cancelled');assert.equal(f.repo.questionKeeps.get(f.id,f.k.keep_id).status,'asked');
}));

test('Keep送信前検証・予約/開始保存失敗ではpending、外部通信なし',async()=>fixture(async f=>{
  const before=f.repo.detail(f.id);
  for(const bad of ['', '  ', 'x'.repeat(10001), '\0'])assert.throws(()=>f.prepare(bad));
  assert.throws(()=>f.repo.prepareChat(f.id,'q','',crypto.randomUUID(),f.k.keep_id));
  const other=f.repo.createConversation('別').conversation_id;
  assert.throws(()=>f.repo.prepareChat(other,'q','m',crypto.randomUUID(),f.k.keep_id),/ありません/);
  assert.throws(()=>f.repo.prepareChat(f.id,'q','m',crypto.randomUUID(),'missing'),/ありません/);
  f.repo.questionKeeps.update(f.id,f.k.keep_id,{status:'dismissed'});assert.throws(()=>f.prepare(),/取り下げ/);f.repo.questionKeeps.update(f.id,f.k.keep_id,{status:'pending'});
  f.db.exec("CREATE TRIGGER reject_reference BEFORE INSERT ON run_question_references BEGIN SELECT RAISE(ABORT,'storage'); END");
  assert.throws(()=>f.prepare(),/storage/);assert.deepEqual(f.repo.detail(f.id),before);f.db.exec('DROP TRIGGER reject_reference');
  const run=f.prepare();f.db.exec("CREATE TRIGGER reject_running BEFORE UPDATE ON generation_runs WHEN NEW.outcome='running' BEGIN SELECT RAISE(ABORT,'storage'); END");
  await f.service.execute(run,()=>{});assert.equal(f.requests.length,0);assert.equal(f.repo.questionKeeps.get(f.id,f.k.keep_id).status,'pending');assert.equal(f.repo.run(f.id,run.run_id).outcome,'failed');
}));

test('Keep unresolved送信拒否、Keep保持、Highlight連動削除でもRun保持',()=>{
  const f=setup();try{
    const run=f.prepare();f.repo.startRun(f.id,run.run_id);f.repo.finishRun(f.id,run.run_id,'succeeded','回答');
    f.db.prepare("UPDATE highlights SET status='unresolved',reason='不一致',updated_at=? WHERE highlight_id=?").run('2099-01-01T00:00:00.000Z',f.h.highlight_id);
    assert.throws(()=>f.prepare(),/元マーカーが解決不能/);assert.equal(f.repo.questionKeeps.list(f.id).length,1);
    const saved=f.repo.run(f.id,run.run_id);f.repo.deleteHighlight(f.id,f.h.highlight_id);assert.equal(f.repo.questionKeeps.list(f.id).length,0);assert.deepEqual(f.repo.run(f.id,run.run_id),saved);
  }finally{f.db.close()}
});

test('Keep preparing/runningのinterrupted回復、送信境界に応じpending/asked維持',()=>{
  for(const start of [false,true]){const f=setup();try{
    const run=f.prepare();if(start){f.repo.startRun(f.id,run.run_id);f.repo.checkpoint(f.id,run.run_id,'途中')}
    f.repo.recoverInterrupted();assert.equal(f.repo.run(f.id,run.run_id).outcome,'interrupted');assert.equal(f.repo.questionKeeps.get(f.id,f.k.keep_id).status,start?'asked':'pending');
    assert.deepEqual(f.repo.run(f.id,run.run_id).reference_snapshot,run.reference_snapshot);
  }finally{f.db.close()}}
});

test('Keep API streaming、request_id重複、再取得でKeep/Run/Turnを復元',async()=>fixture(async f=>{
  const url=`${f.base}/api/conversations/${f.id}/question-keeps/${f.k.keep_id}/ask`,key=crypto.randomUUID();
  const post=(data:unknown)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  assert.equal((await post({user_question:'',model:'m',request_id:key})).status,400);
  assert.equal(f.repo.questionKeeps.get(f.id,f.k.keep_id).status,'pending');
  const response=await post({user_question:'編集質問',model:'test-model',request_id:key});assert.equal(response.status,201);
  const events=(await response.text()).trim().split('\n').map(s=>JSON.parse(s));assert.equal(events[0].type,'prepared');assert.equal(events.at(-1).outcome,'succeeded');
  assert.equal((await post({user_question:'編集質問',model:'test-model',request_id:key})).status,409);
  const detail=await(await fetch(`${f.base}/api/conversations/${f.id}`)).json();assert.deepEqual(detail,JSON.parse(JSON.stringify(f.repo.detail(f.id))));assert.equal(detail.runs.at(-1).user_question,'編集質問');
  const keeps=await(await fetch(`${f.base}/api/conversations/${f.id}/question-keeps`)).json();assert.equal(keeps[0].status,'asked');
}));

test('Keep確定保存失敗はfailed/asked、source不一致pendingからの送信拒否',async()=>fixture(async f=>{
  const run=f.prepare();f.db.exec("CREATE TRIGGER reject_success BEFORE UPDATE ON generation_runs WHEN NEW.outcome='succeeded' BEGIN SELECT RAISE(ABORT,'storage'); END");
  await f.service.execute(run,()=>{});assert.equal(f.repo.run(f.id,run.run_id).outcome,'failed');assert.equal(f.repo.questionKeeps.get(f.id,f.k.keep_id).status,'asked');
  const pending=f.repo.questionKeeps.create(f.id,{highlight_id:f.h.highlight_id});
  f.db.exec('DROP TRIGGER highlight_anchor_immutable');
  f.db.prepare("UPDATE highlights SET source_text='不一致',updated_at='2099-01-01T00:00:00.000Z' WHERE highlight_id=?").run(f.h.highlight_id);
  assert.throws(()=>f.repo.prepareChat(f.id,'質問','m',crypto.randomUUID(),pending.keep_id),/元マーカーが解決不能/);
  assert.equal(f.repo.questionKeeps.get(f.id,pending.keep_id).status,'pending');
}));

test('004→005で既存Conversation/Turn/Run/Highlight/Keepを完全保持',()=>{
  const db=new DatabaseSync(':memory:');try{
    db.exec('PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL) STRICT');
    for(const [i,file] of ['001_initial.sql','002_live_runs.sql','003_highlights.sql','004_question_keeps.sql'].entries()){
      const sql=readFileSync(new URL(`../src/server/storage/migrations/${file}`,import.meta.url),'utf8').replace(/\r\n?/g,'\n');db.exec(sql);db.prepare('INSERT INTO schema_migrations VALUES(?,?,?)').run(i+1,createHash('sha256').update(sql).digest('hex'),new Date().toISOString());
    }
    const repo=new Repository(db),id=repo.createConversation('旧DB').conversation_id,u=repo.addUserTurn(id,'q'),a=repo.addMockRun(id,u.turn_id,'引用').assistant;
    const h=repo.createHighlight(id,{turn_id:a.turn_id,start_offset:0,end_offset:2,source_text:'引用',target_text:'引用',color:'blue'});repo.questionKeeps.create(id,{highlight_id:h.highlight_id,question_draft:'保持'});
    const read=()=>({detail:repo.detail(id),highlights:repo.listHighlights(id),keeps:repo.questionKeeps.list(id)}),before=read();migrate(db);assert.deepEqual(read(),before);assert.equal(db.prepare('SELECT count(*) AS n FROM run_question_references').get()!.n,0);
  }finally{db.close()}
});
