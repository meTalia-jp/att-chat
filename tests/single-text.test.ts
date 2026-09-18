import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { LMStudioProvider } from '../src/server/provider.ts';
import { RunFiles } from '../src/laboratory/single-text/run-files.ts';
import { SingleTextService } from '../src/laboratory/single-text/service.ts';
import { createSingleTextServer } from '../src/laboratory/single-text/server.ts';
import type { RunEvent } from '../src/laboratory/single-text/contracts.ts';

const provenance=()=>({source_commit:'fixed-commit',dirty_state:true});
class Fake {
  baseUrl='http://127.0.0.1:1234/v1'; calls:unknown[]=[];
  async models(){return ['fake'];}
  hook: (signal:AbortSignal,emit:(text:string)=>void)=>Promise<void> = async(_signal,emit)=>{emit('日本語');emit(' response');};
  async generate(body:Record<string,unknown>,signal:AbortSignal,emit:(text:string)=>void){this.calls.push(body);await this.hook(signal,emit);}
}
function setup(options:{timeoutMs?:number;checkpointMs?:number}={}) {
  const directory=mkdtempSync(join(tmpdir(),'att-single-')),store=new RunFiles(directory),provider=new Fake();
  const service=new SingleTextService(store,provider,{...options,provenance});
  return {directory,store,provider,service,async close(){await service.shutdown();store.close();rmSync(directory,{recursive:true,force:true});}};
}
const input=()=>({text:'入力👩🏽‍💻',model:'fake',request_id:randomUUID()});
const tick=(ms=20)=>new Promise(r=>setTimeout(r,ms));

test('Single Text runtime graph has no Conversation/DB/GenerationService/Study dependency',()=>{
  const seen=new Set<string>();
  function walk(file:string){file=resolve(file);if(seen.has(file))return;seen.add(file);
    assert.doesNotMatch(file,/storage|generation\.ts|study-poc|semantic|retrieval|Marker|Chat\.tsx/);
    const source=readFileSync(file,'utf8');assert.doesNotMatch(source,/node:sqlite/);
    for(const m of source.matchAll(/(?:import|export)\s+(?!type\b)[^;\n]*?from\s*['"]([^'"]+)['"]/g))if(m[1].startsWith('.'))walk(resolve(dirname(file),m[1]));
  }
  walk('src/laboratory/single-text/serve.ts');walk('src/laboratory/single-text/SingleTextGeneration.tsx');
  assert.ok([...seen].some(f=>f.endsWith('server'+(process.platform==='win32'?'\\':'/')+'provider.ts')));
});
test('reserve before network; completed snapshots, request body, provenance and restart restoration',async()=>{
  const f=setup();
  try {
    const value=input(),run=f.service.reserve(value),events:RunEvent[]=[];
    assert.equal(f.provider.calls.length,0);assert.equal(f.store.read(run.run_id).status,'running');
    await f.service.execute(run.run_id,e=>events.push(e));
    const saved=f.store.read(run.run_id);
    assert.equal(saved.status,'completed');assert.equal(saved.validation_status,'not_run');
    assert.equal(saved.output_snapshot,'日本語 response');assert.equal(saved.partial_output,saved.output_snapshot);
    assert.equal(saved.input_snapshot,value.text);assert.deepEqual(saved.request_body,f.provider.calls[0]);
    assert.equal(saved.source_commit,'fixed-commit');assert.equal(saved.dirty_state,true);
    assert.equal(saved.experiment_snapshot.id,'single-text-generation');assert.ok(saved.finished_at);
    assert.ok(events.some(e=>e.type==='delta'));
    const before=readFileSync(join(f.directory,run.run_id+'.json'),'utf8');
    const restarted=new SingleTextService(f.store,f.provider,{provenance});
    assert.equal(restarted.latest()!.run_id,run.run_id);
    assert.equal(readFileSync(join(f.directory,run.run_id+'.json'),'utf8'),before);
    assert.throws(()=>restarted.reserve(value),/記録済み/);
    assert.ok(readdirSync(f.directory).every(n=>n==='.owner'||n.endsWith('.json')));
  }finally{await f.close();}
});
test('initial write failure, invalid input, busy and duplicate prevent new generation',async()=>{
  const f=setup();const save=f.store.save.bind(f.store);
  try {
    assert.throws(()=>f.service.reserve({...input(),text:' '}));
    f.store.save=()=>{throw new Error('disk');};
    assert.throws(()=>f.service.reserve(input()),/開始記録/);assert.equal(f.provider.calls.length,0);
    f.store.save=save;const run=f.service.reserve(input());
    assert.throws(()=>f.service.reserve(input()),/実行中/);
    await f.service.execute(run.run_id,()=>{});
    assert.equal(f.provider.calls.length,1);
  }finally{f.store.save=save;await f.close();}
});
test('cancel saves partial output, checkpoint, and ignores late provider output',async()=>{
  const f=setup({checkpointMs:5});let late:((s:string)=>void)|undefined,finish:(()=>void)|undefined;
  f.provider.hook=async(_signal,emit)=>{late=emit;emit('途中');await new Promise<void>(r=>finish=r);emit('late');};
  try {
    const run=f.service.reserve(input()),work=f.service.execute(run.run_id,()=>{});
    await tick();assert.equal(f.store.read(run.run_id).partial_output,'途中');
    const result=await f.service.stop(run.run_id);await work;
    assert.equal(result.status,'cancelled');assert.equal(result.output_snapshot,null);assert.equal(result.partial_output,'途中');
    late!('late');finish!();await tick();
    assert.equal(f.store.read(run.run_id).partial_output,'途中');
  }finally{finish?.();await f.close();}
});
for(const scenario of ['timeout','provider','empty','disconnect'] as const)test(scenario+' -> failed with error, never completed',async()=>{
  const f=setup({timeoutMs:15});
  try {
    f.provider.hook=async(_signal,emit)=>{if(scenario==='provider')throw new Error('HTTP 503');if(scenario==='empty')return;emit('partial');await new Promise(()=>{});};
    const run=f.service.reserve(input()),work=f.service.execute(run.run_id,()=>{});
    if(scenario==='disconnect')f.service.disconnect(run.run_id);
    await work;const saved=f.store.read(run.run_id);
    assert.equal(saved.status,'failed');assert.ok(saved.error);
    if(scenario==='timeout')assert.equal(saved.error.code,'TIMEOUT');
    if(scenario==='disconnect')assert.equal(saved.error.code,'DISCONNECTED');
    assert.equal(saved.output_snapshot,null);
  }finally{await f.close();}
});
test('checkpoint write failure aborts with STORAGE_ERROR and partial output',async()=>{
  const f=setup({checkpointMs:5});const save=f.store.save.bind(f.store);let calls=0;
  try {
    f.provider.hook=async(_signal,emit)=>{emit('partial');await new Promise(()=>{});};
    const run=f.service.reserve(input());
    f.store.save=r=>{if(++calls===1)throw new Error('disk');save(r);};
    await f.service.execute(run.run_id,()=>{});
    const saved=f.store.read(run.run_id);
    assert.equal(saved.status,'failed');assert.equal(saved.error?.code,'STORAGE_ERROR');assert.equal(saved.partial_output,'partial');
  }finally{f.store.save=save;await f.close();}
});
test('final write failure emits storage_error, restart recovers durable checkpoint as interrupted',async()=>{
  const f=setup();const save=f.store.save.bind(f.store);
  try {
    const run=f.service.reserve(input()),events:RunEvent[]=[];
    f.store.save=()=>{throw new Error('disk full');};
    await f.service.execute(run.run_id,e=>events.push(e));
    assert.equal(events.some(e=>e.type==='terminal'),false);
    assert.equal(events.at(-1)?.type,'storage_error');assert.equal(f.store.read(run.run_id).status,'running');
    f.store.save=save;
    new SingleTextService(f.store,f.provider,{provenance});
    const recovered=f.store.read(run.run_id);
    assert.equal(recovered.status,'interrupted');assert.equal(recovered.error?.code,'RESTART_INTERRUPTED');
    assert.equal(f.provider.calls.length,1);
  }finally{f.store.save=save;await f.close();}
});
test('shutdown/reserved-only interruption, directory exclusivity, terminal records survive',async()=>{
  const f=setup();
  try {
    assert.throws(()=>new RunFiles(f.directory),/already in use/);
    const run=f.service.reserve(input());await f.service.shutdown();
    assert.equal(f.store.read(run.run_id).status,'interrupted');assert.equal(f.provider.calls.length,0);
    assert.throws(()=>f.service.reserve(input()),/実行中/);
  }finally{await f.close();}
});
test('dedicated HTTP server + actual LMStudioProvider SSE, models, run restore; Conversation endpoint absent',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'att-single-http-')),store=new RunFiles(directory);
  let received:unknown;
  const upstream=createServer(async(req,res)=>{
    if(req.url==='/v1/models'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'fixture-model'}]}));return;}
    const chunks:Buffer[]=[];for await(const c of req)chunks.push(c);
    received=JSON.parse(Buffer.concat(chunks).toString());
    res.writeHead(200,{'Content-Type':'text/event-stream'});
    res.write('data: '+JSON.stringify({choices:[{index:0,delta:{content:'実Providerテスト'},finish_reason:null}]})+'\n\n');
    res.end('data: '+JSON.stringify({choices:[{index:0,delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');
  });
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const provider=new LMStudioProvider('http://127.0.0.1:'+(upstream.address() as {port:number}).port+'/v1');
  const service=new SingleTextService(store,provider,{provenance}),server=createSingleTextServer(service,directory);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+(server.address() as {port:number}).port;
  try {
    assert.deepEqual(await(await fetch(base+'/api/single/models')).json(),{models:['fixture-model']});
    const result=await fetch(base+'/api/single/runs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input())});
    assert.equal(result.status,201);
    const events=(await result.text()).trim().split('\n').map(s=>JSON.parse(s));
    assert.equal(events.at(-1).run.status,'completed');
    assert.deepEqual(events.at(-1).run.request_body,received);
    assert.equal((await(await fetch(base+'/api/single/latest')).json()).output_snapshot,'実Providerテスト');
    assert.equal((await fetch(base+'/api/conversations')).status,404);
    assert.equal((await fetch(base+'/api/single/latest',{headers:{Origin:'http://example.com'}})).status,403);
    assert.ok(readdirSync(directory).every(n=>n==='.owner'||n.endsWith('.json')));
  }finally{
    await service.shutdown();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));
    upstream.closeAllConnections();await new Promise<void>(r=>upstream.close(()=>r()));store.close();rmSync(directory,{recursive:true,force:true});
  }
});
