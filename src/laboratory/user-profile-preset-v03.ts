import { buildUserProfileSystemMessage } from '../shared/user-profile-experiment.ts';

export type UserProfilePresetId = 'off' | 'beginner' | 'practical' | 'expert';
export type UserProfilePresetSubject = 'business' | 'math' | 'physics';

export const userProfilePresetModels = [
  'google/gemma-4-26b-a4b-qat',
  'qwen/qwen3.6-35b-a3b',
] as const;

export const userProfilePresetQuestions = {
  business: '売上が伸びているのに、会社の現金が減ることがあるのはなぜですか？',
  math: '平均値と中央値は、どのように使い分ければよいですか？',
  physics: 'なぜ熱は高温の物体から低温の物体へ移動するのですか？',
} as const;

export const userProfilePresetTexts = {
  beginner: `この分野については初学者です。
基礎知識を前提にしすぎず、専門用語は初出時に短く説明してください。
必要に応じて身近な例や比喩を使い、考え方を段階的に説明してください。
数式や専門的な理論名は、理解に必要な場合だけ使用してください。`,
  practical: `この分野について基礎知識があります。
基本用語の説明は最小限で構いません。
理論だけでなく、実際にどう使うか、どのような場合に重要かも説明してください。
必要な専門用語や数式は使用して構いませんが、説明の流れを優先してください。`,
  expert: `この分野について専門的な知識があります。
基礎的な説明は不要です。
専門用語、数式、標準的な理論名称はそのまま使用してください。
可能であれば、背景となる理論、例外、前提条件、より厳密な説明まで踏み込んでください。`,
} as const;

export type UserProfilePresetCondition = {
  profile: UserProfilePresetId;
  profile_text: string | null;
  system_message: string | null;
};

export const userProfilePresetConditions: readonly UserProfilePresetCondition[] = [
  { profile:'off', profile_text:null, system_message:null },
  ...(['beginner','practical','expert'] as const).map(profile => ({
    profile,
    profile_text:userProfilePresetTexts[profile],
    system_message:buildUserProfileSystemMessage(userProfilePresetTexts[profile]),
  })),
];

export function buildUserProfilePresetRequest(
  model: string,
  subject: UserProfilePresetSubject,
  condition: UserProfilePresetCondition,
) {
  return {
    model,
    messages: [
      ...(condition.system_message ? [{ role:'system', content:condition.system_message }] : []),
      { role:'user', content:userProfilePresetQuestions[subject] },
    ],
    temperature:0,
    max_tokens:4096,
    stream:true,
    stream_options:{ include_usage:true },
  };
}
