import type { Problem } from './problems.ts';
import type { TaskProposal,TutorOutput } from './contracts.ts';
export class StudyError extends Error { code:string; status:number; constructor(code:string,status=400){super(code);this.code=code;this.status=status;} }
function object(value:unknown,keys:string[]):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));}
function text(value:unknown):value is string{return typeof value==='string'&&value.trim().length>0&&value.length<=8000&&!value.includes('\0');}
function strings(value:unknown):value is string[]{return Array.isArray(value)&&value.length>0&&value.length<=20&&value.every(text);}
export function expectedProposal(p:Problem):TaskProposal{return {schema_version:1,public_task:{title:p.public_title,question:p.public_question},private_task:{learning_goal:p.learning_goal,completion_criteria:p.rubric.map(r=>r.criterion)},reference:{answer_summary:p.verified_answer,solution_steps:p.solution_steps,rubric_mapping:p.rubric.map(r=>r.id),common_mistakes:p.common_mistakes}};}
export function validateTask(raw:string,p:Problem):TaskProposal{
 let v:unknown;try{v=JSON.parse(raw);}catch{throw new StudyError('TASK_SCHEMA_INVALID');}
 if(!object(v,['schema_version','public_task','private_task','reference'])||v.schema_version!==1||!object(v.public_task,['title','question'])||!text(v.public_task.title)||!text(v.public_task.question)||!object(v.private_task,['learning_goal','completion_criteria'])||!text(v.private_task.learning_goal)||!strings(v.private_task.completion_criteria)||!object(v.reference,['answer_summary','solution_steps','rubric_mapping','common_mistakes'])||!text(v.reference.answer_summary)||!strings(v.reference.solution_steps)||!strings(v.reference.rubric_mapping)||!strings(v.reference.common_mistakes))throw new StudyError('TASK_SCHEMA_INVALID');
 const result=v as unknown as TaskProposal,expected=expectedProposal(p);
 // P0 deliberately restricts proposals to approved fixture values, not fallible semantic judging.
 const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
 if(result.public_task.title!==expected.public_task.title||result.public_task.question!==expected.public_task.question||result.private_task.learning_goal!==expected.private_task.learning_goal||!equal(result.private_task.completion_criteria,expected.private_task.completion_criteria)||![p.verified_answer,...p.accepted_alternatives].includes(result.reference.answer_summary)||!equal(result.reference.solution_steps,expected.reference.solution_steps)||!equal(result.reference.rubric_mapping,expected.reference.rubric_mapping)||!equal(result.reference.common_mistakes,expected.reference.common_mistakes))throw new StudyError('REFERENCE_REJECTED');
 return result;
}
export function validateTutor(raw:string):TutorOutput{
 let v:unknown;try{v=JSON.parse(raw);}catch{throw new StudyError('TUTOR_OUTPUT_REJECTED');}
 if(!v||typeof v!=='object'||Array.isArray(v))throw new StudyError('TUTOR_OUTPUT_REJECTED');
 const a=(v as Record<string,unknown>).action;
 if(!(a==='ask_question'&&object(v,['action','explanation','next_question'])&&text(v.explanation)&&text(v.next_question)||a==='explain'&&object(v,['action','explanation'])&&text(v.explanation)))throw new StudyError('TUTOR_OUTPUT_REJECTED');
 return v as TutorOutput;
}
const normalized=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
export function checkLeaks(t:TutorOutput,p:Problem,reference:TaskProposal,hintLevel:number):string[]{
 const output=normalized(t.explanation+('next_question' in t?t.next_question:'')),reasons:string[]=[];
 if(hintLevel!==0)reasons.push('hint_level_not_allowed');
 // P0 confines the explanation to an approved level-0 fixture; questions still need leak checks.
 if(!p.allowed_hint_levels.some(h=>h.level===0&&h.text===t.explanation))reasons.push('explanation_outside_level_zero');
 if([p.verified_answer,...p.accepted_alternatives,...p.forbidden_early_reveals].some(x=>output.includes(normalized(x))))reasons.push('forbidden_answer');
 if(p.allowed_hint_levels.filter(h=>h.level>hintLevel).some(h=>output.includes(normalized(h.text))))reasons.push('unapproved_hint');
 const referenceParts=[reference.reference.answer_summary,...reference.reference.solution_steps];
 for(const part of referenceParts){const n=normalized(part);for(let i=0;i+20<=n.length;i++){if(output.includes(n.slice(i,i+20))){reasons.push('reference_long_match');break;}}}
 if(/正解です|理解できました|学習完了|taskcomplete/i.test(output))reasons.push('completion_claim');
 return [...new Set(reasons)];
}
