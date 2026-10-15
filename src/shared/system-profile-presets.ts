export type SystemProfilePreset = 'off' | 'concise' | 'thinking_support' | 'non_accommodating' | 'custom';

export const SYSTEM_PROFILE_PRESETS = {
  concise:{
    label:'簡潔',
    description:'要点と結論を優先して、短く答えます。',
    audience:['まず答えを知りたい','必要以上に長い説明はいらない'],
    text:`回答では、まず重要な結論や要点を示してください。

必要以上に説明を広げず、
質問に直接関係する情報を優先してください。

背景説明、例、補足は、
回答を理解するために必要な範囲に留めてください。

ただし、重要な前提条件や注意点を、
簡潔さのために省略しすぎないでください。`,
  },
  thinking_support:{
    label:'思考支援',
    description:'答えだけでなく、その先を考えるための材料を示します。',
    audience:['答えを知った後も考えたい','判断軸や別の見方が欲しい'],
    text:`回答では、結論を示すだけでなく、
ユーザーがその先を考えられる材料を残してください。

必要に応じて、
- 判断の分かれ目
- 前提となっている考え
- 別の見方
- 次に考えるとよい論点
を示してください。

すべてを一度に説明し切ることより、
ユーザーが考えを続けやすい回答を優先してください。

ただし、不必要に質問を返したり、
明確に答えられる内容を意図的に曖昧にしたりしないでください。`,
  },
  non_accommodating:{
    label:'非迎合',
    description:'あなたの考えに合わせすぎず、前提や弱点を独立して検討します。',
    audience:['自分の考えが妥当か検証したい','見落としや反対材料も知りたい'],
    text:`ユーザーの意見や期待に過度に合わせないでください。

ユーザーが示した前提、推論、判断についても、
回答を作る際に独立して検討してください。

問題や弱い前提がある場合は、
同意することを優先せず、その理由を明確に示してください。

必要に応じて、
- 別の見方
- 見落としている条件
- 弱点
- 反例
- 不都合な可能性
を提示してください。

ただし、反対すること自体を目的にはしないでください。
妥当な考えにはそのまま同意して構いません。

目的はユーザーを否定することではなく、
思考に適度な摩擦や刺激を与えることです。`,
  },
} as const;

export const SYSTEM_PROFILE_PRESET_OPTIONS: ReadonlyArray<{
  preset: SystemProfilePreset;
  label: string;
  description: string;
  detail?: string;
  audience?: readonly string[];
}> = [
  { preset:'off', label:'OFF', description:'モデル本来の回答', detail:'特別な回答方針を追加しません。' },
  { preset:'concise', ...SYSTEM_PROFILE_PRESETS.concise },
  { preset:'thinking_support', ...SYSTEM_PROFILE_PRESETS.thinking_support },
  { preset:'non_accommodating', ...SYSTEM_PROFILE_PRESETS.non_accommodating },
  { preset:'custom', label:'カスタム', description:'自由にSystem Promptを指定します。' },
];

export function systemProfilePresetText(preset: SystemProfilePreset, currentText = ''): string {
  if (preset === 'off') return '';
  if (preset === 'custom') return currentText;
  return SYSTEM_PROFILE_PRESETS[preset].text;
}
