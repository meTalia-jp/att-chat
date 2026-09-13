import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

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
