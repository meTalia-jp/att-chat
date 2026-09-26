export type TaskState = 'PREPARING' | 'ACTIVE' | 'PAUSED' | 'FAILED';
export type TutorOutput = { action:'ask_question'; explanation:string; next_question:string } | { action:'explain'; explanation:string };
export type TaskProposal = {
  schema_version:1;
  public_task:{title:string;question:string};
  private_task:{learning_goal:string;completion_criteria:string[]};
  reference:{answer_summary:string;solution_steps:string[];rubric_mapping:string[];common_mistakes:string[]};
};
export type CallMetric = { role:'task'|'tutor'; elapsed_ms:number; input_chars:number; output_chars:number; outcome:'running'|'succeeded'|'failed' };
export type DebugSummary = { definition_version:number|null; hint_level:number; calls:CallMetric[]; total_ms:number|null; cancel_ms:number|null; machine_check:'not_run'|'machine_checks_passed'|'rejected'; error_type:string|null; schema_failures:number; leak_rejects:number };
export type PublicSession = {
  session_id:string; current_task_id:string|null; problem_id:string|null; task_state:TaskState; running:boolean;
  public_task:{title:string;question:string}|null;
  public_history:Array<{role:'user'|'assistant';content:string}>;
  last_question:string|null; tutor:TutorOutput|null; debug_summary:DebugSummary;
};
export interface StudyProvider {
  models():Promise<string[]>;
  generate(body:Record<string,unknown>,signal:AbortSignal,onText:(text:string)=>void):Promise<void>;
}
