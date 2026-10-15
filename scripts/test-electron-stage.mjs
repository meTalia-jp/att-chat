// Explicit integration test for a disposable staging directory, never the user's installed app.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
const stage = resolve(process.env.ATTCHAT_TEST_STAGE ?? 'electron-dist');
const manifest = JSON.parse(await readFile(join(stage,'staging-manifest.json'),'utf8'));
for(const name of ['ATTCHAT-LICENSE.txt','THIRD_PARTY_NOTICES.md','SOURCE_AVAILABILITY.md','RpenProof-MIT.txt','LICENSE','LICENSES.chromium.html','resources/backend/server/main.js','resources/frontend/index.html','resources/node/node.exe','resources/node/LICENSE','resources/migrations/001_initial.sql','resources/migrations/008_immediate_ask_references.sql','resources/frontend/dictionaries/ejdict-hand/ejdict.json','resources/frontend/dictionaries/ejdict-hand/README.md','resources/frontend/dictionaries/ejdict-hand/SOURCE.json']) assert.ok(manifest.files[name],name);
assert.match(await readFile(join(stage,'ATTCHAT-LICENSE.txt'),'utf8'),/^MIT License/);
assert.match(await readFile(join(stage,'LICENSE'),'utf8'),/Electron/);
assert.match(await readFile(join(stage,'THIRD_PARTY_NOTICES.md'),'utf8'),/Chromium FFmpeg fork/);
assert.match(await readFile(join(stage,'SOURCE_AVAILABILITY.md'),'utf8'),/Att-Chat-v1\.0-runtime-source\.zip/);
assert.match(await readFile(join(stage,'RpenProof-MIT.txt'),'utf8'),/^MIT License/);
assert.equal(JSON.parse(await readFile(join(stage,'resources/app/package.json'),'utf8')).license,'MIT');
assert.ok(Object.keys(manifest.files).some(name=>name.startsWith('resources/licenses/react/')));
assert.ok(!Object.keys(manifest.files).some(name=>/(^|\/)(\.cache|src|test|tests|node_modules)(\/|$)|\.sqlite|\.log$|laboratory\.html|default_app\.asar/.test(name)));
const area=await mkdtemp(join(tmpdir(),'attchat-stage-smoke-'));
const packagePath=join(stage,'resources/app/package.json');
const original=JSON.stringify({...JSON.parse(await readFile(packagePath,'utf8')),main:'electron/main.mjs'},null,2);
const testEntry=join(stage,'resources/app/validation.mjs');
await writeFile(testEntry,`import { app } from 'electron';
app.setPath('userData',${JSON.stringify(area)});
app.on('browser-window-created',(_event,window)=>window.webContents.once('did-finish-load',async()=>{
 console.log('STAGE_READY '+JSON.stringify({url:window.webContents.getURL(),userData:app.getPath('userData'),packaged:app.isPackaged}));
 await new Promise(resolve=>setTimeout(resolve,1000));
 const image=await window.webContents.capturePage();
 const {writeFile}=await import('node:fs/promises');await writeFile(${JSON.stringify(join(area,'window.png'))},image.toPNG());
}));
const {existsSync}=await import('node:fs');
setInterval(()=>{if(existsSync(${JSON.stringify(join(area,'quit'))}))app.quit();},100).unref();
await import('./electron/main.mjs');
`);
await writeFile(packagePath,JSON.stringify({...JSON.parse(original),main:'validation.mjs'}));
let child;
let allOutput='';
let runOutput='';
const env={...process.env,PATH:'',ATTCHAT_NODE:'does-not-exist',ATTCHAT_ELECTRON_FRONTEND_PORT:'invalid',ATTCHAT_ELECTRON_DB:'must-not-use.sqlite'};
delete env.NODE_OPTIONS;delete env.NODE_PATH;
async function boot(){
 runOutput='';
 let output='';
 child=spawn(join(stage,'AttChat.exe'),[],{cwd:area,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
 child.stdout.on('data',chunk=>{output+=chunk;allOutput+=chunk;runOutput+=chunk;process.stdout.write(chunk);});child.stderr.on('data',chunk=>{allOutput+=chunk;runOutput+=chunk;process.stderr.write(chunk);});
 const deadline=Date.now()+30000;
 while(Date.now()<deadline){
  const line=output.match(/STAGE_READY (\{[^\n]+\})/);
  if(line){const ready=JSON.parse(line[1]);assert.equal(ready.packaged,true);assert.equal(ready.userData,area);assert.match(ready.url,/^http:\/\/127\.0\.0\.1:\d+\/$/);assert.ok(!output.includes('[vite]'));return ready.url;}
  if(child.exitCode!==null)throw new Error(allOutput);
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 throw new Error('Electron readiness timeout: '+allOutput);
}
async function stop(){
 if(child&&child.exitCode===null){
  const exited=once(child,'exit');await writeFile(join(area,'quit'),'');assert.deepEqual(await exited,[0,null]);await rm(join(area,'quit'));
  assert.ok(runOutput.includes('BACKEND_DB_CLOSED'));assert.ok(runOutput.includes('BACKEND_SHUTDOWN_SUCCESS'));
  assert.ok(runOutput.includes('CHILD_SHUTDOWN_SUCCESS'));assert.ok(!runOutput.includes('SHUTDOWN_TIMEOUT'));
  const pid=Number(runOutput.match(/CHILD_STARTED backend pid=(\d+)/)?.[1]);assert.ok(pid);
  assert.throws(()=>process.kill(pid,0));
 }
 child=undefined;
}
try{
 let url=await boot();
 async function api(path,method='GET',body){const response=await fetch(url+path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});assert.ok(response.ok,`${method} ${path} ${response.status}`);return response.json();}
 assert.deepEqual(await api('api/conversations'),[]);
 const conversation=await api('api/conversations','POST',{title:'Phase2 staged conversation'});
 const turn=await api(`api/conversations/${conversation.conversation_id}/turns`,'POST',{content:'Retained user turn'});
 await api(`api/conversations/${conversation.conversation_id}/mock-runs`,'POST',{user_turn_id:turn.turn_id,content:'Retained GenerationRun'});
 await api('api/settings','PATCH',{general:{startup_screen:'last'}});
 await api('api/collections','POST',{name:'Phase2 staged collection'});
 await api('api/quick-memo','POST',{text:'Phase2 staged memo'});
 const dictionary=await api('dictionaries/ejdict-hand/ejdict.json');assert.equal(typeof dictionary.apple,'string');assert.ok(dictionary.apple.length>0);
 const html=await (await fetch(url)).text();
 for(const match of html.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g))assert.equal((await fetch(new URL(match[1],url))).status,200);
 const second=spawnSync(join(stage,'AttChat.exe'),[],{cwd:area,env,windowsHide:true,encoding:'utf8',timeout:15000});
 assert.equal(second.status,0,second.stderr);assert.ok(!second.stdout.includes('[backend]'));assert.ok(!second.stdout.includes('STAGE_READY'));
 await api('api/conversations');assert.ok(!runOutput.includes('BACKEND_SHUTDOWN_SUCCESS'));
 await stop();url=await boot();
 assert.ok(JSON.stringify(await api('api/conversations')).includes('Phase2 staged conversation'));
 assert.ok(JSON.stringify(await api(`api/conversations/${conversation.conversation_id}`)).includes('Retained GenerationRun'));
 assert.equal((await api('api/settings')).settings.general.startup_screen,'last');
 assert.ok(JSON.stringify(await api('api/collections')).includes('Phase2 staged collection'));
 assert.deepEqual((await api('api/quick-memo')).items,['Phase2 staged memo']);
 // Generation remains opt-in because the availability and selected model of LM Studio vary.
 if(process.env.ATTCHAT_TEST_LM_STUDIO){
  await api('api/model-connection/apply','POST',{mode:'lm_studio_advanced',base_url:process.env.ATTCHAT_TEST_LM_STUDIO});
  const model=process.env.ATTCHAT_TEST_MODEL;
  assert.ok(model,'ATTCHAT_TEST_MODEL is required for real generation');
  const response=await fetch(url+`api/conversations/${conversation.conversation_id}/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:'Reply with exactly: STAGING_OK',model,request_id:crypto.randomUUID()}),signal:AbortSignal.timeout(180000)});
  assert.equal(response.status,201);await response.text();
  const detail=await api(`api/conversations/${conversation.conversation_id}`);
  const run=detail.runs.at(-1);assert.equal(run.outcome,'succeeded');assert.equal(run.model_id,model);
  console.log('LM Studio generation succeeded:',process.env.ATTCHAT_TEST_LM_STUDIO,model);
 }
 console.log(JSON.stringify({stage,userData:area,screenshot:join(area,'window.png'),result:'PASS: packaged, empty PATH, outside repo, 4 stores restart, GenerationRun, dictionary apple, assets, single instance'},null,2));
}finally{await stop();await writeFile(packagePath,original);await rm(testEntry);}
