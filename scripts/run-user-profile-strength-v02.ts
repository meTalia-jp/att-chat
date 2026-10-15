import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { LMStudioProvider, type GenerationDiagnostics } from '../src/server/provider.ts';
import {
  buildUserProfileStrengthRequest,
  userProfileStrengthConditions,
  userProfileStrengthModels,
  userProfileStrengthQuestion,
} from '../src/laboratory/user-profile-strength-v02.ts';

const outputPath = resolve(process.env.USER_PROFILE_STRENGTH_OUTPUT ?? 'docs/user-profile-strength-experiment-v02-data/runs.json');
const provider = new LMStudioProvider();
const createdAt = new Date().toISOString();
const availableModels = await provider.models();
for (const model of userProfileStrengthModels) {
  if (!availableModels.includes(model)) throw new Error(`LM Studioでモデルを確認できません: ${model}`);
}

type Run = {
  run_id: string;
  model: string;
  condition_id: string;
  audience: string;
  wrapper_strength: string;
  user_profile_text: string | null;
  system_message: string | null;
  user_question: string;
  request_snapshot: ReturnType<typeof buildUserProfileStrengthRequest>;
  response: string;
  diagnostics: GenerationDiagnostics | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  elapsed_ms: number | null;
  human_review: 'pending';
};

const runs: Run[] = [];
const save = () => {
  mkdirSync(dirname(outputPath), { recursive:true });
  writeFileSync(outputPath, `${JSON.stringify({
    experiment:'att-chat-user-profile-strength-v0.2',
    created_at:createdAt,
    provider_base_url:provider.baseUrl,
    available_models:availableModels,
    generation_settings:{ temperature:0, max_tokens:4096, stream:true, automatic_retry:false },
    lm_studio_settings_note:'Thinking / ReasoningなどのLM Studio側設定はAPIから取得せず、各モデルの試験中に変更していない。',
    fixed_question:userProfileStrengthQuestion,
    expected_run_count:userProfileStrengthModels.length * userProfileStrengthConditions.length,
    runs,
  },null,2)}\n`,'utf8');
};

save();
for (const model of userProfileStrengthModels) {
  for (const condition of userProfileStrengthConditions) {
    const request = buildUserProfileStrengthRequest(model,condition);
    const startedAt = new Date().toISOString(), started = performance.now();
    const run: Run = {
      run_id:crypto.randomUUID(), model, condition_id:condition.condition_id, audience:condition.audience,
      wrapper_strength:condition.strength, user_profile_text:condition.profile_text, system_message:condition.system_message,
      user_question:userProfileStrengthQuestion, request_snapshot:request, response:'', diagnostics:null, error:null,
      started_at:startedAt, completed_at:null, elapsed_ms:null, human_review:'pending',
    };
    runs.push(run); save();
    process.stdout.write(`START ${model} ${condition.condition_id}\n`);
    try {
      await provider.generate(request,AbortSignal.timeout(600_000),text=>{run.response+=text;},diagnostics=>{run.diagnostics=diagnostics;});
    } catch (error) {
      run.error=(error as Error).message;
    }
    run.completed_at=new Date().toISOString(); run.elapsed_ms=Math.round(performance.now()-started); save();
    process.stdout.write(`DONE  ${model} ${condition.condition_id} response=${run.response.length} reasoning=${run.diagnostics?.reasoning_chars ?? 'n/a'} finish=${run.diagnostics?.finish_reason ?? 'error'} elapsed=${run.elapsed_ms}\n`);
  }
}

const incomplete = runs.filter(run => run.error || !run.response || !run.diagnostics);
if (incomplete.length) {
  process.stderr.write(`Completed with ${incomplete.length} incomplete run(s). No automatic retry was performed.\n`);
  process.exitCode=1;
} else {
  process.stdout.write(`Saved ${runs.length} completed runs to ${outputPath}\n`);
}
