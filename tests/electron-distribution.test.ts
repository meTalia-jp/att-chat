import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, cp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openDatabase } from '../src/server/storage/database.ts';
import { Repository } from '../src/server/storage/repository.ts';

const distribution = await import(pathToFileURL(resolve('electron/distribution.mjs')).href);
test('distribution resource paths are absolute and independent of cwd or dev env', () => {
  const root=resolve('isolated/resources'),paths=distribution.distributionResources(root);
  assert.equal(paths.node,join(root,'node/node.exe'));
  assert.equal(paths.backend,join(root,'backend/server/main.js'));
  assert.equal(paths.frontend,join(root,'frontend'));
  assert.equal(paths.migrations,join(root,'migrations'));
  assert.equal(paths.cwd,root);
});
test('backend IPC readiness validates port and cleans up listeners on success, failure and timeout', async () => {
  const child=new EventEmitter();
  const ready=distribution.waitForBackendPort(child,1000);
  child.emit('message',{port:0});child.emit('message',{port:'5000'});child.emit('message',{port:5000});
  assert.equal(await ready,5000);assert.equal(child.listenerCount('message'),0);
  const failed=distribution.waitForBackendPort(child,1000);child.emit('exit',1);
  await assert.rejects(failed,/exited before ready/);
  await assert.rejects(distribution.waitForBackendPort(child,5),/timed out/);
  const error=distribution.waitForBackendPort(child,1000);child.emit('error',new Error('spawn error'));
  await assert.rejects(error,/spawn error/);assert.equal(child.listenerCount('exit'),0);
});
test('compiled backend starts outside repo with injected assets, empty DB, same-origin static and persistent stores', async () => {
  const directory=await mkdtemp(join(tmpdir(),'attchat-dist-test-'));
  let child: ReturnType<typeof spawn> | undefined;
  try {
    const backend=join(directory,'resources/backend');
    const build=spawnSync(process.execPath,[resolve('node_modules/typescript/bin/tsc'),'-p',resolve('tsconfig.server-build.json'),'--outDir',backend],{encoding:'utf8',windowsHide:true});
    assert.equal(build.status,0,build.stdout+build.stderr);
    await writeFile(join(backend,'package.json'),'{"type":"module"}');
    await cp(resolve('src/server/storage/migrations'),join(directory,'resources/migrations'),{recursive:true});
    const frontend=join(directory,'resources/frontend');await mkdir(frontend,{recursive:true});
    await writeFile(join(frontend,'index.html'),'<!doctype html><title>Distribution test</title>');
    const runtime=await import(pathToFileURL(resolve('electron/runtime.mjs')).href);
    const storage=runtime.createElectronRuntime(resolve('absent-repo'),{}, {distributionDataDirectory:join(directory,'userData/data')});
    let stderr='';
    let stdout='';
    async function boot() {
      stdout='';
      return distribution.startDistributionBackend(join(directory,'resources'),storage,(label:string,command:string,args:string[],env:NodeJS.ProcessEnv,options:{cwd:string;ipc:boolean})=>{
        assert.equal(label,'backend');assert.equal(command,join(directory,'resources/node/node.exe'));
        assert.equal(env.ATTCHAT_PORT,'0');assert.equal(env.ATTCHAT_EMBEDDING_MODEL_DIR,undefined);
        // Unit integration uses this test's Node; staging smoke separately verifies the bundled executable.
        child=spawn(process.execPath,args,{cwd:options.cwd,env,stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
        child.stderr!.on('data',value=>{stderr+=value;});child.stdout!.on('data',value=>{stdout+=value;});return child;
      },{...process.env,PATH:'',ATTCHAT_EMBEDDING_MODEL_DIR:'must-not-load',ATTCHAT_FRONTEND:'wrong'});
    }
    async function stop(disconnect=false){
      if(child && child.exitCode===null){
        const exit=once(child,'exit');
        if(disconnect)child.disconnect();else {child.send({type:'shutdown'},()=>{});child.send({type:'shutdown'},()=>{});}
        assert.deepEqual(await exit,[0,null],stderr);
        assert.equal(stdout.split('BACKEND_DB_CLOSED').length-1,1);
        assert.equal(stdout.split('BACKEND_SHUTDOWN_SUCCESS').length-1,1);
      }
      child=undefined;
    }
    let url=await boot();
    assert.match(url,/^http:\/\/127\.0\.0\.1:\d+\/$/);
    assert.match(await (await fetch(url)).text(),/Distribution test/);
    async function api(path:string,method='GET',body?:unknown){const response=await fetch(url+path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});assert.ok(response.ok,`${response.status} ${stderr}`);return response.json();}
    const conversation=await api('api/conversations','POST',{title:'Staged conversation'});
    await api(`api/conversations/${conversation.conversation_id}/turns`,'POST',{content:'Persistent turn'});
    await api('api/settings','PATCH',{general:{startup_screen:'last'}});
    await api('api/collections','POST',{name:'Staged collection'});
    await api('api/quick-memo','POST',{text:'Staged memo'});
    assert.equal((await fetch(url+'api/conversations',{headers:{Origin:'http://untrusted.invalid'}})).status,403);
    await stop();url=await boot();
    assert.ok(JSON.stringify(await api('api/conversations')).includes('Staged conversation'));
    assert.equal((await api('api/settings')).settings.general.startup_screen,'last');
    assert.ok(JSON.stringify(await api('api/collections')).includes('Staged collection'));
    assert.deepEqual((await api('api/quick-memo')).items,['Staged memo']);
    await stop();
    // Copy a source-runtime DB, including Marker/Keep/Run, into a new isolated target.
    const existingPath=join(directory,'source.sqlite');
    const db=openDatabase(existingPath);
    let expected;
    let expectedHighlights;
    let expectedKeeps;
    let existingId;
    try {
      const repo=new Repository(db);
      existingId=repo.createConversation('Existing DB copy').conversation_id;
      const user=repo.addUserTurn(existingId,'Existing question');
      const pair=repo.addMockRun(existingId,user.turn_id,'Existing answer');
      const highlight=repo.createHighlight(existingId,{turn_id:pair.assistant.turn_id,start_offset:0,end_offset:8,source_text:'Existing',target_text:'Existing',color:'blue'});
      repo.questionKeeps.create(existingId,{highlight_id:highlight.highlight_id,question_draft:'Existing Keep'});
      expected=JSON.parse(JSON.stringify(repo.detail(existingId)));
      expectedHighlights=JSON.parse(JSON.stringify(repo.listHighlights(existingId)));
      expectedKeeps=JSON.parse(JSON.stringify(repo.questionKeeps.list(existingId)));
    } finally { db.close(); }
    storage.databasePath=join(directory,'userData/data/copied.sqlite');
    await cp(existingPath,storage.databasePath);
    url=await boot();
    assert.deepEqual(await api(`api/conversations/${existingId}`),expected);
    assert.deepEqual(await api(`api/conversations/${existingId}/highlights`),expectedHighlights);
    assert.deepEqual(await api(`api/conversations/${existingId}/question-keeps`),expectedKeeps);
    await stop(true);
  } finally {
    if(child && child.exitCode===null){const exited=once(child,'exit');child.kill();await exited;}
    assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep+'attchat-dist-test-'));
    await rm(directory,{recursive:true,force:true});
  }
});
test('packaged main selects distribution instead of Vite; dev and single instance paths remain',async()=>{
  const main=await readFile('electron/main.mjs','utf8');
  assert.match(main,/if \(app.isPackaged\) \{\s+windowUrl = await startDistributionBackend/);
  assert.match(main,/\} else \{[\s\S]*startChild\('vite'/);
  assert.match(main,/await window.loadURL\(windowUrl\)/);
  assert.match(main,/startSingleInstance\(app, start,/);
  const scripts=JSON.parse(await readFile('package.json','utf8')).scripts;
  assert.equal(scripts.dev,'vite --host 127.0.0.1 --port 5180 --strictPort');
  assert.equal(scripts['electron:dev'],'electron electron/main.mjs');
});
