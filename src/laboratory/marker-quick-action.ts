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

// Align the right-arrow center 12px to the right of the final selected line.
// The 216px Signal has its arrow center 21px inside the right edge.
export function endSignalPosition(rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>, viewport: { width: number; height: number }, size = { width: 216, height: 44 }): PalettePosition {
  const position = palettePosition(rect, viewport, size, 8, true);
  return { ...position, left: Math.min(Math.max(8, viewport.width - size.width - 8), Math.max(8, rect.right + 12 - size.width + 21)) };
}

export function quickMenuPosition(signal: Pick<DOMRect, 'left' | 'right' | 'top'>, viewport: { width: number; height: number }, size: { width: number; height: number }) {
  const side = signal.right + 8 + size.width <= viewport.width - 8 ? 'right' : 'left';
  const desiredLeft = side === 'right' ? signal.right + 8 : signal.left - 8 - size.width;
  return {
    side,
    left: Math.min(Math.max(8, viewport.width - size.width - 8), Math.max(8, desiredLeft)),
    top: Math.min(Math.max(8, viewport.height - size.height - 8), Math.max(8, signal.top)),
  };
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
