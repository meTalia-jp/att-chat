import type { Highlight, HighlightColor, Turn } from '../shared/contracts.ts';

export const highlightColors: HighlightColor[] = ['yellow', 'red', 'green', 'blue'];

/** Display only: never use this value for persistence or anchor resolution. */
export function markerExcerpt(targetText: string) {
  let count = 0;
  for (const segment of new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(targetText)) {
    if (count++ === 60) return { text: targetText.slice(0, segment.index) + '…', truncated: true };
  }
  return { text: targetText, truncated: false };
}

export function filterHighlights(highlights: Highlight[], enabled: ReadonlySet<HighlightColor>) {
  return highlights.filter(highlight => enabled.has(highlight.color));
}

export function orderHighlights(highlights: Highlight[], turns: Turn[]) {
  const sequence = new Map(turns.map(turn => [turn.turn_id, turn.sequence_no]));
  return [...highlights].sort((left, right) => (sequence.get(left.turn_id) ?? Number.MAX_SAFE_INTEGER) - (sequence.get(right.turn_id) ?? Number.MAX_SAFE_INTEGER) || left.start_offset - right.start_offset || left.highlight_id.localeCompare(right.highlight_id));
}

export function locateHighlightElements(root: HTMLElement, highlight: Highlight): HTMLElement[] {
  if (highlight.status !== 'resolved') return [];
  const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-highlight]'))
    .filter(element => element.dataset.highlight === highlight.highlight_id)
    .filter(element => element.closest<HTMLElement>('[data-turn]')?.dataset.turn === highlight.turn_id)
    .sort((left, right) => Number(left.dataset.s) - Number(right.dataset.s));
  if (!elements.length) return [];
  const ranges = elements.map(element => ({ start: Number(element.dataset.s), end: Number(element.dataset.e) }));
  if (ranges.some(range => !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start >= range.end)) return [];
  if (ranges[0].start !== highlight.start_offset || ranges.at(-1)!.end !== highlight.end_offset) return [];
  if (ranges.some((range, index) => index > 0 && ranges[index - 1].end > range.start)) return [];
  return elements;
}
