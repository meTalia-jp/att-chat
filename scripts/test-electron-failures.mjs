// Fault injection is confined to the explicit disposable staging application's test entry.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
const stage=resolve(process.env.ATTCHAT_TEST_STAGE ?? 'electron-dist');
await readFile(join(stage,'staging-manifest.json'));
const packagePath=join(stage,'resources/app/package.json'),entry=join(stage,'resources/app/fault-validation.mjs');
const original=await readFile(packagePath,'utf8');
try {
 for(const mode of ['startup-path','startup-parse','spawn-error','bad-entry','unexpected-zero','unexpected-nonzero','timeout']) {
  const userData=await mkdtemp(join(tmpdir(),'attchat-fault-'+mode+'-'));
  await writeFile(entry,`import { app, dialog } from 'electron';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const mode=${JSON.stringify(mode)};
app.setPath('userData',${JSON.stringify(userData)});
dialog.showMessageBox=async()=>{console.log('TEST_DIALOG');return {response:0};};
let backend;
const spawn=childProcess.spawn;
childProcess.spawn=(command,args,options)=>{
 if(args[0]?.endsWith('main.js')) {
  if(mode==='spawn-error')command=${JSON.stringify(join(stage,'absent-node.exe'))};
  if(mode==='bad-entry')args=[${JSON.stringify(join(stage,'absent-main.js'))}];
  backend=spawn(command,args,options);
  if(mode==='timeout') { const send=backend.send.bind(backend);backend.send=(message,...args)=>{if(message?.type==='shutdown')return true;return send(message,...args);}; }
  return backend;
 }
 return spawn(command,args,options);
};
syncBuiltinESMExports();
app.on('browser-window-created',(_event,window)=>{
 window.once('closed',()=>console.log('TEST_WINDOW_CLOSED'));
 window.webContents.once('did-finish-load',()=>{
  console.log('TEST_WINDOW_READY');
  if(mode==='unexpected-zero')backend.send({type:'shutdown'});
  if(mode==='unexpected-nonzero')backend.kill('SIGKILL');
  if(mode==='timeout')app.quit();
 });
});
if(mode==='startup-path'){const getPath=app.getPath.bind(app);app.getPath=name=>{if(name==='userData')throw new Error('injected startup path failure');return getPath(name);};}
if(mode==='startup-parse'){Object.defineProperty(app,'isPackaged',{get:()=>false});process.env.ATTCHAT_ELECTRON_FRONTEND_PORT='invalid';}
await import('./electron/main.mjs');
`);
  await writeFile(packagePath,JSON.stringify({...JSON.parse(original),main:'fault-validation.mjs'}));
  const began=Date.now();
  const child=spawn(join(stage,'AttChat.exe'),[],{cwd:userData,env:{...process.env,PATH:''},windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});
  const timer=setTimeout(()=>child.kill('SIGKILL'),20000);
  const [code]=await once(child,'exit');clearTimeout(timer);
  assert.equal(code,1,`${mode}: ${output}`);
  assert.equal(output.split('TEST_DIALOG').length-1,1,output);
  assert.equal(output.split('CHILD_SHUTDOWN_').length-1,1,output);
  if(mode==='spawn-error')assert.ok(output.includes('CHILD_ERROR backend ENOENT'),output);
  if(mode==='unexpected-zero')assert.ok(output.includes('CHILD_UNEXPECTED_EXIT backend code=0'),output);
  if(mode.startsWith('unexpected-'))assert.ok(output.includes('TEST_WINDOW_CLOSED'),output);
  if(mode==='timeout'){assert.ok(output.includes('SHUTDOWN_TIMEOUT backend'),output);assert.ok(Date.now()-began>=5000);}
  for(const match of output.matchAll(/CHILD_STARTED \w+ pid=(\d+)/g))assert.throws(()=>process.kill(Number(match[1]),0),`${mode}: orphan ${match[1]}`);
  console.log(`${mode}: PASS (exit 1, one cleanup/dialog, no child remaining)`);
 }
} finally { await writeFile(packagePath,original);await rm(entry,{force:true}); }
