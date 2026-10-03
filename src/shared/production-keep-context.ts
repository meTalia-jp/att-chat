import type { RetrievedTurn } from './retrieval.ts';

export const keepContextLevels = ['minimal', 'standard', 'wide'] as const;
export type KeepContextLevel = typeof keepContextLevels[number];

export const keepContextPreviousTurns: Record<KeepContextLevel, number> = {
  minimal: 1,
  standard: 3,
  wide: 5,
};

export const keepContextLabels: Record<KeepContextLevel, string> = {
  minimal: '少なめ',
  standard: '標準',
  wide: '多め',
};

export const keepContextStrategy = 'turn_based_keep_context';
export const keepContextStrategyVersion = '1';
export const keepContextSystemPrompt =
  '参考文脈と質問対象を踏まえて、日本語で質問に直接答えてください。参考文脈は元会話の抜粋であり、別の会話履歴が存在すると仮定しないでください。対象を特定できない場合は断定せず、不足を述べてください。';

export function isKeepContextLevel(value: unknown): value is KeepContextLevel {
  return typeof value === 'string' && (keepContextLevels as readonly string[]).includes(value);
}

export type KeepContextPreview = {
  source_conversation_id: string;
  source_turn_id: string;
  source_turn_number: number;
  source_highlight_id: string;
  marker_target_text: string;
  context_level: KeepContextLevel;
  previous_turn_limit: number;
  included_turn_ids: string[];
  included_turns: Array<{ turn_id: string; turn_number: number; role: RetrievedTurn['role'] }>;
  first_user_message: string;
  context_strategy: typeof keepContextStrategy;
  strategy_version: typeof keepContextStrategyVersion;
};

export function buildKeepContextMessage(
  turns: readonly RetrievedTurn[],
  targetTurnId: string,
  markerText: string,
  question: string,
): string {
  const context = turns.map(turn => {
    const role = turn.role === 'user' ? 'User' : 'Assistant';
    const targetLabel = turn.turn_id === targetTurnId ? ' / Target' : '';
    return `[T${turn.sequence_no + 1} / ${role}${targetLabel}]\n${turn.content}`;
  }).join('\n\n');
  return `## 参考文脈\n\n${context}\n\n## 質問対象\n\n${markerText}\n\n## 質問\n\n${question}`;
}
