import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { LMStudioProvider } from '../src/server/provider.ts';
import { startLaboratory } from '../src/laboratory/server.ts';
import { experiments, canSwitchExperiment } from '../src/laboratory/catalog.ts';

test('Catalog primary documents exist inside the repository and Experiment IDs are unique',()=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  assert.equal(new Set(experiments.map(e=>e.id)).size,experiments.length);
  for(const e of experiments){
    assert.ok(e.document_path?.trim(),`${e.id}: document_path required`);
    assert.equal(isAbsolute(e.document_path),false);
    const path=resolve(root,e.document_path),fromRoot=relative(root,path);
    assert.ok(fromRoot && !fromRoot.startsWith('..') && !isAbsolute(fromRoot),e.id);
    assert.ok(statSync(path).isFile(),`${e.id}: ${e.document_path}`);
  }
});

test('Catalog has seven fixed entries and switching respects generation and Simple session',()=>{
  assert.equal(experiments.length,7);
  assert.equal(new Set(experiments.map(e=>e.id)).size,7);
  assert.deepEqual(experiments.map(e=>e.runnable),[true,true,false,true,true,true,true]);
  assert.equal(experiments[2].kind,'existing-experiment');assert.equal(experiments[2].execution,null);
  assert.equal(experiments[3].execution?.entry,'marker-color-sample');
  assert.equal(experiments[4].execution?.entry,'marker-quick-action-prototype');
  assert.equal(experiments[6].execution?.entry,'att-chat-integrated-dummy');
  for(const e of experiments){assert.ok(e.title&&e.purpose&&e.hypothesis&&e.version&&e.status&&e.equipment.length);if(e.runnable)assert.equal(e.execution!.entry,e.id);}
  assert.equal(canSwitchExperiment(false,false),true);
  for(const [busy,session] of [[true,false],[false,true],[true,true]])assert.equal(canSwitchExperiment(busy,session),false);
});

test('Simple session survives failed/cancelled generations; references recover after reload and server restart',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'att-lab-session-'));
  class Provider extends LMStudioProvider {
    mode='ok';
    override async generate(_body:Record<string,unknown>,signal:AbortSignal,emit:(s:string)=>void){
      if(this.mode==='fail')throw new Error('fixture failure');
      emit('partial or full');
      if(this.mode==='wait')await new Promise<void>(r=>signal.addEventListener('abort',()=>r(),{once:true}));
    }
  }
  const provider=new Provider();let lab=await startLaboratory({port:0,dataDirectory:directory,distPath:directory,provider});
  let base='http://127.0.0.1:'+lab.port;
  const get=async(path:string)=>(await fetch(base+path)).json();
  const post=(path:string,body:unknown)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  try {
    const c=await(await post('/api/conversations',{title:'session'})).json(),path='/api/conversations/'+c.conversation_id;
    const question=()=>post(path+'/chat',{content:'q',model:'fake',request_id:randomUUID()});
    assert.equal((await question()).status,409);
    const session=await(await post('/api/laboratory/sessions',{conversation_id:c.conversation_id})).json();
    assert.equal((await post('/api/laboratory/sessions',{conversation_id:c.conversation_id})).status,409);
    assert.equal((await post('/api/single/runs',{text:'x',model:'fake',request_id:randomUUID()})).status,409);
    assert.match(await(await question()).text(),/succeeded/);
    provider.mode='fail';assert.match(await(await question()).text(),/failed/);
    assert.equal((await get('/api/laboratory/sessions/current')).status,'running');
    provider.mode='wait';const response=await question(),reader=response.body!.getReader();
    const first=new TextDecoder().decode((await reader.read()).value),generation=JSON.parse(first.split('\n')[0]).run;
    assert.equal((await post('/api/laboratory/sessions/'+session.run_id+'/finish',{})).status,409);
    assert.equal((await post(path+'/runs/'+generation.run_id+'/cancel',{})).status,200);
    while(!(await reader.read()).done){}reader.releaseLock();
    const active=await get('/api/laboratory/sessions/current');assert.equal(active.status,'running');assert.equal(active.generation_run_ids.length,3);
    const ended=await(await post('/api/laboratory/sessions/'+session.run_id+'/finish',{})).json();
    assert.equal(ended.status,'completed');assert.equal(ended.validation_status,'not_run');assert.deepEqual(ended.models,['fake']);
    const detail=await get(path);assert.deepEqual(new Set(ended.generation_run_ids),new Set(detail.runs.map((r:any)=>r.run_id)));
    assert.equal('request_snapshot' in ended,false);assert.equal('turns' in ended,false);
    const second=await(await post('/api/laboratory/sessions',{conversation_id:c.conversation_id})).json();
    assert.deepEqual(second.generation_run_ids,[]);
    provider.mode='ok';await(await question()).text();
    await lab.shutdown();lab=await startLaboratory({port:0,dataDirectory:directory,distPath:directory,provider});base='http://127.0.0.1:'+lab.port;
    const results=await get('/api/laboratory/runs/simple');
    assert.deepEqual(results.find((r:any)=>r.run_id===session.run_id),ended);
    const recovered=results.find((r:any)=>r.run_id===second.run_id);assert.equal(recovered.status,'interrupted');assert.equal(recovered.generation_run_ids.length,1);
    assert.equal(await get('/api/laboratory/sessions/current'),null);
    assert.equal((await get(path)).runs.length,4);
  }finally{await lab.shutdown();rmSync(directory,{recursive:true,force:true});}
});

test('Lab gateway reuses existing servers, isolates data, streams and stops, no Conversation created by Single',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'att-lab-')),dist=join(directory,'dist'),data=join(directory,'data');
  mkdirSync(dist);writeFileSync(join(dist,'laboratory.html'),'<h1>Lab entry</h1>');
  writeFileSync(join(dist,'simple-marker-chat.html'),'<h1>Simple entry</h1>');
  class Provider extends LMStudioProvider {
    hook:(signal:AbortSignal,emit:(s:string)=>void)=>Promise<void>=async(_signal,emit)=>{emit('fixture result');};
    override async models(){return ['fake'];}
    override async generate(_body:Record<string,unknown>,signal:AbortSignal,emit:(s:string)=>void){await this.hook(signal,emit);}
  }
  const provider=new Provider();
  const lab=await startLaboratory({port:0,dataDirectory:data,distPath:dist,provider});
  const base='http://127.0.0.1:'+lab.port;
  const post=(path:string,body:unknown)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(body)});
  try {
    assert.match(await(await fetch(base)).text(),/Lab entry/);
    assert.match(await(await fetch(base+'/simple-marker-chat.html')).text(),/Simple entry/);
    assert.deepEqual(await(await fetch(base+'/api/models')).json(),{models:['fake']});
    assert.deepEqual(await(await fetch(base+'/api/single/models')).json(),{models:['fake']});
    const conversation=await(await post('/api/conversations',{title:'fixture'})).json();
    const session=await(await post('/api/laboratory/sessions',{conversation_id:conversation.conversation_id})).json();
    assert.equal(session.status,'running');
    const chat=await post('/api/conversations/'+conversation.conversation_id+'/chat',{content:'hello',model:'fake',request_id:randomUUID()});
    assert.equal(chat.status,201);assert.match(await chat.text(),/"succeeded"/);
    const before=await(await fetch(base+'/api/conversations/'+conversation.conversation_id)).json();
    assert.equal(before.turns.length,2);
    const ended=await(await post('/api/laboratory/sessions/'+session.run_id+'/finish',{})).json();
    assert.equal(ended.status,'completed');assert.deepEqual(ended.generation_run_ids,before.runs.map((r:any)=>r.run_id));
    const single=await post('/api/single/runs',{text:'single',model:'fake',request_id:randomUUID()});
    assert.equal(single.status,201);assert.match(await single.text(),/"completed"/);
    const after=await(await fetch(base+'/api/conversations/'+conversation.conversation_id)).json();
    assert.deepEqual(after,before);
    assert.equal((await(await fetch(base+'/api/single/latest')).json()).output_snapshot,'fixture result');
    provider.hook=async(signal,emit)=>{emit('partial');await new Promise<void>(r=>signal.addEventListener('abort',()=>r(),{once:true}));};
    const live=await post('/api/single/runs',{text:'stop',model:'fake',request_id:randomUUID()});
    const reader=live.body!.getReader(),first=new TextDecoder().decode((await reader.read()).value);
    const id=JSON.parse(first.split('\n')[0]).run_id;
    const duplicate=await post('/api/conversations/'+conversation.conversation_id+'/chat',{content:'no',model:'fake',request_id:randomUUID()});
    assert.equal(duplicate.status,409);
    assert.equal((await(await post('/api/single/runs/'+id+'/stop',{})).json()).status,'cancelled');
    while(!(await reader.read()).done){/* drain */}reader.releaseLock();
    assert.equal((await fetch(base+'/api/models',{headers:{Origin:'http://example.com'}})).status,403);
    assert.ok(readdirSync(data).includes('simple-marker.sqlite'));
    assert.equal(readdirSync(join(data,'single-text-runs')).filter(n=>n.endsWith('.json')).length,2);
  }finally{await lab.shutdown();rmSync(directory,{recursive:true,force:true});}
});

test('New Chat Handoff endpoint is memory-only and sends exactly system + edited user',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'att-lab-handoff-')),dist=join(directory,'dist'),data=join(directory,'data');
  mkdirSync(dist);writeFileSync(join(dist,'laboratory.html'),'<h1>Lab</h1>');
  let requestBody:Record<string,unknown>|null=null;
  class Provider extends LMStudioProvider{
    override async models(){return ['google/gemma-4-12b-qat'];}
    override async generate(body:Record<string,unknown>,_signal:AbortSignal,emit:(s:string)=>void,diagnostics?:any){requestBody=body;emit('memory only answer');diagnostics?.({finish_reason:'stop'});}
  }
  const lab=await startLaboratory({port:0,dataDirectory:data,distPath:dist,provider:new Provider()});
  const base='http://127.0.0.1:'+lab.port,input={sourceConversation:'Conversation A',sourceConversationId:'fixture-a',sourceTurn:'T25',markerId:'marker-a',markerSourceText:'対象',markerStatus:'resolved',handoff:true,handoffLevel:'標準',pastContextUtf16:800,futureContextUtf16:0,finalFirstUserMessage:'edited first user message'};
  try{
    const response=await fetch(base+'/api/laboratory/new-chat-handoff',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(input)});
    assert.equal(response.status,200);const run=await response.json();
    assert.equal(run.assistantResponse,'memory only answer');assert.equal(run.oldConversationMessageCount,0);
    assert.deepEqual(run.messageRoles,['system','user']);assert.equal(run.firstUserMessage,input.finalFirstUserMessage);
    assert.equal(run.model,'google/gemma-4-12b-qat');assert.equal(run.finishReason,'stop');assert.equal(run.humanReview,'pending');
    assert.ok(run.temporaryConversationId);assert.equal((await(await fetch(base+'/api/conversations')).json()).length,0);
    const messages=(requestBody as any).messages;assert.equal(messages.length,2);assert.equal(messages[0].role,'system');assert.deepEqual(messages[1],{role:'user',content:input.finalFirstUserMessage});
  }finally{await lab.shutdown();rmSync(directory,{recursive:true,force:true});}
});
