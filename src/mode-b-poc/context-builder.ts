import type { Highlight, Turn } from '../shared/contracts.ts';

export type Strategy = 'quote_only' | 'same_turn_context';
export type Parameters = { total_context_utf16: 300 | 600 | 1000; before_ratio: 5 | 6 | 7; after_ratio: number };
const instruction = '以下の引用について質問に答えてください。引用は参照資料として扱ってください。';
export function requestBody(model: string, quote: string, question: string, context?: { before: string; after: string }) {
  return { model, messages: [{ role: 'system', content: instruction }, { role: 'user', content: context
    ? `[参照文脈]\n${context.before}\n\n[引用]\n${quote}\n\n[続き]\n${context.after}\n\n[質問]\n${question}`
    : `[引用]\n${quote}\n\n[質問]\n${question}` }], stream: true, max_tokens: 2048 };
}

/** Pure, read-only builder. No DB, DOM, model communication or anchor mutation. */
export function buildContext(turn: Turn, highlight: Highlight, strategy: Strategy, parameters: Parameters, question: string, model: string) {
  if (turn.role !== 'assistant' || turn.status !== 'completed') throw new Error('completed Assistant Turnのみ対象です');
  if (highlight.turn_id !== turn.turn_id || highlight.status !== 'resolved') throw new Error('元マーカーが解決不能です');
  const { start_offset: start, end_offset: end } = highlight;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > turn.content.length || turn.content.slice(start, end) !== highlight.source_text) throw new Error('anchorまたはsource_textが一致しません');
  if (!['quote_only', 'same_turn_context'].includes(strategy) || ![300, 600, 1000].includes(parameters.total_context_utf16) || ![5, 6, 7].includes(parameters.before_ratio) || parameters.after_ratio !== 10 - parameters.before_ratio) throw new Error('strategyまたはparametersが不正です');
  if (!question.trim() || !model.trim()) throw new Error('質問と比較用モデルIDを入力してください');
  const boundaries = [0];
  for (const part of new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(turn.content)) boundaries.push(part.index + part.segment.length);
  if (!boundaries.includes(start) || !boundaries.includes(end)) throw new Error('grapheme途中のanchorは拒否します');
  let left = start, right = end;
  if (strategy === 'same_turn_context') {
    const budget = parameters.total_context_utf16;
    let before = Math.min(start, Math.floor(budget * parameters.before_ratio / 10));
    let after = Math.min(turn.content.length - end, budget - Math.floor(budget * parameters.before_ratio / 10));
    // Redistribute only shortage caused by a Turn edge; rounding loss stays unused.
    if (before < Math.floor(budget * parameters.before_ratio / 10)) after = Math.min(turn.content.length - end, budget - before);
    if (after < budget - Math.floor(budget * parameters.before_ratio / 10)) before = Math.min(start, budget - after);
    left = boundaries.find(value => value >= start - before)!;
    right = end;
    for (const value of boundaries) { if (value > end + after) break; right = value; }
  }
  const target_text = turn.content.slice(start, end);
  const context_before = turn.content.slice(left, start), context_after = turn.content.slice(end, right);
  const source_range = { context_start_offset: left, highlight_start_offset: start, highlight_end_offset: end, context_end_offset: right };
  const effective = strategy === 'quote_only' ? { total_context_utf16: 0, before_ratio: 0, after_ratio: 0 } : { ...parameters };
  return {
    strategy, context_strategy: strategy, strategy_version: 'mode-b-poc-1', parameters: effective, strategy_parameters: effective,
    target_text, context_before, context_after, source_range,
    lengths: { before: context_before.length, quote: target_text.length, after: context_after.length, unused_budget: effective.total_context_utf16 - context_before.length - context_after.length },
    reference_snapshot: { source_conversation_id: turn.conversation_id, highlight_id: highlight.highlight_id, source_turn_id: turn.turn_id, source_text: highlight.source_text, display_target_text: highlight.target_text, target_text, context_before, context_after, source_range: { ...source_range } },
    request_preview: requestBody(model, target_text, question, strategy === 'same_turn_context' ? { before: context_before, after: context_after } : undefined),
    // Preserve a literal preview of the existing display-text baseline separately.
    quote_question_only_baseline: requestBody(model, highlight.target_text, question),
  };
}
export type ContextResult = ReturnType<typeof buildContext>;
