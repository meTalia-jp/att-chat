import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { LMStudioProvider, type GenerationDiagnostics } from '../src/server/provider.ts';
import {
  buildUserProfilePresetRequest,
  userProfilePresetConditions,
  userProfilePresetModels,
  userProfilePresetQuestions,
  type UserProfilePresetSubject,
} from '../src/laboratory/user-profile-preset-v03.ts';

const outputPath = resolve(process.env.USER_PROFILE_PRESET_OUTPUT ?? 'docs/user-profile-preset-comparison-v03-data/runs.json');
const provider = new LMStudioProvider();
const createdAt = new Date().toISOString();
const availableModels = await provider.models();
for (const model of userProfilePresetModels) {
  if (!availableModels.includes(model)) throw new Error(`LM Studioでモデルを確認できません: ${model}`);
}

const subjects = Object.keys(userProfilePresetQuestions) as UserProfilePresetSubject[];

type Run = {
  run_id: string;
  model: string;
  subject: UserProfilePresetSubject;
  profile: string;
  profile_text: string | null;
  system_message: string | null;
  user_question: string;
  generation_settings: { temperature:number; max_tokens:number; stream:boolean; usage:boolean; automatic_retry:boolean; timeout_ms:number };
  request_snapshot: ReturnType<typeof buildUserProfilePresetRequest>;
  answer: string;
  diagnostics: GenerationDiagnostics | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  elapsed_ms: number | null;
  human_review: 'pending';
};

const generationSettings = {
  temperature:0,
  max_tokens:4096,
  stream:true,
  usage:true,
  automatic_retry:false,
  timeout_ms:600_000,
};
const runs: Run[] = [];
const save = () => {
  mkdirSync(dirname(outputPath),{ recursive:true });
  writeFileSync(outputPath,`${JSON.stringify({
    experiment:'att-chat-user-profile-preset-comparison-v0.3',
    created_at:createdAt,
    provider_base_url:provider.baseUrl,
    available_models:availableModels,
    generation_settings:generationSettings,
    lm_studio_settings_note:'Thinking / ReasoningなどのLM Studio側設定はAPIから取得せず、各モデルの試験中に変更していない。',
    expected_run_count:userProfilePresetModels.length * subjects.length * userProfilePresetConditions.length,
    questions:userProfilePresetQuestions,
    runs,
  },null,2)}\n`,'utf8');
};

save();
for (const model of userProfilePresetModels) {
  for (const subject of subjects) {
    for (const condition of userProfilePresetConditions) {
      const request = buildUserProfilePresetRequest(model,subject,condition);
      const startedAt = new Date().toISOString();
      const started = performance.now();
      const run: Run = {
        run_id:crypto.randomUUID(),
        model,
        subject,
        profile:condition.profile,
        profile_text:condition.profile_text,
        system_message:condition.system_message,
        user_question:userProfilePresetQuestions[subject],
        generation_settings:generationSettings,
        request_snapshot:request,
        answer:'',
        diagnostics:null,
        error:null,
        started_at:startedAt,
        completed_at:null,
        elapsed_ms:null,
        human_review:'pending',
      };
      runs.push(run);
      save();
      process.stdout.write(`START ${model} ${subject} ${condition.profile}\n`);
      try {
        await provider.generate(
          request,
          AbortSignal.timeout(generationSettings.timeout_ms),
          text => { run.answer += text; },
          diagnostics => { run.diagnostics = diagnostics; },
        );
      } catch (error) {
        run.error = (error as Error).message;
      }
      run.completed_at = new Date().toISOString();
      run.elapsed_ms = Math.round(performance.now() - started);
      save();
      process.stdout.write(
        `DONE  ${model} ${subject} ${condition.profile} answer=${run.answer.length} ` +
        `reasoning=${run.diagnostics?.reasoning_chars ?? 'n/a'} ` +
        `finish=${run.diagnostics?.finish_reason ?? 'error'} elapsed=${run.elapsed_ms}\n`,
      );
    }
  }
}

const incomplete = runs.filter(run => run.error || !run.answer || !run.diagnostics);
if (incomplete.length) {
  process.stderr.write(`Completed with ${incomplete.length} incomplete run(s). No automatic retry was performed.\n`);
  process.exitCode=1;
} else {
  process.stdout.write(`Saved ${runs.length} completed runs to ${outputPath}\n`);
}
