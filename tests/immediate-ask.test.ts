import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, migrate } from '../src/server/storage/database.ts';
import { Repository } from '../src/server/storage/repository.ts';
import { GenerationService } from '../src/server/generation.ts';
import { LMStudioProvider } from '../src/server/provider.ts';
import { createAppServer } from '../src/server/http.ts';
import type { Highlight, MarkerReferenceSnapshot } from '../src/shared/contracts.ts';
import { immediateAskContextStrategy, immediateAskStrategyVersion, upsertImmediateAskReference } from '../src/shared/production-immediate-ask.ts';

test('Composer stateは同一Markerを置換し、通常draftと独立して5件上限を守る',()=>{
  const initial=Array.from({length:5},(_,index)=>({highlightId:`h${index}`,question:`q${index}`}));
  const replaced=upsertImmediateAskReference(initial,{highlightId:'h2',question:'置換'});
  assert.equal(replaced.accepted,true);assert.equal(replaced.replaced,true);assert.equal(replaced.items.length,5);assert.equal(replaced.items[2].question,'置換');
  const rejected=upsertImmediateAskReference(replaced.items,{highlightId:'h5',question:'6件目'});
  assert.equal(rejected.accepted,false);assert.deepEqual(rejected.items,replaced.items);
  const normalDraft='通常draftは参照解除後も保持';
  const remaining=replaced.items.filter(item=>item.highlightId!=='h2');
  assert.equal(normalDraft,'通常draftは参照解除後も保持');assert.equal(remaining.length,4);
});

const words=['Alpha','Beta','Gamma','Delta','Epsilon','Zeta'];
function seed(count=6,path=':memory:'){
  const db=openDatabase(path),repo=new Repository(db),conversationId=repo.createConversation('Immediate Ask').conversation_id;
  const oldUser=repo.addUserTurn(conversationId,'古い質問'),oldAssistant=repo.addMockRun(conversationId,oldUser.turn_id,'OldMarker を説明します。').assistant;
  const oldStart=oldAssistant.content.indexOf('OldMarker');
  const oldHighlight=repo.createHighlight(conversationId,{turn_id:oldAssistant.turn_id,start_offset:oldStart,end_offset:oldStart+'OldMarker'.length,source_text:'OldMarker',target_text:'OldMarker',color:'yellow',note:''});
  const user=repo.addUserTurn(conversationId,'最新の質問'),assistant=repo.addMockRun(conversationId,user.turn_id,words.join(' / ')).assistant;
  const highlights=words.slice(0,count).map((word,index)=>{const start=assistant.content.indexOf(word);return repo.createHighlight(conversationId,{turn_id:assistant.turn_id,start_offset:start,end_offset:start+word.length,source_text:word,target_text:word,color:(['yellow','red','green','blue'] as const)[index%4],note:''})});
  const items=(n:number)=>highlights.slice(0,n).map((highlight,index)=>({highlight_id:highlight.highlight_id,prefix:(['質問','しかし…','意見'] as const)[index%3],question_text:`質問 ${index+1}`}));
  return {db,repo,conversationId,user,assistant,highlights,oldHighlight,items};
}
function snapshot(f:ReturnType<typeof seed>,highlight:Highlight,prefix:'質問'|'しかし…'|'意見'):MarkerReferenceSnapshot{
  return {snapshot_version:1,source_conversation_id:f.conversationId,source_conversation_title:'Immediate Ask',source_turn_id:f.assistant.turn_id,source_turn_sequence_no:f.assistant.sequence_no,source_turn_role:'assistant',source_highlight_id:highlight.highlight_id,start_offset:highlight.start_offset,end_offset:highlight.end_offset,source_text:highlight.source_text,target_text:highlight.target_text,color:highlight.color,prefix};
}

for(const count of [1,2,5])test(`Immediate Ask ${count}件を1 Runへ順序付き保存`,()=>{
  const f=seed();try{
    const run=f.repo.prepareImmediateAsk(f.conversationId,'通常draft',f.items(count),'model',crypto.randomUUID());
    assert.equal(run.kind,'highlight_question');assert.equal(run.context_strategy,immediateAskContextStrategy);assert.equal(run.strategy_version,immediateAskStrategyVersion);
    assert.deepEqual(run.marker_references?.map(ref=>ref.reference_no),Array.from({length:count},(_,index)=>index));
    assert.deepEqual(run.marker_references?.map(ref=>ref.source_highlight_id),f.highlights.slice(0,count).map(h=>h.highlight_id));
    assert.equal(f.repo.questionKeeps.list(f.conversationId).length,0);
    const turns=f.repo.listTurns(f.conversationId),surface=turns.at(-2)!.content;
    assert.equal(surface.startsWith('通常draft\n\n[質問]\n「Alpha」\n質問 1'),true);
    assert(!surface.includes(f.highlights[0].highlight_id));assert(!surface.includes('start_offset'));
    const messages=run.request_snapshot.messages as Array<{role:string;content:string}>;
    assert.deepEqual(messages.map(message=>message.role),['system','user']);assert.equal(messages.length,2);
    assert.match(messages[1].content,/## 通常メッセージ/);assert.match(messages[1].content,/## Marker質問 1/);
  }finally{f.db.close()}
});

test('Marker-only送信、6件・重複拒否、DB schema自体は6件目を許容',()=>{
  const f=seed();try{
    const before=f.repo.detail(f.conversationId);
    assert.throws(()=>f.repo.prepareImmediateAsk(f.conversationId,'',f.items(6),'m',crypto.randomUUID()),/1〜5件/);
    assert.throws(()=>f.repo.prepareImmediateAsk(f.conversationId,'',[f.items(1)[0],f.items(1)[0]],'m',crypto.randomUUID()),/重複/);
    assert.deepEqual(f.repo.detail(f.conversationId),before);
    const run=f.repo.prepareImmediateAsk(f.conversationId,'',f.items(5),'m',crypto.randomUUID());
    assert.equal(f.repo.getTurn(f.conversationId,run.user_turn_id).content.startsWith('[質問]\n「Alpha」'),true);
    const sixth=f.highlights[5],sixthSnapshot=snapshot(f,sixth,'意見');
    f.db.prepare('INSERT INTO run_marker_references VALUES(?,?,?,?,?,?,?,?)').run(run.run_id,5,f.conversationId,f.assistant.turn_id,sixth.highlight_id,'意見','schema limitなし',JSON.stringify(sixthSnapshot));
    assert.equal(f.repo.run(f.conversationId,run.run_id).marker_references?.length,6);
  }finally{f.db.close()}
});

test('過去・unresolved・User Turn・Conversation外Markerをserver再検証で拒否',()=>{
  const f=seed(),other=seed();try{
    assert.throws(()=>f.repo.prepareImmediateAsk(f.conversationId,'',[{highlight_id:f.oldHighlight.highlight_id,prefix:'質問',question_text:'過去'}],'m',crypto.randomUUID()),/最新/);
    f.db.prepare("UPDATE highlights SET status='unresolved',reason='test',updated_at='9999' WHERE highlight_id=?").run(f.highlights[0].highlight_id);
    assert.throws(()=>f.repo.prepareImmediateAsk(f.conversationId,'',[{highlight_id:f.highlights[0].highlight_id,prefix:'質問',question_text:'未解決'}],'m',crypto.randomUUID()),/確認できない/);
    f.db.exec('DROP TRIGGER highlight_insert_validate');
    f.db.prepare("INSERT INTO highlights VALUES(?,?,?,?,?,?,?,?,?,?,'resolved',NULL)").run('user-marker',f.user.turn_id,0,2,f.user.content.slice(0,2),f.user.content.slice(0,2),'blue','',new Date().toISOString(),new Date().toISOString());
    assert.throws(()=>f.repo.prepareImmediateAsk(f.conversationId,'',[{highlight_id:'user-marker',prefix:'質問',question_text:'User'}],'m',crypto.randomUUID()),/確認できない/);
    assert.throws(()=>f.repo.prepareImmediateAsk(f.conversationId,'',[{highlight_id:other.highlights[0].highlight_id,prefix:'質問',question_text:'他会話'}],'m',crypto.randomUUID()),/ありません/);
  }finally{f.db.close();other.db.close()}
});

test('ordinal、immutable、retained、Keep参照との相互排他をDB triggerで保証',()=>{
  const f=seed();try{
    const keep=f.repo.questionKeeps.create(f.conversationId,{highlight_id:f.highlights[0].highlight_id,question_draft:'keep'});
    const immediate=f.repo.prepareImmediateAsk(f.conversationId,'',f.items(1),'m',crypto.randomUUID()),row=immediate.marker_references![0];
    assert.throws(()=>f.db.prepare('INSERT INTO run_marker_references VALUES(?,?,?,?,?,?,?,?)').run(immediate.run_id,2,row.source_conversation_id,row.source_turn_id,row.source_highlight_id,row.prefix,row.question_text,JSON.stringify(row.reference_snapshot)),/ordinal/);
    assert.throws(()=>f.db.prepare('INSERT INTO run_question_references VALUES(?,?,?,?,?,?)').run(immediate.run_id,keep.keep_id,f.highlights[0].highlight_id,f.assistant.turn_id,'混在','{}'),/mixed/);
    assert.throws(()=>f.db.exec("UPDATE run_marker_references SET question_text='変更'"),/immutable/);
    assert.throws(()=>f.db.exec('DELETE FROM run_marker_references'),/retained/);
  }finally{f.db.close()}
  const g=seed();try{
    const keep=g.repo.questionKeeps.create(g.conversationId,{highlight_id:g.highlights[0].highlight_id,question_draft:'keep'});
    const keepRun=g.repo.prepareChat(g.conversationId,'質問','m',crypto.randomUUID(),keep.keep_id,false,undefined,'standard');
    const h=g.highlights[0];
    assert.throws(()=>g.db.prepare('INSERT INTO run_marker_references VALUES(?,?,?,?,?,?,?,?)').run(keepRun.run_id,0,g.conversationId,g.assistant.turn_id,h.highlight_id,'質問','混在',JSON.stringify(snapshot(g,h,'質問'))),/mixed/);
  }finally{g.db.close()}
});

test('参照途中INSERT失敗はTurn・Run・request・全参照をrollback',()=>{
  const f=seed();try{
    const before=f.repo.detail(f.conversationId);
    f.db.exec("CREATE TRIGGER reject_second_marker BEFORE INSERT ON run_marker_references WHEN NEW.reference_no=1 BEGIN SELECT RAISE(ABORT,'injected'); END");
    assert.throws(()=>f.repo.prepareImmediateAsk(f.conversationId,'draft',f.items(2),'m',crypto.randomUUID()),/injected/);
    assert.deepEqual(f.repo.detail(f.conversationId),before);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM run_marker_references').get()!.n,0);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM chat_requests').get()!.n,0);
  }finally{f.db.close()}
});

async function providerFixture(mode:'success'|'failure'|'hold',action:(f:ReturnType<typeof seed>&{service:GenerationService;requests:any[]})=>Promise<void>){
  const f=seed(),requests:any[]=[];
  const upstream=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;requests.push(JSON.parse(body));if(mode==='failure'){res.writeHead(503);res.end();return}res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(`data: ${JSON.stringify({choices:[{index:0,delta:{content:'回答'},finish_reason:null}]})}\n\n`);if(mode==='hold')return;res.end(`data: ${JSON.stringify({choices:[{index:0,delta:{content:'完了'},finish_reason:'stop'}]})}\n\ndata: [DONE]\n\n`)});
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening');const service=new GenerationService(f.repo,new LMStudioProvider(`http://127.0.0.1:${(upstream.address() as {port:number}).port}/v1`));
  try{await action({...f,service,requests})}finally{upstream.closeAllConnections();await new Promise<void>(resolve=>upstream.close(()=>resolve()));f.db.close()}
}

test('Provider request=snapshot、成功/失敗で参照保持・Keep非作成',async()=>{
  for(const mode of ['success','failure'] as const)await providerFixture(mode,async f=>{
    const run=f.repo.prepareImmediateAsk(f.conversationId,'draft',f.items(2),'test-model',crypto.randomUUID());await f.service.execute(run,()=>{});
    const saved=f.repo.run(f.conversationId,run.run_id);assert.deepEqual(f.requests,[run.request_snapshot]);assert.equal(saved.marker_references?.length,2);
    assert.equal(saved.outcome,mode==='success'?'succeeded':'failed');assert.equal(f.repo.questionKeeps.list(f.conversationId).length,0);
  });
});

test('cancel / interruptedでも参照を保持',async()=>{
  await providerFixture('hold',async f=>{
    const run=f.repo.prepareImmediateAsk(f.conversationId,'',f.items(1),'m',crypto.randomUUID()),execution=f.service.execute(run,()=>{});
    await new Promise(resolve=>setTimeout(resolve,40));await f.service.cancel(f.conversationId,run.run_id);await execution;
    assert.equal(f.repo.run(f.conversationId,run.run_id).outcome,'cancelled');assert.equal(f.repo.run(f.conversationId,run.run_id).marker_references?.length,1);
  });
  const f=seed();try{const run=f.repo.prepareImmediateAsk(f.conversationId,'',f.items(1),'m',crypto.randomUUID());f.repo.startRun(f.conversationId,run.run_id);f.repo.recoverInterrupted();const saved=f.repo.run(f.conversationId,run.run_id);assert.equal(saved.outcome,'interrupted');assert.equal(saved.marker_references?.length,1)}finally{f.db.close()}
});

test('Marker削除後もRun reference snapshotを復元',()=>{
  const f=seed();try{
    const run=f.repo.prepareImmediateAsk(f.conversationId,'',f.items(1),'m',crypto.randomUUID());f.repo.startRun(f.conversationId,run.run_id);f.repo.finishRun(f.conversationId,run.run_id,'succeeded','回答');
    const before=f.repo.run(f.conversationId,run.run_id).marker_references;f.repo.deleteHighlight(f.conversationId,f.highlights[0].highlight_id);
    assert.deepEqual(f.repo.run(f.conversationId,run.run_id).marker_references,before);assert.equal(f.repo.listHighlights(f.conversationId).some(h=>h.highlight_id===f.highlights[0].highlight_id),false);
  }finally{f.db.close()}
});

test('DB close / reopen後もImmediate Ask参照を順序付きで復元',()=>{
  const directory=mkdtempSync(join(tmpdir(),'attchat-immediate-')),path=join(directory,'attchat.sqlite');
  let f=seed(2,path);const id=f.conversationId;
  try{
    const run=f.repo.prepareImmediateAsk(id,'再起動確認',f.items(2),'m',crypto.randomUUID());f.repo.startRun(id,run.run_id);f.repo.finishRun(id,run.run_id,'succeeded','回答');
    const before=f.repo.run(id,run.run_id).marker_references;f.db.close();
    const db=openDatabase(path);try{const saved=new Repository(db).run(id,run.run_id);assert.deepEqual(saved.marker_references,before);assert.deepEqual(saved.marker_references?.map(item=>item.reference_no),[0,1])}finally{db.close()}
  }finally{try{f.db.close()}catch{}rmSync(directory,{recursive:true,force:true})}
});

test('Immediate Ask HTTP endpointはstreamingし、6件を非書込みで拒否',async()=>providerFixture('success',async f=>{
  const app=createAppServer(f.repo,'dist',f.service);app.listen(0,'127.0.0.1');await once(app,'listening');const base=`http://127.0.0.1:${(app.address() as {port:number}).port}`;
  try{
    const request=(items:unknown,key=crypto.randomUUID())=>fetch(`${base}/api/conversations/${f.conversationId}/immediate-ask`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({main_draft:'',marker_questions:items,model:'test-model',request_id:key})});
    const before=f.repo.detail(f.conversationId),bad=await request(f.items(6));assert.equal(bad.status,400);assert.deepEqual(f.repo.detail(f.conversationId),before);
    const response=await request(f.items(2));assert.equal(response.status,201);const events=(await response.text()).trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(events[0].run.context_strategy,immediateAskContextStrategy);assert.equal(events.at(-1).outcome,'succeeded');
  }finally{app.closeAllConnections();await new Promise<void>(resolve=>app.close(()=>resolve()))}
}));

test('007→008 migrationは既存データとKeep question referenceを保持',()=>{
  const db=new DatabaseSync(':memory:');try{
    db.exec('PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL) STRICT');
    const files=['001_initial.sql','002_live_runs.sql','003_highlights.sql','004_question_keeps.sql','005_keep_runs.sql','006_branch_questions.sql','007_semantic_index.sql'];
    files.forEach((file,index)=>{const sql=readFileSync(new URL(`../src/server/storage/migrations/${file}`,import.meta.url),'utf8').replace(/\r\n?/g,'\n');db.exec(sql);db.prepare('INSERT INTO schema_migrations VALUES(?,?,?)').run(index+1,createHash('sha256').update(sql).digest('hex'),new Date().toISOString())});
    const repo=new Repository(db),id=repo.createConversation('旧DB').conversation_id,u=repo.addUserTurn(id,'q'),a=repo.addMockRun(id,u.turn_id,'引用').assistant,h=repo.createHighlight(id,{turn_id:a.turn_id,start_offset:0,end_offset:2,source_text:'引用',target_text:'引用',color:'blue'}),k=repo.questionKeeps.create(id,{highlight_id:h.highlight_id,question_draft:'保持'}),run=repo.prepareChat(id,'質問','m',crypto.randomUUID(),k.keep_id,false,undefined,'standard');
    const before=JSON.parse(JSON.stringify({detail:repo.detail(id),keeps:repo.questionKeeps.list(id),highlights:repo.listHighlights(id)}));migrate(db);
    assert.deepEqual(JSON.parse(JSON.stringify({detail:repo.detail(id),keeps:repo.questionKeeps.list(id),highlights:repo.listHighlights(id)})),before);
    assert.equal(db.prepare('SELECT count(*) AS n FROM run_marker_references').get()!.n,0);assert.equal(repo.run(id,run.run_id).keep_id,k.keep_id);
  }finally{db.close()}
});
