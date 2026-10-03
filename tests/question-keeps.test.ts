import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { migrate, openDatabase } from '../src/server/storage/database.ts';
import { Repository } from '../src/server/storage/repository.ts';
import { createAppServer } from '../src/server/http.ts';

function fixture() {
  const db=openDatabase(':memory:'),repo=new Repository(db),id=repo.createConversation('Keep').conversation_id;
  const user=repo.addUserTurn(id,'質問'),turn=repo.addMockRun(id,user.turn_id,'日本語😀回答').assistant;
  const h=repo.createHighlight(id,{turn_id:turn.turn_id,start_offset:0,end_offset:3,source_text:'日本語',target_text:'日本語',color:'yellow'});
  return {db,repo,id,h};
}
test('Keep 空/あり・1:N・複数Highlight・一覧・編集・取り下げ・復帰・削除、Run不変',()=>{
  const {db,repo,id,h}=fixture();try{
    const before=repo.detail(id),highlightBefore=repo.getHighlight(id,h.highlight_id);
    const a=repo.questionKeeps.create(id,{highlight_id:h.highlight_id});
    assert.equal(a.question_draft,'');assert.equal(a.memo,'');assert.equal(a.status,'pending');assert.equal(a.asked_at,null);
    const b=repo.questionKeeps.create(id,{highlight_id:h.highlight_id,question_draft:'なぜ？\r\n理由',memo:'メモ'});
    assert.equal(b.question_draft,'なぜ？\n理由');
    const second=repo.createHighlight(id,{turn_id:h.turn_id,start_offset:3,end_offset:5,source_text:'😀',target_text:'😀',color:'blue'});
    repo.questionKeeps.create(id,{highlight_id:second.highlight_id,memo:'メモだけ'});
    assert.equal(repo.questionKeeps.list(id).filter(k=>k.status==='pending').length,3);
    const edited=repo.questionKeeps.update(id,a.keep_id,{question_draft:'更新',memo:'説明'});assert.equal(edited.question_draft,'更新');
    assert.equal(repo.questionKeeps.update(id,a.keep_id,{status:'dismissed'}).status,'dismissed');
    assert.equal(repo.questionKeeps.list(id).filter(k=>k.status==='pending').length,2);
    assert.equal(repo.questionKeeps.update(id,a.keep_id,{status:'pending'}).status,'pending');
    repo.questionKeeps.delete(id,b.keep_id);assert.equal(repo.questionKeeps.list(id).length,2);
    assert.deepEqual(repo.detail(id),before);assert.deepEqual(repo.getHighlight(id,h.highlight_id),highlightBefore);
  }finally{db.close()}
});
test('Keep 会話外・不存在・unresolved拒否、既存Keepはunresolved化後も保持',()=>{
  const {db,repo,id,h}=fixture();try{
    const other=repo.createConversation('別').conversation_id,k=repo.questionKeeps.create(id,{highlight_id:h.highlight_id});
    assert.throws(()=>repo.questionKeeps.create(other,{highlight_id:h.highlight_id}));
    assert.throws(()=>repo.questionKeeps.create(id,{highlight_id:'missing'}));
    assert.throws(()=>repo.questionKeeps.update(other,k.keep_id,{memo:'x'}));assert.throws(()=>repo.questionKeeps.delete(other,k.keep_id));
    db.prepare("UPDATE highlights SET status='unresolved',reason='source_text不一致',updated_at='9999' WHERE highlight_id=?").run(h.highlight_id);
    assert.throws(()=>repo.questionKeeps.create(id,{highlight_id:h.highlight_id}),/unresolved/);
    assert.equal(repo.questionKeeps.list(id).length,1);
    assert.equal(repo.questionKeeps.update(id,k.keep_id,{memo:'参照要確認'}).memo,'参照要確認');
  }finally{db.close()}
});
test('Keep 不正入力とasked API遷移拒否、askedスキーマ整合性',()=>{
  const {db,repo,id,h}=fixture();try{
    for(const input of [{question_draft:17},{memo:'x'.repeat(10001)},{memo:'\0'}])assert.throws(()=>repo.questionKeeps.create(id,{highlight_id:h.highlight_id,...input}));
    const k=repo.questionKeeps.create(id,{highlight_id:h.highlight_id});
    assert.throws(()=>repo.questionKeeps.update(id,k.keep_id,{status:'asked'}));
    assert.throws(()=>db.prepare("UPDATE question_keeps SET status='asked',updated_at='9999' WHERE keep_id=?").run(k.keep_id));
    db.prepare("UPDATE question_keeps SET status='asked',asked_at='2026-09-14T00:00:00.000Z',updated_at='9999' WHERE keep_id=?").run(k.keep_id);
    assert.equal(repo.questionKeeps.get(id,k.keep_id).status,'asked');
    assert.throws(()=>repo.questionKeeps.update(id,k.keep_id,{status:'pending'}));
  }finally{db.close()}
});
test('Highlight削除は全Keepを同時削除、DB失敗では双方rollback',()=>{
  const {db,repo,id,h}=fixture();try{
    repo.questionKeeps.create(id,{highlight_id:h.highlight_id});const k=repo.questionKeeps.create(id,{highlight_id:h.highlight_id});
    repo.questionKeeps.update(id,k.keep_id,{status:'dismissed'});
    db.exec("CREATE TRIGGER fail_keep_delete BEFORE DELETE ON question_keeps BEGIN SELECT RAISE(ABORT,'test failure'); END");
    assert.throws(()=>repo.deleteHighlight(id,h.highlight_id));assert.equal(repo.listHighlights(id).length,1);assert.equal(repo.questionKeeps.list(id).length,2);
    db.exec('DROP TRIGGER fail_keep_delete');repo.deleteHighlight(id,h.highlight_id);assert.deepEqual(repo.questionKeeps.list(id),[]);
  }finally{db.close()}
});
test('Keep API CRUD、会話外/未知項目/asked拒否、保存失敗は非2xx',async()=>{
  const {db,repo,id,h}=fixture(),server=createAppServer(repo,resolve('dist'));server.listen(0,'127.0.0.1');await once(server,'listening');
  const path=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/conversations/${id}/question-keeps`;
  const request=(url:string,method:string,data?:unknown)=>fetch(url,{method,headers:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
  try{
    const created=await request(path,'POST',{highlight_id:h.highlight_id,question_draft:'',memo:''});assert.equal(created.status,201);const k=await created.json();
    assert.deepEqual(await(await fetch(path)).json(),[k]);
    assert.equal((await request(`${path}/${k.keep_id}`,'PATCH',{question_draft:'質問',status:'dismissed'})).status,200);
    assert.equal((await request(`${path}/${k.keep_id}`,'PATCH',{status:'asked'})).status,400);
    assert.equal((await request(path,'POST',{highlight_id:h.highlight_id,run_id:'x'})).status,400);
    const other=repo.createConversation('API別会話').conversation_id,otherPath=path.replace(id,other);
    assert.equal((await request(otherPath,'POST',{highlight_id:h.highlight_id})).status,404);
    assert.equal((await request(`${otherPath}/${k.keep_id}`,'PATCH',{memo:'x'})).status,404);
    assert.equal((await request(path,'POST',{highlight_id:'missing'})).status,404);
    assert.equal((await request(`${path}/${k.keep_id}`,'DELETE')).status,204);
    db.exec("CREATE TRIGGER fail_keep_insert BEFORE INSERT ON question_keeps BEGIN SELECT RAISE(ABORT,'test failure'); END");
    assert.equal((await request(path,'POST',{highlight_id:h.highlight_id})).status,500);assert.deepEqual(await(await fetch(path)).json(),[]);
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));db.close()}
});

test('Global Question Box read modelはConversation横断join・新着順・read-onlyを保つ',async()=>{
  const {db,repo,id,h}=fixture();
  const server=createAppServer(repo,resolve('dist'));
  try{
    const first=repo.questionKeeps.create(id,{highlight_id:h.highlight_id,question_draft:'最初の質問',memo:'A'});
    const secondConversation=repo.createConversation('別の会話').conversation_id;
    const user=repo.addUserTurn(secondConversation,'別の質問');
    const answer=repo.addMockRun(secondConversation,user.turn_id,'原文と表示引用').assistant;
    const secondHighlight=repo.createHighlight(secondConversation,{turn_id:answer.turn_id,start_offset:0,end_offset:2,source_text:'原文',target_text:'表示引用',color:'blue'});
    const second=repo.questionKeeps.create(secondConversation,{highlight_id:secondHighlight.highlight_id,question_draft:'新しい質問',memo:'B'});
    repo.createConversation('Keepなし');
    const before={conversations:repo.listConversations(),first:repo.questionKeeps.get(id,first.keep_id),second:repo.questionKeeps.get(secondConversation,second.keep_id)};

    const rows=repo.questionKeeps.listGlobal();
    assert.equal(rows.length,2);
    assert.equal(rows[0].keep.keep_id,second.keep_id);
    assert.deepEqual(new Set(rows.map(row=>row.conversation.title)),new Set(['Keep','別の会話']));
    assert(rows.every((row,index)=>index===0||rows[index-1].keep.created_at>=row.keep.created_at));
    const joined=rows.find(row=>row.keep.keep_id===second.keep_id)!;
    assert.equal(joined.conversation.conversation_id,secondConversation);
    assert.equal(joined.source_turn.turn_id,answer.turn_id);
    assert.equal(joined.source_turn.sequence_no,1);
    assert.equal(joined.highlight.source_text,'原文');
    assert.equal(joined.highlight.target_text,'表示引用');
    assert.deepEqual({conversations:repo.listConversations(),first:repo.questionKeeps.get(id,first.keep_id),second:repo.questionKeeps.get(secondConversation,second.keep_id)},before);

    server.listen(0,'127.0.0.1');await once(server,'listening');
    const response=await fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}/api/question-box`);
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),rows);
  }finally{
    server.closeAllConnections();if(server.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();
  }
});

test('003から004へのmigrationで既存Conversation/Turn/Run/Highlightを完全保持',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec('PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL) STRICT');
    for(const [i,file] of ['001_initial.sql','002_live_runs.sql','003_highlights.sql'].entries()){
      const sql=readFileSync(new URL(`../src/server/storage/migrations/${file}`,import.meta.url),'utf8').replace(/\r\n?/g,'\n');
      db.exec(sql);db.prepare('INSERT INTO schema_migrations VALUES(?,?,?)').run(i+1,createHash('sha256').update(sql).digest('hex'),new Date().toISOString());
    }
    const repo=new Repository(db),id=repo.createConversation('移行').conversation_id,u=repo.addUserTurn(id,'q'),a=repo.addMockRun(id,u.turn_id,'原文').assistant;
    repo.createHighlight(id,{turn_id:a.turn_id,start_offset:0,end_offset:2,source_text:'原文',target_text:'原文',color:'red'});
    const before={detail:repo.detail(id),highlights:repo.listHighlights(id)};
    migrate(db);
    assert.deepEqual({detail:repo.detail(id),highlights:repo.listHighlights(id)},before);
    assert.deepEqual(repo.questionKeeps.list(id),[]);
    repo.questionKeeps.create(id,{highlight_id:before.highlights[0].highlight_id});
  }finally{db.close()}
});
