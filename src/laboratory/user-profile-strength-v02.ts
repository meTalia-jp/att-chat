import { buildUserProfileSystemMessage } from '../shared/user-profile-experiment.ts';

export type UserProfileStrength = 'off' | 'weak' | 'standard' | 'strong';
export type UserProfileAudience = 'off' | 'beginner' | 'expert';

export const userProfileStrengthQuestion = `電磁誘導とは何ですか。
なぜ磁石をコイルに対して動かすと電流が流れるのですか？`;

export const userProfileStrengthProfiles = {
  beginner: `この分野についての前提知識は中学生程度です。
専門用語は初出時に短く説明してください。
高校以降の数学や物理は未学習です。`,
  expert: `この分野について大学〜専門レベルの知識があります。
基礎的な説明は不要です。
専門用語、数式、標準的な理論名称はそのまま使用して構いません。`,
} as const;

export const userProfileStrengthModels = [
  'qwen/qwen3.8-27b',
  'qwen/qwen3.6-35b-a3b',
] as const;

const weakIntroduction = `以下は回答相手についての参考情報です。
必要に応じて、説明の難易度や専門用語の使い方を調整する際の参考にしてください。`;

const strongIntroduction = `以下のユーザープロフィールを、回答の難易度、説明量、専門用語の使い方を決める際に明確に反映してください。

プロフィールで未学習とされている前提知識を当然のものとして扱わず、必要な概念はその場で説明してください。
プロフィールで十分な知識があるとされている場合は、不要な基礎説明を省き、より専門的な内容へ進んで構いません。

ただし、現在の質問内容とユーザーの明示的な指示を優先してください。`;

export function buildUserProfileStrengthMessage(strength: Exclude<UserProfileStrength, 'off'>, profile: string) {
  if (strength === 'standard') return buildUserProfileSystemMessage(profile);
  const introduction = strength === 'weak' ? weakIntroduction : strongIntroduction;
  return `USER PROFILE\n\n${introduction}\n\n[User Profile]\n${profile}`;
}

export type UserProfileStrengthCondition = {
  condition_id: string;
  audience: UserProfileAudience;
  strength: UserProfileStrength;
  profile_text: string | null;
  system_message: string | null;
};

export const userProfileStrengthConditions: readonly UserProfileStrengthCondition[] = [
  { condition_id:'OFF', audience:'off', strength:'off', profile_text:null, system_message:null },
  ...(['beginner','expert'] as const).flatMap(audience => (['weak','standard','strong'] as const).map(strength => ({
    condition_id:`${audience}-${strength}`,
    audience,
    strength,
    profile_text:userProfileStrengthProfiles[audience],
    system_message:buildUserProfileStrengthMessage(strength,userProfileStrengthProfiles[audience]),
  }))),
];

export function buildUserProfileStrengthRequest(model: string, condition: UserProfileStrengthCondition) {
  return {
    model,
    messages: [
      ...(condition.system_message ? [{ role:'system', content:condition.system_message }] : []),
      { role:'user', content:userProfileStrengthQuestion },
    ],
    temperature: 0,
    max_tokens: 4096,
    stream: true,
    stream_options: { include_usage:true },
  };
}
