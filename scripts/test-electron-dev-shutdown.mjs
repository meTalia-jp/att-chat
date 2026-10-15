import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
const root=process.cwd(), area=await mkdtemp(resolve('.cache/electron-phase3-dev-'));
const userData=await mkdtemp(join(tmpdir(),'attchat-dev-chromium-'));
const entry=join(area,'dev-validation.mjs');
await writeFile(entry,`import {app,dialog} from 'electron';
import {existsSync} from 'node:fs';
app.setPath('userData',${JSON.stringify(userData)});
dialog.showMessageBox=async()=>({response:0});
app.on('browser-window-created',(_event,window)=>window.webContents.once('did-finish-load',()=>console.log('DEV_READY')));
setInterval(()=>{if(existsSync(${JSON.stringify(join(area,'quit'))}))app.quit();},100).unref();
await import(${JSON.stringify(pathToFileURL(resolve('electron/main.mjs')).href)});
`);
const env={...process.env,ATTCHAT_NODE:process.execPath,ATTCHAT_ELECTRON_DB:join(area,'attchat.sqlite'),ATTCHAT_ELECTRON_SETTINGS:join(area,'settings.json'),ATTCHAT_ELECTRON_COLLECTIONS:join(area,'collections.json'),ATTCHAT_ELECTRON_QUICK_MEMO:join(area,'quick-memo.md'),ATTCHAT_ELECTRON_FRONTEND_PORT:'5194',ATTCHAT_ELECTRON_BACKEND_PORT:'5195'};
const child=spawn(resolve('node_modules/electron/dist/electron.exe'),[entry],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',chunk=>{output+=chunk;process.stdout.write(chunk);});child.stderr.on('data',chunk=>{output+=chunk;process.stderr.write(chunk);});
try {
 const deadline=Date.now()+20000;
 while(!output.includes('DEV_READY')){assert.ok(Date.now()<deadline && child.exitCode===null,output);await new Promise(r=>setTimeout(r,50));}
 assert.equal((await fetch('http://127.0.0.1:5194/')).status,200);
 const response=await fetch('http://127.0.0.1:5195/api/conversations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Phase3 dev smoke'})});assert.equal(response.status,201);
 const exited=once(child,'exit');await writeFile(join(area,'quit'),'');assert.deepEqual(await exited,[0,null]);
 assert.ok(output.includes('BACKEND_DB_CLOSED'));assert.ok(output.includes('BACKEND_SHUTDOWN_SUCCESS'));assert.ok(output.includes('CHILD_SHUTDOWN_SUCCESS'));assert.ok(!output.includes('SHUTDOWN_TIMEOUT'));
 for(const match of output.matchAll(/CHILD_STARTED \w+ pid=(\d+)/g))assert.throws(()=>process.kill(Number(match[1]),0));
 console.log('Electron dev PASS: API/Vite ready, IPC backend shutdown, no backend/Vite remaining');
} finally {if(child.exitCode===null && child.signalCode===null)child.kill('SIGKILL');}
