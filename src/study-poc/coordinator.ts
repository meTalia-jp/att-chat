import { randomUUID } from 'node:crypto';
import type { DebugSummary,PublicSession,StudyProvider,TaskProposal,TaskState,TutorOutput } from './contracts.ts';
import { problemById,type Problem } from './problems.ts';
import { checkLeaks,expectedProposal,StudyError,validateTask,validateTutor } from './validation.ts';
import { responseFormat } from './schema.ts';
type Session={session_id:string;current_task_id:string|null;task_definition:TaskProposal|null;reference:TaskProposal['reference']|null;task_state:TaskState;public_history:PublicSession['public_history'];last_question:string|null;hint_level:number;running_step_id:string|null;attempt_id:string|null;abort_controller:AbortController|null;debug_summary:DebugSummary;tutor:TutorOutput|null;raw_task:string;raw_tutor:string;rejection_reasons:string[];problem:Problem|null};
type Options={callTimeoutMs?:number;totalTimeoutMs?:number;beforePublish?:()=>Promise<void>};
const summary=():DebugSummary=>({definition_version:null,hint_level:0,calls:[],total_ms:null,cancel_ms:null,machine_check:'not_run',error_type:null,schema_failures:0,leak_rejects:0});
export class StudyCoordinator {
 private sessions=new Map<string,Session>(); private provider:StudyProvider;private options:Options;private busy=false;
 constructor(provider:StudyProvider,options:Options={}){this.provider=provider;this.options=options;}
 create(){if(this.sessions.size>=100)throw new StudyError('SESSION_LIMIT',429);const s:Session={session_id:randomUUID(),current_task_id:null,task_definition:null,reference:null,task_state:'PAUSED',public_history:[],last_question:null,hint_level:0,running_step_id:null,attempt_id:null,abort_controller:null,debug_summary:summary(),tutor:null,raw_task:'',raw_tutor:'',rejection_reasons:[],problem:null};this.sessions.set(s.session_id,s);return this.public(s.session_id);}
 private get(id:string){const s=this.sessions.get(id);if(!s)throw new StudyError('SESSION_NOT_FOUND',404);return s;}
 public(id:string):PublicSession{const s=this.get(id);return structuredClone({session_id:s.session_id,current_task_id:s.current_task_id,problem_id:s.problem?.id??null,task_state:s.task_state,running:!!s.running_step_id,public_task:s.problem?{title:s.problem.public_title,question:s.problem.public_question}:null,public_history:s.public_history,last_question:s.last_question,tutor:s.tutor,debug_summary:s.debug_summary});}
 details(id:string){const s=this.get(id);return structuredClone({raw_task_proposal:s.raw_task,accepted_task_definition:s.task_definition,reference:s.reference,raw_tutor_output:s.raw_tutor,rejected_output_reason:s.rejection_reasons});}
 stop(id:string){const s=this.get(id),start=performance.now();s.abort_controller?.abort(new StudyError('CANCELLED'));s.attempt_id=null;s.task_state='PAUSED';s.debug_summary.error_type='CANCELLED';s.debug_summary.cancel_ms=performance.now()-start;return this.public(id);}
 restart(id:string){this.stop(id);this.sessions.delete(id);return this.create();}
 shutdown(){for(const s of this.sessions.values())s.abort_controller?.abort(new StudyError('CANCELLED'));this.sessions.clear();}
 async start(id:string,problemId:string,model:string){
  const s=this.get(id),p=problemById(problemId);
  if(!p||typeof model!=='string'||!model.trim()||model.length>300)throw new StudyError('INVALID_INPUT');
  if(this.busy||s.running_step_id)throw new StudyError('STEP_BUSY',409);
  if(s.current_task_id)throw new StudyError('RESTART_REQUIRED',409);
  this.busy=true;const task=randomUUID(),step=randomUUID(),attempt=randomUUID(),controller=new AbortController(),started=performance.now();
  Object.assign(s,{current_task_id:task,running_step_id:step,attempt_id:attempt,abort_controller:controller,task_state:'PREPARING',problem:p,public_history:[{role:'user',content:p.public_question}]});
  const current=()=>this.sessions.get(id)===s&&s.current_task_id===task&&s.running_step_id===step&&s.attempt_id===attempt&&!controller.signal.aborted;
  const ensure=()=>{if(!current())throw new StudyError('STALE_RESULT');};
  const totalTimer=setTimeout(()=>controller.abort(new StudyError('STEP_TIMEOUT')),this.options.totalTimeoutMs??300000);
  try{
   const proposal=await this.call(s,'task',model,[{role:'system',content:'JSONのみを返してください。渡されたexpected_proposalを正確に構造化して返してください。変更、補足、Markdown、思考過程を出力しないでください。これは固定教材に限定した検証です。'},{role:'user',content:JSON.stringify({expected_proposal:expectedProposal(p)})}],controller,ensure);
   ensure();s.raw_task=proposal;
   let accepted:TaskProposal;try{accepted=validateTask(proposal,p);}catch(e){if(e instanceof StudyError&&e.code==='TASK_SCHEMA_INVALID')s.debug_summary.schema_failures++;throw e;}
   s.task_definition=accepted;s.reference=accepted.reference;s.debug_summary.definition_version=1;
   const tutorInput={public_task:accepted.public_task,approved_criterion_ids:p.rubric.map(r=>r.id),current_hint_level:0,allowed_hints:p.allowed_hint_levels.filter(h=>h.level===0),explanation_policy:p.explanation_policy,allowed_actions:['ask_question','explain']};
   const raw=await this.call(s,'tutor',model,[{role:'system',content:'日本語の学習支援です。初回explanationはallowed_hintsのtextをそのまま1つ使用してください。ask_questionを優先し、そのヒントについて学習者の考えを尋ねる短い問いをnext_questionに1つ書いてください。新しい知識は追加しません。答えや定義、解法の核心、完了宣言は出さないでください。JSONのみ。形式は {"action":"ask_question","explanation":"...","next_question":"..."} または {"action":"explain","explanation":"..."}。思考過程や追加キーは禁止です。'},{role:'user',content:JSON.stringify(tutorInput)}],controller,ensure);
   ensure();s.raw_tutor=raw;let tutor:TutorOutput;
   try{tutor=validateTutor(raw);}catch(e){s.debug_summary.schema_failures++;s.rejection_reasons=['invalid_json_schema_or_action'];s.debug_summary.machine_check='rejected';throw e;}
   const reasons=checkLeaks(tutor,p,accepted,s.hint_level);
   if(reasons.length){s.rejection_reasons=reasons;s.debug_summary.leak_rejects++;s.debug_summary.machine_check='rejected';throw new StudyError('TUTOR_OUTPUT_REJECTED');}
   // Yield before committing public state so an already queued Stop request can win.
   await new Promise<void>(resolve=>setImmediate(resolve));await this.options.beforePublish?.();ensure();
   s.tutor=tutor;s.last_question='next_question' in tutor?tutor.next_question:null;
   s.public_history.push({role:'assistant',content:tutor.explanation+(s.last_question?'\n\n'+s.last_question:'')});
   s.debug_summary.machine_check='machine_checks_passed';s.task_state='ACTIVE';
  }catch(error){
   if(this.sessions.get(id)===s&&s.attempt_id===attempt){const reason=controller.signal.aborted?controller.signal.reason:error;s.debug_summary.error_type=reason instanceof StudyError?reason.code:'PROVIDER_ERROR';s.task_state=s.debug_summary.error_type==='CANCELLED'?'PAUSED':'FAILED';}
  }finally{clearTimeout(totalTimer);if(s.running_step_id===step){s.running_step_id=null;s.abort_controller=null;s.debug_summary.total_ms=performance.now()-started;}this.busy=false;}
  return this.sessions.has(id)?this.public(id):null;
 }
 private async call(s:Session,role:'task'|'tutor',model:string,messages:Array<{role:string;content:string}>,controller:AbortController,ensure:()=>void){
  ensure();const body={model,messages,stream:true,temperature:0,max_tokens:role==='task'?2048:512,response_format:responseFormat(role,s.problem!.allowed_hint_levels.filter(h=>h.level===0).map(h=>h.text))},started=performance.now();
  const metric={role,elapsed_ms:0,input_chars:JSON.stringify(body).length,output_chars:0,outcome:'running' as 'running'|'succeeded'|'failed'};s.debug_summary.calls.push(metric);
  let output='',abortListener:()=>void=()=>{};
  const timer=setTimeout(()=>controller.abort(new StudyError('CALL_TIMEOUT')),this.options.callTimeoutMs??120000);
  const aborted=new Promise<never>((_,reject)=>{abortListener=()=>reject(controller.signal.reason??new StudyError('CANCELLED'));controller.signal.addEventListener('abort',abortListener,{once:true});if(controller.signal.aborted)abortListener();});
  try{
   await Promise.race([this.provider.generate(body,controller.signal,delta=>{if(controller.signal.aborted)return;ensure();if(output.length+delta.length>32000){controller.abort(new StudyError('OUTPUT_TOO_LARGE'));throw new StudyError('OUTPUT_TOO_LARGE');}output+=delta;metric.output_chars=output.length;if(role==='task')s.raw_task=output;else s.raw_tutor=output;}),aborted]);
   ensure();metric.outcome='succeeded';return output;
  }catch(error){metric.outcome='failed';throw error;}finally{clearTimeout(timer);controller.signal.removeEventListener('abort',abortListener);metric.elapsed_ms=performance.now()-started;}
 }
}
