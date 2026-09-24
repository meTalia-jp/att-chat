import type { HighlightColor } from '../shared/contracts.ts';

export type SelectionPoint = { paragraph: number; offset: number };
export type QuickMarker = {
  marker_id: string;
  color: HighlightColor;
  start: SelectionPoint;
  end: SelectionPoint;
  selected_text: string;
  memo: string;
  attention: string;
};

export type PalettePosition = { left: number; top: number; placement: 'above' | 'below' };

export function palettePosition(
  rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
  viewport: { width: number; height: number },
  palette = { width: 148, height: 40 },
  margin = 8,
  preferBelow = false,
): PalettePosition {
  const maxLeft = Math.max(margin, viewport.width - palette.width - margin);
  const left = Math.min(maxLeft, Math.max(margin, (rect.left + rect.right - palette.width) / 2));
  const above = rect.top - palette.height - margin;
  const placement = preferBelow ? (rect.bottom + margin + palette.height <= viewport.height - margin ? 'below' : 'above') : (above >= margin ? 'above' : 'below');
  const rawTop = placement === 'above' ? above : rect.bottom + margin;
  const maxTop = Math.max(margin, viewport.height - palette.height - margin);
  return { left, top: Math.min(maxTop, Math.max(margin, rawTop)), placement };
}

export function textareaHeight(scrollHeight: number, minHeight: number, maxHeight: number) {
  const height = Math.min(maxHeight, Math.max(minHeight, scrollHeight));
  return { height, overflowY: scrollHeight > maxHeight ? 'auto' as const : 'hidden' as const };
}

export function overlaps(a: Pick<QuickMarker, 'start' | 'end'>, b: Pick<QuickMarker, 'start' | 'end'>) {
  const before = (x: SelectionPoint, y: SelectionPoint) => x.paragraph < y.paragraph || (x.paragraph === y.paragraph && x.offset < y.offset);
  return before(a.start, b.end) && before(b.start, a.end);
}

export function paragraphSlice(marker: QuickMarker, paragraph: number, length: number) {
  if (paragraph < marker.start.paragraph || paragraph > marker.end.paragraph) return null;
  const start = paragraph === marker.start.paragraph ? marker.start.offset : 0;
  const end = paragraph === marker.end.paragraph ? marker.end.offset : length;
  return start < end ? { start, end } : null;
}
