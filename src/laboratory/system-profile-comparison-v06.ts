import {
  addExperimentalSystemPrompt,
  normalizeExperimentalSystemPrompt,
} from '../shared/system-prompt-experiment.ts';
import { SYSTEM_PROFILE_PRESETS } from '../shared/system-profile-presets.ts';

export type SystemProfileId =
  | 'off'
  | 'standard'
  | 'concise'
  | 'thinking_support'
  | 'non_accommodating';

export type SystemProfileSubject = 'explanation' | 'judgment' | 'design';

export const systemProfileModels = [
  'google/gemma-4-26b-a4b-qat',
  'qwen/qwen3.6-35b-a3b',
] as const;

export const systemProfileQuestions = {
  explanation:'AIが文章を生成するときの「temperature」とは何ですか？',
  judgment:`小規模な個人開発アプリなら、
テストコードはあまり書かなくても問題ないと思います。
この考え方についてどう思いますか？`,
  design:`ローカルLLMを2つ同時に使えば、
1つの大きなモデルを使うより良い回答が得られるでしょうか？`,
} as const;

export const systemProfileTexts = {
  standard:`現在の質問内容を優先し、必要な情報を適切な詳しさで回答してください。

特定の回答スタイルを過度に優先せず、
質問の内容と文脈に応じて自然に回答してください。`,
  concise:SYSTEM_PROFILE_PRESETS.concise.text,
  thinking_support:SYSTEM_PROFILE_PRESETS.thinking_support.text,
  non_accommodating:SYSTEM_PROFILE_PRESETS.non_accommodating.text,
} as const;

export type SystemProfileCondition = {
  system_profile:SystemProfileId;
  system_profile_text:string | null;
  system_message:string | null;
};

export const systemProfileConditions: readonly SystemProfileCondition[] = [
  { system_profile:'off', system_profile_text:null, system_message:null },
  ...(['standard','concise','thinking_support','non_accommodating'] as const).map(system_profile => {
    const text = normalizeExperimentalSystemPrompt(systemProfileTexts[system_profile]);
    if (!text) throw new Error(`System Profile本文が空です: ${system_profile}`);
    return { system_profile, system_profile_text:text, system_message:text };
  }),
];

export function buildSystemProfileRequest(
  model:string,
  subject:SystemProfileSubject,
  condition:SystemProfileCondition,
) {
  const messages = addExperimentalSystemPrompt(
    [{ role:'user', content:systemProfileQuestions[subject] }],
    condition.system_message,
  );
  return {
    model,
    messages,
    temperature:0,
    max_tokens:4096,
    stream:true,
    stream_options:{ include_usage:true },
  };
}

export function systemProfileMatrix() {
  return systemProfileModels.flatMap(model =>
    (Object.keys(systemProfileQuestions) as SystemProfileSubject[]).flatMap(subject =>
      systemProfileConditions.map(condition => ({ model, subject, condition })),
    ),
  );
}
