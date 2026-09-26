import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { StudyCoordinator } from '../src/study-poc/coordinator.ts';
import { createStudyServer } from '../src/study-poc/server.ts';
import { problems } from '../src/study-poc/problems.ts';
import { checkLeaks,expectedProposal,validateTask,validateTutor } from '../src/study-poc/validation.ts';
import type { StudyProvider } from '../src/study-poc/contracts.ts';
const p=problems[0],proposal=JSON.stringify(expectedProposal(p));
const safe=JSON.stringify({action:'ask_question',explanation:p.allowed_hint_levels[0].text,next_question:'つり合いとはどんな状態でしょう？'});
class Fake implements StudyProvider{
 calls:Record<string,unknown>[]=[]; outputs:string[];hook?: (index:number,signal:AbortSignal,emit:(s:string)=>void)=>Promise<void>;
 constructor(outputs=[proposal,safe]){this.outputs=outputs;}
 async models(){return ['fake'];}
 async generate(body:Record<string,unknown>,signal:AbortSignal,emit:(s:string)=>void){const index=this.calls.length;this.calls.push(body);if(this.hook)return this.hook(index,signal,emit);const text=this.outputs[index];if(text===undefined)throw new Error('unexpected retry');emit(text.slice(0,10));await Promise.resolve();emit(text.slice(10));}
}
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve};};
test('P0 runtime import graph has no DB, Repository, GenerationService or context dependency',()=>{
 const seen=new Set<string>();function walk(path:string){path=resolve(path);if(seen.has(path))return;seen.add(path);const text=readFileSync(path,'utf8');assert(!/node:sqlite|database\.ts|storage\/|generation\.ts|semantic\/|retrieval\/|context-preview\//.test(text));
 assert(!/\b(?:import\s*\(|require\s*\()/.test(text));
 for(const match of text.matchAll(/(?:import|export)\s+(?!type\b)[^;\n]*?from\s*['"]([^'"]+)['"]/g)){const spec=match[1];if(spec.startsWith('.'))walk(resolve(dirname(path),spec));else assert(spec.startsWith('node:'));}}
 walk('src/study-poc/serve.ts');assert([...seen].some(x=>x.endsWith('provider.ts')));assert(![...seen].some(x=>x.endsWith('database.ts')));
});
test('P0 Session creation, two calls, ACTIVE, fixed version, public DTO and restricted Tutor input',async()=>{
 const provider=new Fake(),c=new StudyCoordinator(provider),s=c.create();assert.equal(s.current_task_id,null);
 const result=(await c.start(s.session_id,p.id,'fake'))!;assert.equal(result.task_state,'ACTIVE');assert.equal(result.public_history.length,2);assert.equal(result.debug_summary.machine_check,'machine_checks_passed');assert.equal(result.debug_summary.definition_version,1);assert.equal(provider.calls.length,2);
 const normal=JSON.stringify(result),input=JSON.stringify(provider.calls[1]);for(const text of [p.verified_answer,p.learning_goal,...p.solution_steps]){assert(!normal.includes(text));assert(!input.includes(text));}
 assert(!input.includes('answer_summary'));assert(!normal.includes('raw_tutor'));assert(result.debug_summary.calls.every(m=>m.output_chars>0&&m.input_chars>0));
});
for(const problem of problems)test(`P0 fixture ${problem.id}: accepted reference and alternatives`,()=>{
 const expected=expectedProposal(problem);assert.deepEqual(validateTask(JSON.stringify(expected),problem),expected);
 for(const alt of problem.accepted_alternatives){expected.reference.answer_summary=alt;assert.equal(validateTask(JSON.stringify(expected),problem).reference.answer_summary,alt);}
});
test('P0 invalid Task schema stops before Tutor, no automatic retry',async()=>{
 const provider=new Fake(['{"schema_version":1}']),c=new StudyCoordinator(provider),s=c.create(),r=(await c.start(s.session_id,p.id,'fake'))!;
 assert.equal(r.task_state,'FAILED');assert.equal(r.debug_summary.error_type,'TASK_SCHEMA_INVALID');assert.equal(provider.calls.length,1);assert.equal(r.tutor,null);
});
test('P0 contradictory Reference and malicious public fields rejected',async()=>{
 for(const part of ['answer','public','criteria']){const v=expectedProposal(p);if(part==='answer')v.reference.answer_summary='間違った解答';if(part==='public')v.public_task.question=p.verified_answer;if(part==='criteria')v.private_task.completion_criteria=['勝手に完了'];const provider=new Fake([JSON.stringify(v)]),c=new StudyCoordinator(provider),s=c.create(),r=(await c.start(s.session_id,p.id,'fake'))!;assert.equal(r.debug_summary.error_type,'REFERENCE_REJECTED');assert.equal(provider.calls.length,1);assert.equal(r.tutor,null);}
});
for(const [label,output] of [['invalid JSON','{'],['action',JSON.stringify({action:'complete',explanation:'done'})],['hidden key',JSON.stringify({action:'explain',explanation:'hi',reference:'secret'})],['answer',JSON.stringify({action:'explain',explanation:p.verified_answer})],['early reveal',JSON.stringify({action:'explain',explanation:'両辺に同じ操作をしましょう。'})],['high hint',JSON.stringify({action:'explain',explanation:p.allowed_hint_levels[1].text})]])test(`P0 Tutor ${label} rejected without publication`,async()=>{
 const provider=new Fake([proposal,output]),c=new StudyCoordinator(provider),s=c.create(),r=(await c.start(s.session_id,p.id,'fake'))!;assert.equal(r.debug_summary.error_type,'TUTOR_OUTPUT_REJECTED');assert.equal(r.public_history.length,1);assert.equal(r.tutor,null);assert.equal(provider.calls.length,2);
});
test('P0 explain schema, hint guard, reference long match',()=>{
 assert.equal(validateTutor('{"action":"explain","explanation":"考えてみましょう。"}').action,'explain');
 assert(checkLeaks(validateTutor(safe),p,expectedProposal(p),1).includes('hint_level_not_allowed'));
 const ref=expectedProposal(p);ref.reference.solution_steps=['これは長い参照用の固有文章であり公開用には渡さない文字列です'];assert(checkLeaks({action:'explain',explanation:ref.reference.solution_steps[0]},p,ref,0).includes('reference_long_match'));
});
test('P0 observed live-model paraphrases are rejected by representative phrase checks',()=>{
 for(const [id,text] of [['transpose','右側の物体も同じだけ減らす'],['seasons','日照時間が変わるでしょうか'],['variable','値を名前（変数名）で保存・管理する']]){
  const fixture=problems.find(p=>p.id===id)!;
  assert(checkLeaks({action:'explain',explanation:text},fixture,expectedProposal(fixture),0).includes('forbidden_answer'));
 }
});
test('P0 explanation is constrained to level zero even when Provider ignores schema',async()=>{
 const f=new Fake([proposal,JSON.stringify({action:'explain',explanation:'左右から3を取り除く必要があります。'})]);
 const c=new StudyCoordinator(f),s=c.create();const result=(await c.start(s.session_id,p.id,'fake'))!;
 assert.equal(result.task_state,'FAILED');assert.equal(result.tutor,null);
 assert(c.details(s.session_id).rejected_output_reason.includes('explanation_outside_level_zero'));
});
test('P0 cancel ignores delayed Provider output and rejects simultaneous Step',async()=>{
 const gate=deferred(),entered=deferred(),provider=new Fake();provider.hook=async(_i,_signal,emit)=>{entered.resolve();await gate.promise;emit(proposal);};
 const c=new StudyCoordinator(provider),s=c.create(),running=c.start(s.session_id,p.id,'fake');await entered.promise;await assert.rejects(c.start(s.session_id,p.id,'fake'),/STEP_BUSY/);c.stop(s.session_id);await running;assert.equal(c.public(s.session_id).task_state,'PAUSED');gate.resolve();await new Promise(r=>setImmediate(r));assert.equal(c.public(s.session_id).tutor,null);assert.equal(provider.calls.length,1);
});
test('P0 restart invalidates old task/step/attempt',async()=>{
 const gate=deferred(),entered=deferred(),provider=new Fake();provider.hook=async(_i,_signal,emit)=>{entered.resolve();await gate.promise;emit(proposal);};const c=new StudyCoordinator(provider),s=c.create(),run=c.start(s.session_id,p.id,'fake');await entered.promise;const next=c.restart(s.session_id);assert.notEqual(next.session_id,s.session_id);assert.equal(await run,null);gate.resolve();assert.equal(c.public(next.session_id).current_task_id,null);assert.throws(()=>c.public(s.session_id),/SESSION_NOT_FOUND/);
});
test('P0 cancel immediately before publish prevents ACTIVE and assistant history',async()=>{
 const entered=deferred(),release=deferred(),c=new StudyCoordinator(new Fake(),{beforePublish:async()=>{entered.resolve();await release.promise;}}),s=c.create(),run=c.start(s.session_id,p.id,'fake');await entered.promise;c.stop(s.session_id);release.resolve();await run;assert.equal(c.public(s.session_id).tutor,null);assert.equal(c.public(s.session_id).task_state,'PAUSED');
});
for(const kind of ['call','step'])test(`P0 ${kind} timeout without retry`,async()=>{
 const provider=new Fake();provider.hook=async()=>new Promise(()=>{});const c=new StudyCoordinator(provider,{callTimeoutMs:kind==='call'?15:1000,totalTimeoutMs:kind==='step'?15:1000}),s=c.create(),r=(await c.start(s.session_id,p.id,'fake'))!;assert.equal(r.debug_summary.error_type,kind==='call'?'CALL_TIMEOUT':'STEP_TIMEOUT');assert.equal(r.task_state,'FAILED');assert.equal(provider.calls.length,1);
});
test('P0 Provider failure and output limit do not publish',async()=>{
 for(const large of [false,true]){const f=new Fake();f.hook=async(_i,_s,emit)=>{if(large)emit('x'.repeat(32001));else throw new Error('provider hidden error');};const c=new StudyCoordinator(f),s=c.create(),r=(await c.start(s.session_id,p.id,'fake'))!;assert.equal(r.task_state,'FAILED');assert.equal(r.debug_summary.error_type,large?'OUTPUT_TOO_LARGE':'PROVIDER_ERROR');assert.equal(r.public_history.length,1);}
});
async function withServer(debug:boolean,fn:(url:string,c:StudyCoordinator)=>Promise<void>){const provider=new Fake(),c=new StudyCoordinator(provider),server=createStudyServer(provider,c,{debug});server.listen(0,'127.0.0.1');await once(server,'listening');try{await fn(`http://127.0.0.1:${(server.address() as {port:number}).port}`,c);}finally{c.shutdown();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}}
test('P0 HTTP public responses contain no Hidden data; debug disabled by default',()=>withServer(false,async(url)=>{
 const list=await(await fetch(url+'/api/problems')).json();assert.equal(list.length,6);assert.deepEqual(Object.keys(list[0]),['id','public_title','public_question']);
 const post=(path:string,data:unknown)=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const s=await(await post('/api/sessions',{})).json();
 assert.equal((await fetch(`${url}/api/sessions/${s.session_id}/debug`)).status,404);
 const r=await(await post(`/api/sessions/${s.session_id}/start`,{problem_id:p.id,model:'fake'})).json();assert.equal(r.task_state,'ACTIVE');assert(!JSON.stringify(r).includes(p.verified_answer));
 assert.equal((await fetch(url+'/debug')).status,404);
 assert.equal((await fetch(url+'/study-debug.html')).status,404);
 const malicious=await fetch(url+'/api/sessions',{method:'POST',headers:{Origin:'http://evil.invalid','Content-Type':'application/json'},body:'{}'});assert.equal(malicious.status,403);
}));
test('P0 debug explicitly enabled only on separate endpoint',()=>withServer(true,async(url,c)=>{const s=c.create();await c.start(s.session_id,p.id,'fake');const detail=await(await fetch(`${url}/api/sessions/${s.session_id}/debug`)).json();assert.equal(detail.reference.answer_summary,p.verified_answer);assert(!JSON.stringify(c.public(s.session_id)).includes(p.verified_answer));}));
test('P0 polling during partial Tutor delta never exposes raw text',async()=>{
 const entered=deferred(),gate=deferred(),f=new Fake();f.hook=async(i,_s,emit)=>{if(i===0){emit(proposal);return;}emit('{"action":"ask_question","explanation":"SECRET_RAW');entered.resolve();await gate.promise;};const c=new StudyCoordinator(f),s=c.create(),run=c.start(s.session_id,p.id,'fake');await entered.promise;assert(!JSON.stringify(c.public(s.session_id)).includes('SECRET_RAW'));assert.equal(c.public(s.session_id).public_history.length,1);c.stop(s.session_id);await run;gate.resolve();
});
