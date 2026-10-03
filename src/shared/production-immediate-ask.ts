import type { HighlightColor } from './contracts.ts';

export const immediateAskContextStrategy = 'immediate_marker_questions';
export const immediateAskStrategyVersion = '1';
export const immediateAskMaxReferences = 5;
export const immediateAskSystemPrompt = '各Markerの質問対象と質問文を対応させ、通常メッセージがあればそれも踏まえて、日本語で直接答えてください。参照箇所を取り違えず、複数の質問には区別して答えてください。';

export const immediateAskPrefixes = ['質問', 'しかし…', '意見'] as const;
export type ImmediateAskPrefix = typeof immediateAskPrefixes[number];

export type ImmediateAskRequestItem = {
  highlight_id: string;
  prefix: ImmediateAskPrefix;
  question_text: string;
};

export type ImmediateAskResolvedItem = ImmediateAskRequestItem & {
  source_conversation_id: string;
  source_conversation_title: string;
  source_turn_id: string;
  source_turn_sequence_no: number;
  source_highlight_id: string;
  start_offset: number;
  end_offset: number;
  source_text: string;
  target_text: string;
  color: HighlightColor;
};

export function isImmediateAskPrefix(value: unknown): value is ImmediateAskPrefix {
  return typeof value === 'string' && (immediateAskPrefixes as readonly string[]).includes(value);
}

export function upsertImmediateAskReference<T extends { highlightId: string }>(current: T[], next: T) {
  const existing = current.findIndex(item => item.highlightId === next.highlightId);
  if (existing >= 0) return { accepted: true, replaced: true, items: current.map((item, index) => index === existing ? next : item) };
  if (current.length >= immediateAskMaxReferences) return { accepted: false, replaced: false, items: current };
  return { accepted: true, replaced: false, items: [...current, next] };
}

export function buildImmediateAskUserTurn(mainDraft: string, references: Pick<ImmediateAskResolvedItem, 'prefix' | 'target_text' | 'question_text'>[]) {
  const parts: string[] = [];
  if (mainDraft.trim()) parts.push(mainDraft);
  for (const reference of references) parts.push(`[${reference.prefix}]\n「${reference.target_text}」\n${reference.question_text}`);
  return parts.join('\n\n');
}

export function buildImmediateAskModelMessage(mainDraft: string, references: Pick<ImmediateAskResolvedItem, 'prefix' | 'target_text' | 'question_text'>[]) {
  const sections: string[] = [];
  if (mainDraft.trim()) sections.push(`## 通常メッセージ\n\n${mainDraft}`);
  references.forEach((reference, index) => sections.push(`## Marker質問 ${index + 1}\n\n[発話方向]\n${reference.prefix}\n\n[質問対象]\n${reference.target_text}\n\n[質問]\n${reference.question_text}`));
  return sections.join('\n\n');
}
