import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { once } from 'node:events';
import { openDatabase } from '../src/server/storage/database.ts';
import { Repository } from '../src/server/storage/repository.ts';
import { createAppServer } from '../src/server/http.ts';

const content='日本語😀同じ 同じ ABCD';
function draft(turnId:string,start:number,end:number,color='yellow',note=''){return{turn_id:turnId,start_offset:start,end_offset:end,source_text:content.slice(start,end),target_text:content.slice(start,end),color,note};}
function fixture(fn:(repo:Repository,db:ReturnType<typeof openDatabase>)=>void){const db=openDatabase(':memory:');try{fn(new Repository(db),db)}finally{db.close()}}

test('日本語・絵文字・同じ語の別位置・4色・メモ有無・隣接を保存',()=>fixture((repo)=>{
 const id=repo.createConversation('markers').conversation_id,user=repo.addUserTurn(id,'q'),assistant=repo.addMockRun(id,user.turn_id,content).assistant;
 const values=[[0,3,'yellow',''],[3,5,'red','絵文字メモ'],[5,7,'green',''],[8,10,'blue','同じ語の2番目']] as const;
 const saved=values.map(([s,e,color,note])=>repo.createHighlight(id,draft(assistant.turn_id,s,e,color,note)));
 assert.deepEqual(saved.map(h=>[h.start_offset,h.end_offset,h.color,h.note,h.status]),values.map(v=>[...v,'resolved']));
 assert.equal(repo.listHighlights(id).length,4); assert.equal(saved[1].source_text,'😀'); assert.equal(saved[3].source_text,'同じ');
}));
test('別Turnの同文は独立、複数マーカー保存、重複・包含・完全一致拒否',()=>fixture((repo)=>{
 const id=repo.createConversation('same').conversation_id,u=repo.addUserTurn(id,'q'),a=repo.addMockRun(id,u.turn_id,content).assistant,u2=repo.addUserTurn(id,'q2'),b=repo.addMockRun(id,u2.turn_id,content).assistant;
 repo.createHighlight(id,draft(a.turn_id,0,3)); repo.createHighlight(id,draft(b.turn_id,0,3,'blue'));
 for(const [s,e] of [[0,3],[0,2],[1,3]])assert.throws(()=>repo.createHighlight(id,draft(a.turn_id,s,e)),/重複/);
 assert.equal(repo.listHighlights(id).length,2);
}));
test('User・generating・cancelled・failedとgrapheme途中を拒否',()=>fixture((repo)=>{
 const id=repo.createConversation('states').conversation_id,user=repo.addUserTurn(id,content);
 assert.throws(()=>repo.createHighlight(id,draft(user.turn_id,0,3)),/確定assistant/);
 const generating=repo.prepareChat(id,'q','model',crypto.randomUUID());
 assert.throws(()=>repo.createHighlight(id,draft(generating.assistant_turn_id,0,3)),/確定assistant/);
 repo.finishRun(id,generating.run_id,'cancelled','日本語😀同じ 同じ ABCD',{code:'x'});
 assert.throws(()=>repo.createHighlight(id,draft(generating.assistant_turn_id,0,3)),/確定assistant/);
 const failed=repo.prepareChat(id,'q2','model',crypto.randomUUID());repo.finishRun(id,failed.run_id,'failed',content,{code:'x'});
 assert.throws(()=>repo.createHighlight(id,draft(failed.assistant_turn_id,0,3)),/確定assistant/);
 const u=repo.addUserTurn(id,'q3'),assistant=repo.addMockRun(id,u.turn_id,content).assistant;
 assert.throws(()=>repo.createHighlight(id,draft(assistant.turn_id,3,4)),/文字の途中/);
}));
test('編集は色・メモだけ、anchor不変、削除',()=>fixture((repo,db)=>{
 const id=repo.createConversation('edit').conversation_id,u=repo.addUserTurn(id,'q'),a=repo.addMockRun(id,u.turn_id,content).assistant,h=repo.createHighlight(id,draft(a.turn_id,0,3));
 const changed=repo.updateHighlight(id,h.highlight_id,{color:'red',note:'更新\r\nメモ'});assert.equal(changed.color,'red');assert.equal(changed.note,'更新\nメモ');assert.equal(changed.source_text,'日本語');
 assert.throws(()=>db.exec("UPDATE highlights SET start_offset=1,updated_at='9999-01-01T00:00:00.000Z'"),/immutable/);repo.deleteHighlight(id,h.highlight_id);assert.deepEqual(repo.listHighlights(id),[]);
}));
test('source_text不一致は位置を動かさずunresolved、原文復帰でも自動修復しない',()=>fixture((repo,db)=>{
 const id=repo.createConversation('unresolved').conversation_id,u=repo.addUserTurn(id,'q'),a=repo.addMockRun(id,u.turn_id,content).assistant,h=repo.createHighlight(id,draft(a.turn_id,0,3));
 db.exec('DROP TRIGGER turns_final_immutable');db.prepare('UPDATE turns SET content=? WHERE turn_id=?').run('変更後😀同じ 同じ ABCD',a.turn_id);
 let restored=repo.getHighlight(id,h.highlight_id);assert.equal(restored.status,'unresolved');assert.equal(restored.reason,'source_text不一致');assert.equal(restored.start_offset,0);
 db.prepare('UPDATE turns SET content=? WHERE turn_id=?').run(content,a.turn_id);restored=repo.getHighlight(id,h.highlight_id);assert.equal(restored.status,'unresolved');
}));
test('ファイルDBのclose/reopenで同じ位置・4色・メモを復元',()=>{
 const dir=mkdtempSync(join(tmpdir(),'attchat-2a-')),path=join(dir,'markers.sqlite');let db=openDatabase(path);
 try{let repo=new Repository(db),id=repo.createConversation('persist').conversation_id,u=repo.addUserTurn(id,'q'),a=repo.addMockRun(id,u.turn_id,content).assistant,ranges=[[0,3],[3,5],[5,7],[8,10]];for(const [i,color]of(['yellow','red','green','blue'] as const).entries())repo.createHighlight(id,draft(a.turn_id,ranges[i][0],ranges[i][1],color,`m${i}`));const before=repo.listHighlights(id);db.close();db=openDatabase(path);repo=new Repository(db);assert.deepEqual(repo.listHighlights(id),before)}finally{db.close();const target=resolve(dir);if(!target.startsWith(resolve(tmpdir())+sep+'attchat-2a-'))throw new Error('unsafe');rmSync(target,{recursive:true,force:true})}
});
test('Highlight APIの作成・取得・編集・削除と未知項目拒否',async()=>{
 const db=openDatabase(':memory:'),repo=new Repository(db),server=createAppServer(repo,resolve('dist'));server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${(server.address()as{port:number}).port}`;
 try{const id=repo.createConversation('api').conversation_id,u=repo.addUserTurn(id,'q'),a=repo.addMockRun(id,u.turn_id,content).assistant,path=`${base}/api/conversations/${id}/highlights`;const request=(url:string,method:string,data?:unknown)=>fetch(url,{method,headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined});
  const created=await request(path,'POST',draft(a.turn_id,0,3));assert.equal(created.status,201);const h=await created.json();assert.equal((await(await fetch(path)).json()).length,1);assert.equal((await request(`${path}/${h.highlight_id}`,'PATCH',{color:'blue',note:'api'})).status,200);assert.equal((await request(path,'POST',{...draft(a.turn_id,3,5),extra:true})).status,400);assert.equal((await request(`${path}/${h.highlight_id}`,'DELETE')).status,204);assert.deepEqual(await(await fetch(path)).json(),[]);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));db.close()}
});
