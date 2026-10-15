import { buildUserProfileSystemMessage } from '../shared/user-profile-experiment.ts';

export type PracticalProfileVariant = 'current' | 'revised';
export type PracticalProfileSubject = 'business' | 'physics';

export const practicalProfileModels = [
  'google/gemma-4-26b-a4b-qat',
  'qwen/qwen3.6-35b-a3b',
] as const;

export const practicalProfileQuestions = {
  business:'売上が伸びているのに、会社の現金が減ることがあるのはなぜですか？',
  physics:'なぜ熱は高温の物体から低温の物体へ移動するのですか？',
} as const;

export const practicalProfileTexts = {
  current:`この分野について基礎知識があります。
基本用語の説明は最小限で構いません。
理論だけでなく、実際にどう使うか、どのような場合に重要かも説明してください。
必要な専門用語や数式は使用して構いませんが、説明の流れを優先してください。`,
  revised:`この分野について基礎知識があります。
基本用語の説明は最小限で構いません。

理論は、実際の判断や利用に必要な範囲に留めてください。
具体的な利用場面、判断基準、注意点、実装・運用上の制約を優先してください。

必要な専門用語は使用して構いませんが、
理論的な深掘りより、実務でどう使うかを優先してください。`,
} as const;

export type PracticalProfileCondition = {
  practical_variant: PracticalProfileVariant;
  profile_text: string;
  system_message: string;
};

export const practicalProfileConditions: readonly PracticalProfileCondition[] = (
  ['current','revised'] as const
).map(practical_variant => ({
  practical_variant,
  profile_text:practicalProfileTexts[practical_variant],
  system_message:buildUserProfileSystemMessage(practicalProfileTexts[practical_variant]),
}));

export function buildPracticalProfileRequest(
  model: string,
  subject: PracticalProfileSubject,
  condition: PracticalProfileCondition,
) {
  return {
    model,
    messages:[
      { role:'system', content:condition.system_message },
      { role:'user', content:practicalProfileQuestions[subject] },
    ],
    temperature:0,
    max_tokens:4096,
    stream:true,
    stream_options:{ include_usage:true },
  };
}
