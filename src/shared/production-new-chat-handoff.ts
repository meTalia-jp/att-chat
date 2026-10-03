import type { Turn } from './contracts.ts';

export const productionHandoffLevels = ['none', 'minimal', 'standard', 'wide'] as const;
export type ProductionHandoffLevel = typeof productionHandoffLevels[number];

export const productionHandoffPreviousTurns: Record<ProductionHandoffLevel, number> = {
  none: 0,
  minimal: 1,
  standard: 3,
  wide: 5,
};

export const productionHandoffLabels: Record<ProductionHandoffLevel, string> = {
  none: '引継ぎしない',
  minimal: '少なめ',
  standard: '標準',
  wide: '多め',
};

export const productionHandoffSystemPrompt =
  '引用された箇所を質問対象として、日本語で質問に直接答えてください。最初のUser Messageに含まれる情報だけを新しい会話の前提として扱い、過去会話の履歴が別に存在すると仮定しないでください。対象を特定できない場合は断定せず、不足を述べてください。';

export function isProductionHandoffLevel(value: unknown): value is ProductionHandoffLevel {
  return typeof value === 'string' && (productionHandoffLevels as readonly string[]).includes(value);
}

export type ProductionHandoffMessage = {
  firstUserMessage: string;
  includedTurns: Turn[];
};

export type ProductionHandoffPreview = {
  source_conversation_id: string;
  source_turn_id: string;
  source_turn_number: number;
  source_highlight_id: string;
  marker_source_text: string;
  marker_target_text: string;
  handoff_level: ProductionHandoffLevel;
  previous_turn_limit: number;
  included_turn_ids: string[];
  included_turns: Array<{ turn_id: string; turn_number: number; role: Turn['role'] }>;
  first_user_message: string;
  display_first_user_message: string;
};

export function buildProductionHandoffMessage(
  turns: readonly Turn[],
  targetTurnId: string,
  markerText: string,
  question: string,
  level: ProductionHandoffLevel,
): ProductionHandoffMessage {
  const completed = [...turns]
    .filter(turn => turn.status === 'completed')
    .sort((left, right) => left.sequence_no - right.sequence_no);
  const targetIndex = completed.findIndex(turn => turn.turn_id === targetTurnId);
  if (targetIndex < 0) throw new Error('確定したTarget Turnがありません');
  const target = completed[targetIndex];
  if (target.role !== 'assistant') throw new Error('Target TurnはAssistantである必要があります');

  const previous = productionHandoffPreviousTurns[level];
  const includedTurns = level === 'none'
    ? []
    : completed.slice(Math.max(0, targetIndex - previous), targetIndex + 1);
  const context = includedTurns.map(turn => {
    const role = turn.role === 'user' ? 'User' : 'Assistant';
    const targetLabel = turn.turn_id === targetTurnId ? ' / Target' : '';
    return `[T${turn.sequence_no + 1} / ${role}${targetLabel}]\n${turn.content}`;
  }).join('\n\n');
  const focusAndQuestion = `## 質問対象\n\n${markerText}\n\n## 質問\n\n${question}`;
  return {
    includedTurns,
    firstUserMessage: level === 'none'
      ? focusAndQuestion
      : `## 前の会話からの参考文脈\n\n${context}\n\n${focusAndQuestion}`,
  };
}
