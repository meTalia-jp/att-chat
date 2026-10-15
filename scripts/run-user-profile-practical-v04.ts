import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { LMStudioProvider, type GenerationDiagnostics } from '../src/server/provider.ts';
import {
  buildPracticalProfileRequest,
  practicalProfileConditions,
  practicalProfileModels,
  practicalProfileQuestions,
  type PracticalProfileSubject,
  type PracticalProfileVariant,
} from '../src/laboratory/user-profile-practical-v04.ts';

const outputPath = resolve(
  process.env.USER_PROFILE_PRACTICAL_OUTPUT ?? 'docs/user-profile-practical-refinement-v04-data/runs.json',
);
const provider = new LMStudioProvider();
const createdAt = new Date().toISOString();
const availableModels = await provider.models();
for (const model of practicalProfileModels) {
  if (!availableModels.includes(model)) throw new Error(`LM Studioでモデルを確認できません: ${model}`);
}

const subjects = Object.keys(practicalProfileQuestions) as PracticalProfileSubject[];

type Run = {
  run_id: string;
  model: string;
  subject: PracticalProfileSubject;
  practical_variant: PracticalProfileVariant;
  profile_text: string;
  system_message: string;
  user_question: string;
  generation_settings: {
    temperature:number;
    max_tokens:number;
    stream:boolean;
    usage:boolean;
    automatic_retry:boolean;
    timeout_ms:number;
  };
  request_snapshot: ReturnType<typeof buildPracticalProfileRequest>;
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
    experiment:'att-chat-user-profile-practical-refinement-v0.4',
    created_at:createdAt,
    provider_base_url:provider.baseUrl,
    available_models:availableModels,
    generation_settings:generationSettings,
    lm_studio_settings_note:'Thinking / ReasoningなどのLM Studio側設定はAPIから取得せず、各モデルの試験中に変更していない。',
    expected_run_count:practicalProfileModels.length * subjects.length * practicalProfileConditions.length,
    questions:practicalProfileQuestions,
    runs,
  },null,2)}\n`,'utf8');
};

save();
for (const model of practicalProfileModels) {
  for (const subject of subjects) {
    for (const condition of practicalProfileConditions) {
      const request = buildPracticalProfileRequest(model,subject,condition);
      const startedAt = new Date().toISOString();
      const started = performance.now();
      const run: Run = {
        run_id:crypto.randomUUID(),
        model,
        subject,
        practical_variant:condition.practical_variant,
        profile_text:condition.profile_text,
        system_message:condition.system_message,
        user_question:practicalProfileQuestions[subject],
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
      process.stdout.write(`START ${model} ${subject} ${condition.practical_variant}\n`);
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
        `DONE  ${model} ${subject} ${condition.practical_variant} answer=${run.answer.length} ` +
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
