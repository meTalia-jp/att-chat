import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { SettingsStore } from '../src/server/settings.ts';
import { CollectionStore } from '../src/server/collections.ts';
import { QuickMemoStore } from '../src/server/quick-memo.ts';
import { writeFileAtomically } from '../src/server/atomic-file.ts';
import { createBackendShutdown, stopWorker } from '../src/server/shutdown.ts';
import { openDatabase } from '../src/server/storage/database.ts';
import { Repository } from '../src/server/storage/repository.ts';
import { createAppServer } from '../src/server/http.ts';
import { spawn } from 'node:child_process';

function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};}
async function fixture(work:(directory:string)=>Promise<void>){const dir=await mkdtemp(join(tmpdir(),'attchat-shutdown-'));try{await work(dir);}finally{assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep+'attchat-shutdown-'));await rm(dir,{recursive:true,force:true});}}

test('Settings and Collections flush wait for pending writes before DB close; duplicate shutdown shares promise',()=>fixture(async dir=>{
  const started=deferred(),release=deferred(),events:string[]=[];
  let writes=0;
  const writer=async(path:string,data:string)=>{if(++writes===2)started.resolve();await release.promise;await writeFileAtomically(path,data);events.push('saved');};
  const settings=new SettingsStore(join(dir,'settings.json'),writer);
  const collections=new CollectionStore(join(dir,'collections.json'),()=>[],writer);
  await settings.load();await collections.load();
  const saves=[settings.update({general:{startup_screen:'last'}}),collections.create('kept')];
  await started.promise;
  const shutdown=createBackendShutdown({drain:async()=>{events.push('drain');},stores:[settings,collections],closeDatabase:()=>events.push('db-close'),stopWorker:async()=>{events.push('worker');},exit:code=>{events.push(`exit-${code}`);},log:()=>{}});
  const stop=shutdown();assert.strictEqual(shutdown(),stop);
  await new Promise(r=>setImmediate(r));assert.deepEqual(events,['drain']);
  release.resolve();await Promise.all(saves);await stop;
  assert.deepEqual(events,['drain','saved','saved','db-close','worker','exit-0']);
  assert.equal((await new SettingsStore(settings.path).load()).settings.general.startup_screen,'last');
  assert.equal((await new CollectionStore(collections.path,()=>[]).load()).data.collections[0].name,'kept');
}));

test('Store flush reports failed persistence and Quick Memo atomic failure preserves old Markdown',()=>fixture(async dir=>{
  const badWriter=async()=>{throw new Error('injected disk failure');};
  const settings=new SettingsStore(join(dir,'settings.json'),badWriter),collections=new CollectionStore(join(dir,'collections.json'),()=>[],badWriter);
  await settings.load();await collections.load();
  await assert.rejects(settings.update({general:{startup_screen:'last'}}));await assert.rejects(collections.create('not saved'));
  await assert.rejects(settings.flush());await assert.rejects(collections.flush());
  const path=join(dir,'memo.md');await new QuickMemoStore(path).append('old');
  const memo=new QuickMemoStore(path,(path,data)=>writeFileAtomically(path,data,badWriter));
  await assert.rejects(memo.append('new'));await assert.rejects(memo.flush());assert.equal(await readFile(path,'utf8'),'- old\n');
  const events:string[]=[];
  await createBackendShutdown({drain:async()=>{},stores:[settings,collections,memo],closeDatabase:()=>events.push('db-close'),stopWorker:async()=>{},exit:code=>events.push(`exit-${code}`),log:event=>events.push(event)})();
  assert.ok(events.includes('BACKEND_SHUTDOWN_SAVE_FAILED'));assert.ok(events.includes('db-close'));assert.equal(events.at(-1),'exit-1');
}));

test('HTTP shutdown waits for a disconnected client handler saving Settings before closing SQLite',()=>fixture(async dir=>{
  const started=deferred(),release=deferred();
  const settings=new SettingsStore(join(dir,'settings.json'),async(path,data)=>{started.resolve();await release.promise;await writeFileAtomically(path,data);});await settings.load();
  const db=openDatabase(join(dir,'db.sqlite')),repo=new Repository(db);
  const server=createAppServer(repo,dir,undefined,undefined,undefined,undefined,undefined,undefined,settings);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const port=(server.address() as {port:number}).port;
  const request=httpRequest({host:'127.0.0.1',port,path:'/api/settings',method:'PATCH',headers:{'Content-Type':'application/json'}},response=>response.resume());
  request.on('error',()=>{});request.end(JSON.stringify({general:{startup_screen:'last'}}));await started.promise;
  request.destroy();let closed=false;
  const shutdown=createBackendShutdown({drain:()=>{const handlers=server.drainRequests();const sockets=new Promise<void>(r=>server.close(()=>r()));return Promise.all([handlers,sockets]);},stores:[settings],closeDatabase:()=>{db.close();closed=true;},stopWorker:async()=>{},exit:code=>assert.equal(code,0),log:()=>{}});
  const stop=shutdown();await new Promise(r=>setImmediate(r));assert.equal(closed,false);
  release.resolve();await stop;assert.equal(closed,true);assert.throws(()=>db.prepare('SELECT 1'));
  assert.equal((await new SettingsStore(settings.path).load()).settings.general.startup_screen,'last');
}));

test('backend deadline reports timeout, avoids closing DB still in use and exits unsuccessfully',async()=>{
  const events:string[]=[];
  await createBackendShutdown({drain:()=>new Promise(()=>{}),stores:[],closeDatabase:()=>events.push('unsafe-close'),stopWorker:async()=>{events.push('worker-stop');},exit:code=>events.push(`exit-${code}`),log:event=>events.push(event),timeoutMs:10})();
  assert.ok(events.includes('BACKEND_SHUTDOWN_TIMEOUT'));assert.ok(!events.includes('unsafe-close'));assert.equal(events.at(-1),'exit-1');
});

test('semantic child receives shutdown IPC; hung worker is killed and reaped',async()=>{
  for(const cooperative of [true,false]){
    const child=spawn(process.execPath,['-e',`process.on('message',m=>{if(m.type==='shutdown' && ${cooperative})process.exit(0)});process.send({ready:true});setInterval(()=>{},1000);`],{stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
    await once(child,'message');await stopWorker(child,40);
    assert.ok(child.exitCode!==null || child.signalCode!==null);
  }
});
