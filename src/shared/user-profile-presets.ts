export type UserProfilePreset = 'off' | 'beginner' | 'practical' | 'expert' | 'custom';

export const USER_PROFILE_PRESETS = {
  beginner:{
    label:'初学者',
    description:'分かりやすい説明、比喩、段階説明を優先',
    text:`この分野については初学者です。
基礎知識を前提にしすぎず、専門用語は初出時に短く説明してください。
必要に応じて身近な例や比喩を使い、考え方を段階的に説明してください。
数式や専門的な理論名は、理解に必要な場合だけ使用してください。`,
  },
  practical:{
    label:'実務',
    description:'利用・判断・運用・制約を優先',
    text:`この分野について基礎知識があります。
基本用語の説明は最小限で構いません。

理論は、実際の判断や利用に必要な範囲に留めてください。
具体的な利用場面、判断基準、注意点、実装・運用上の制約を優先してください。

必要な専門用語は使用して構いませんが、
理論的な深掘りより、実務でどう使うかを優先してください。`,
  },
  expert:{
    label:'専門',
    description:'理論・数式・前提・例外まで踏み込む',
    text:`この分野について専門的な知識があります。
基礎的な説明は不要です。
専門用語、数式、標準的な理論名称はそのまま使用してください。
可能であれば、背景となる理論、例外、前提条件、より厳密な説明まで踏み込んでください。`,
  },
} as const;

export const USER_PROFILE_PRESET_OPTIONS: ReadonlyArray<{
  preset: UserProfilePreset;
  label: string;
  description: string;
}> = [
  { preset:'off', label:'OFF', description:'User Profileを送信しない' },
  { preset:'beginner', ...USER_PROFILE_PRESETS.beginner },
  { preset:'practical', ...USER_PROFILE_PRESETS.practical },
  { preset:'expert', ...USER_PROFILE_PRESETS.expert },
  { preset:'custom', label:'カスタム', description:'自由記述のProfileを使用' },
];

export function userProfilePresetText(preset: UserProfilePreset, currentText = ''): string {
  if (preset === 'off') return '';
  if (preset === 'custom') return currentText;
  return USER_PROFILE_PRESETS[preset].text;
}
