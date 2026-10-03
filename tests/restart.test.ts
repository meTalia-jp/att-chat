import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { openDatabase } from '../src/server/storage/database.ts';
import { Repository } from '../src/server/storage/repository.ts';

async function launch(path: string): Promise<{ child: ChildProcess; base: string }> {
  const child = spawn(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('../src/server/main.ts', import.meta.url))], {env:{...process.env,ATTCHAT_DB:path,ATTCHAT_PORT:'0'},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
  return new Promise((accept,reject) => {
    let errors=''; child.stderr!.on('data',chunk=>errors+=chunk.toString());
    const timer=setTimeout(()=>{child.kill();reject(new Error(`Server timeout: ${errors}`));},10000);
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Server exit ${code}: ${errors}`));});
    child.once('message',message=>{clearTimeout(timer);accept({child,base:`http://127.0.0.1:${(message as {port:number}).port}`});});
  });
}
async function stop(child: ChildProcess) { if (child.exitCode !== null || child.signalCode !== null) return; const exited=once(child,'exit'); child.kill('SIGKILL'); await exited; }
test('分岐先と出典を別プロセス再起動後も復元、未完了分岐をinterrupted化',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'attchat-restart-')),path=join(dir,'app.sqlite');let active:ChildProcess|undefined;
  try{
    const db=openDatabase(path),repo=new Repository(db),pairs:{source:string;dest:string;state:string}[]=[];
    for(const state of ['succeeded','running','preparing']){
      const id=repo.createConversation(state).conversation_id,u=repo.addUserTurn(id,'元質問'),a=repo.addMockRun(id,u.turn_id,'引用').assistant;
      const h=repo.createHighlight(id,{turn_id:a.turn_id,start_offset:0,end_offset:2,source_text:'引用',target_text:'引用',color:'green'}),k=repo.questionKeeps.create(id,{highlight_id:h.highlight_id});
      const run=repo.prepareChat(id,'分岐質問','m',crypto.randomUUID(),k.keep_id,true);pairs.push({source:id,dest:run.conversation_id,state});
      if(state!=='preparing'){repo.startRun(run.conversation_id,run.run_id);repo.checkpoint(run.conversation_id,run.run_id,'途中')}
      if(state==='succeeded')repo.finishRun(run.conversation_id,run.run_id,'succeeded','回答');
    }
    const before=pairs.map(p=>JSON.parse(JSON.stringify({source:repo.detail(p.source),dest:repo.detail(p.dest),keeps:repo.questionKeeps.list(p.source)})));db.close();
    const first=await launch(path);active=first.child;
    const read=async(base:string,p:{source:string;dest:string})=>({source:await(await fetch(`${base}/api/conversations/${p.source}`)).json(),dest:await(await fetch(`${base}/api/conversations/${p.dest}`)).json(),keeps:await(await fetch(`${base}/api/conversations/${p.source}/question-keeps`)).json()});
    const after=await Promise.all(pairs.map(p=>read(first.base,p)));assert.deepEqual(after[0],before[0]);
    for(const i of [1,2]){assert.deepEqual(after[i].source,before[i].source);assert.deepEqual(after[i].keeps,before[i].keeps);assert.equal(after[i].dest.runs[0].outcome,'interrupted');assert.deepEqual(after[i].dest.runs[0].reference_snapshot,before[i].dest.runs[0].reference_snapshot)}
    assert.equal(after[1].keeps[0].status,'asked');assert.equal(after[2].keeps[0].status,'pending');
    await stop(active);active=undefined;const second=await launch(path);active=second.child;assert.deepEqual(await Promise.all(pairs.map(p=>read(second.base,p))),after);
  }finally{if(active)await stop(active);const target=resolve(dir);if(!target.startsWith(resolve(tmpdir())+sep+'attchat-restart-'))throw new Error('Unsafe cleanup');rmSync(target,{recursive:true,force:true})}
});
test('Keep質問は別プロセス再起動でasked/Run/Turn/引用を保持しrunningをinterruptedへ整理', async () => {
  const dir=mkdtempSync(join(tmpdir(),'attchat-restart-')),path=join(dir,'app.sqlite');let active:ChildProcess|undefined;
  try {
    const db=openDatabase(path),repo=new Repository(db),ids:string[]=[];
    for(const state of ['succeeded','running','preparing']) {
      const id=repo.createConversation(state).conversation_id;ids.push(id);
      const user=repo.addUserTurn(id,'元質問'),assistant=repo.addMockRun(id,user.turn_id,'引用').assistant;
      const h=repo.createHighlight(id,{turn_id:assistant.turn_id,start_offset:0,end_offset:2,source_text:'引用',target_text:'引用',color:'yellow'});
      const k=repo.questionKeeps.create(id,{highlight_id:h.highlight_id,question_draft:'下書き'});
      const run=repo.prepareChat(id,'確定質問','test-model',crypto.randomUUID(),k.keep_id,false,undefined,'standard');
      if(state!=='preparing'){repo.startRun(id,run.run_id);repo.checkpoint(id,run.run_id,'途中')}
      if(state==='succeeded')repo.finishRun(id,run.run_id,'succeeded','回答');
    }
    const before=ids.map(id=>JSON.parse(JSON.stringify({detail:repo.detail(id),keeps:repo.questionKeeps.list(id)})));db.close();
    const first=await launch(path);active=first.child;
    const read=async(base:string,id:string)=>({detail:await(await fetch(`${base}/api/conversations/${id}`)).json(),keeps:await(await fetch(`${base}/api/conversations/${id}/question-keeps`)).json()});
    const after=await Promise.all(ids.map(id=>read(first.base,id)));
    assert.deepEqual(after[0],before[0]);
    for(const i of [1,2]){assert.equal(after[i].detail.runs.at(-1).outcome,'interrupted');assert.deepEqual(after[i].detail.runs.at(-1).reference_snapshot,before[i].detail.runs.at(-1).reference_snapshot);assert.deepEqual(after[i].keeps,before[i].keeps)}
    assert.equal(after[1].keeps[0].status,'asked');assert.equal(after[2].keeps[0].status,'pending');
    await stop(active);active=undefined;const second=await launch(path);active=second.child;
    assert.deepEqual(await Promise.all(ids.map(id=>read(second.base,id))),after);
  } finally {if(active)await stop(active);const target=resolve(dir);if(!target.startsWith(resolve(tmpdir())+sep+'attchat-restart-'))throw new Error('Unsafe cleanup');rmSync(target,{recursive:true,force:true})}
});
test('新プロセス起動でpreparing/runningをinterruptedへ整理し自動再送しない', async () => {
  const dir=mkdtempSync(join(tmpdir(),'attchat-restart-')), path=join(dir,'app.sqlite'); let active: ChildProcess | undefined;
  try {
    const db=openDatabase(path), repo=new Repository(db), ids: string[]=[];
    for (const state of ['preparing','running']) {
      const id=repo.createConversation(state).conversation_id; ids.push(id);
      const run=repo.prepareChat(id,'q','test-model',crypto.randomUUID());
      if(state==='running') { repo.startRun(id,run.run_id); repo.checkpoint(id,run.run_id,'保存済み途中本文'); }
    }
    db.close(); const server=await launch(path); active=server.child;
    for(const id of ids) {
      const detail=await (await fetch(server.base+`/api/conversations/${id}`)).json();
      assert.equal(detail.runs.length,1); assert.equal(detail.runs[0].outcome,'interrupted'); assert.equal(detail.turns[1].status,'failed');
      if(detail.conversation.title==='running')assert.equal(detail.turns[1].content,'保存済み途中本文');
    }
  } finally { if(active)await stop(active); const target=resolve(dir); if(!target.startsWith(resolve(tmpdir())+sep+'attchat-restart-'))throw new Error('Unsafe cleanup'); rmSync(target,{recursive:true,force:true}); }
});
test('実サーバープロセス終了→別プロセス起動で会話・Turn・Runを完全復元', async () => {
  const dir=mkdtempSync(join(tmpdir(),'attchat-restart-')), path=join(dir,'app.sqlite'); let active: ChildProcess | undefined;
  try {
    const first=await launch(path); active=first.child;
    const post=async (url:string,data:unknown) => {const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});assert.equal(res.status,201);return res.json();};
    const c=await post(first.base+'/api/conversations',{title:'再起動確認'});
    const u=await post(first.base+`/api/conversations/${c.conversation_id}/turns`,{content:'再起動後も😀保持'});
    const pair=await post(first.base+`/api/conversations/${c.conversation_id}/mock-runs`,{user_turn_id:u.turn_id,content:'固定回答'});
    await post(first.base+`/api/conversations/${c.conversation_id}/runs/${pair.run.run_id}/retry`,{content:'再試行回答'});
    const before=await (await fetch(first.base+`/api/conversations/${c.conversation_id}`)).json();
    await stop(active); active=undefined;
    const second=await launch(path); active=second.child;
    const after=await (await fetch(second.base+`/api/conversations/${c.conversation_id}`)).json(); assert.deepEqual(after,before); assert.equal(after.runs.length,2);
  } finally { if(active)await stop(active); const target=resolve(dir); if(!target.startsWith(resolve(tmpdir())+sep+'attchat-restart-'))throw new Error('Unsafe cleanup'); rmSync(target,{recursive:true,force:true}); }
});

test('実サーバープロセス終了→別プロセス起動でHighlightの同一anchorを復元', async () => {
  const dir=mkdtempSync(join(tmpdir(),'attchat-restart-')), path=join(dir,'app.sqlite'); let active: ChildProcess | undefined;
  try {
    const first=await launch(path); active=first.child;
    const post=async (url:string,data:unknown) => {const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});assert.equal(res.status,201);return res.json();};
    const c=await post(first.base+'/api/conversations',{title:'マーカー再起動確認'});
    const u=await post(first.base+`/api/conversations/${c.conversation_id}/turns`,{content:'質問'});
    const pair=await post(first.base+`/api/conversations/${c.conversation_id}/mock-runs`,{user_turn_id:u.turn_id,content:'日本語ABC 😀 同じ語 同じ語'});
    const source='日本語ABC';
    const created=await post(first.base+`/api/conversations/${c.conversation_id}/highlights`,{
      turn_id:pair.assistant.turn_id,start_offset:0,end_offset:source.length,source_text:source,target_text:source,color:'blue',note:'再起動後も保持'
    });
    const keep=await post(first.base+`/api/conversations/${c.conversation_id}/question-keeps`,{highlight_id:created.highlight_id,question_draft:'再起動後の質問',memo:'保持'});
    await stop(active); active=undefined;
    const second=await launch(path); active=second.child;
    const response=await fetch(second.base+`/api/conversations/${c.conversation_id}/highlights`);
    assert.equal(response.status,200);
    const after=await response.json();
    assert.deepEqual(after,[created]);
    const keeps=await(await fetch(second.base+`/api/conversations/${c.conversation_id}/question-keeps`)).json();
    assert.deepEqual(keeps,[keep]);
    assert.equal(after[0].status,'resolved');
    assert.equal(after[0].start_offset,0);
    assert.equal(after[0].end_offset,source.length);
  } finally { if(active)await stop(active); const target=resolve(dir); if(!target.startsWith(resolve(tmpdir())+sep+'attchat-restart-'))throw new Error('Unsafe cleanup'); rmSync(target,{recursive:true,force:true}); }
});
