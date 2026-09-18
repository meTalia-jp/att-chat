import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { experiments } from '../src/laboratory/catalog.ts';
import { experiment } from '../src/laboratory/single-text/contracts.ts';
import { startLaboratory } from '../src/laboratory/server.ts';
import { LMStudioProvider } from '../src/server/provider.ts';
import { RunFiles } from '../src/laboratory/single-text/run-files.ts';
import { SingleTextService } from '../src/laboratory/single-text/service.ts';
import { derivedExperiment } from './fixtures/derived-experiment.ts';

test('canonical definition, new Single snapshot and legacy completed snapshot preservation',()=>{
  assert.equal(experiment,experiments[1]);
  for(const e of experiments)for(const key of ['schema_version','id','title','kind','status','version','runnable','purpose','hypothesis','derived_from','equipment','execution','procedure','acceptance'])assert.ok(key in e,key);
  const dir=mkdtempSync(join(tmpdir(),'lab-canonical-')),files=new RunFiles(dir);
  try {
    const service=new SingleTextService(files);
    const run=service.reserve({text:'q',model:'fake',request_id:randomUUID()});
    assert.deepEqual(run.experiment_snapshot,experiments[1]);
    const legacy={...run,status:'completed' as const,finished_at:new Date().toISOString(),experiment_snapshot:{schema_version:1 as const,id:experiment.id,version:'0.1',title:'legacy',purpose:'legacy',acceptance:['old']}};
    files.save(legacy);const before=readFileSync(join(dir,run.run_id+'.json'),'utf8');
    const reopened=new SingleTextService(files);
    assert.deepEqual(reopened.read(run.run_id).experiment_snapshot,legacy.experiment_snapshot);
    assert.equal(readFileSync(join(dir,run.run_id+'.json'),'utf8'),before);
  }finally{files.close();rmSync(dir,{recursive:true,force:true});}
});

test('derived registered entry shares Simple service; successful create/edit/delete are ID-only session events',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'lab-completion-'));
  class Provider extends LMStudioProvider { override async generate(_b:Record<string,unknown>,_s:AbortSignal,emit:(s:string)=>void){emit('日本語 Marker fixture');} }
  const definitions=[...experiments,derivedExperiment];
  let lab=await startLaboratory({port:0,dataDirectory:dir,distPath:dir,provider:new Provider(),definitions});
  let base='http://127.0.0.1:'+lab.port;
  const request=(path:string,method='GET',body?:unknown)=>fetch(base+path,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const json=async(path:string,method='GET',body?:unknown)=>{const r=await request(path,method,body);assert.ok(r.ok,await r.clone().text());return r.json();};
  try {
    const c=await json('/api/conversations','POST',{title:'derived'}),path='/api/conversations/'+c.conversation_id;
    const run=await json('/api/laboratory/sessions','POST',{conversation_id:c.conversation_id,experiment_id:derivedExperiment.id});
    assert.equal(run.experiment_id,derivedExperiment.id);assert.deepEqual(run.experiment_snapshot,derivedExperiment);
    assert.deepEqual(run.experiment_snapshot.derived_from,{id:'simple-marker-chat',version:'0.1'});
    const generation=await request(path+'/chat','POST',{content:'q',model:'fake',request_id:randomUUID()});await generation.text();
    const detail=await json(path),turn=detail.turns.find((t:any)=>t.role==='assistant');
    const highlight=await json(path+'/highlights','POST',{turn_id:turn.turn_id,start_offset:0,end_offset:3,source_text:'日本語',target_text:'日本語',color:'yellow',note:''});
    // Duplicate anchor rejection must not create a second event.
    assert.equal((await request(path+'/highlights','POST',{turn_id:turn.turn_id,start_offset:0,end_offset:3,source_text:'日本語',target_text:'日本語',color:'red',note:''})).ok,false);
    await json(path+'/highlights/'+highlight.highlight_id,'PATCH',{color:'blue',note:'changed'});
    assert.equal((await request(path+'/highlights/'+highlight.highlight_id,'DELETE')).status,204);
    const ended=await json('/api/laboratory/sessions/'+run.run_id+'/finish','POST',{});
    assert.deepEqual(ended.marker_events.map((e:any)=>e.operation),['created','edited','deleted']);
    for(const e of ended.marker_events){assert.equal(e.highlight_id,highlight.highlight_id);assert.ok(Number.isFinite(Date.parse(e.timestamp)));assert.deepEqual(Object.keys(e).sort(),['highlight_id','operation','timestamp']);}
    assert.deepEqual(await json(path+'/highlights'),[]);
    const baseRun=await json('/api/laboratory/sessions','POST',{conversation_id:c.conversation_id});
    assert.equal(baseRun.experiment_id,'simple-marker-chat');assert.deepEqual(baseRun.marker_events,[]);
    await json('/api/laboratory/sessions/'+baseRun.run_id+'/finish','POST',{});
    const bytes=readFileSync(join(dir,'simple-session-runs',run.run_id+'.json'),'utf8');
    await lab.shutdown();lab=await startLaboratory({port:0,dataDirectory:dir,distPath:dir,definitions});base='http://127.0.0.1:'+lab.port;
    const results=await json('/api/laboratory/runs/simple');assert.equal(results.length,2);
    assert.deepEqual(results.find((r:any)=>r.run_id===run.run_id).marker_events,ended.marker_events);
    assert.equal(readFileSync(join(dir,'simple-session-runs',run.run_id+'.json'),'utf8'),bytes);
  }finally{await lab.shutdown();rmSync(dir,{recursive:true,force:true});}
});
