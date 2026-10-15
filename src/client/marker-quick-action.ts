export type MarkerQuickActionPosition = { left: number; top: number };
export type MarkerInteractionAnchor = { x: number; y: number; lineTop: number; lineBottom: number };

export const markerQuickActionSize = { width: 276, height: 44 } as const;

type RectLike = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>;

export function markerInteractionAnchor(rect: RectLike): MarkerInteractionAnchor {
  return { x: rect.left, y: rect.bottom, lineTop: rect.top, lineBottom: rect.bottom };
}

export function pointerInteractionAnchor(rects: Iterable<RectLike>, x: number, y: number): MarkerInteractionAnchor | null {
  const lines = Array.from(rects);
  if (!lines.length) return null;
  const line = lines.find(rect => y >= rect.top && y <= rect.bottom)
    ?? lines.reduce((best, rect) => {
      const distance = y < rect.top ? rect.top - y : y - rect.bottom;
      const bestDistance = y < best.top ? best.top - y : y - best.bottom;
      return distance < bestDistance ? rect : best;
    });
  return { x, y, lineTop: line.top, lineBottom: line.bottom };
}

function renderedRects(range: Range): DOMRect[] {
  return Array.from(range.getClientRects?.() ?? []).filter(rect => rect.height > 0);
}

function anchorFromCaretRect(rect: RectLike, x = rect.left): MarkerInteractionAnchor {
  return { x, y: rect.bottom, lineTop: rect.top, lineBottom: rect.bottom };
}

/** Captures the user's drag endpoint instead of the selection range's final painted fragment. */
export function selectionFocusInteractionAnchor(selection: Selection, ownerDocument: Document): MarkerInteractionAnchor | null {
  const node = selection.focusNode;
  if (!node) return null;
  const offset = selection.focusOffset;
  try {
    const caret = ownerDocument.createRange();
    caret.setStart(node, offset);
    caret.collapse(true);
    const caretRect = renderedRects(caret).at(-1) ?? caret.getBoundingClientRect();
    if (caretRect.height > 0) return anchorFromCaretRect(caretRect);

    const probe = ownerDocument.createRange();
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (offset > 0) {
        const previousUnit = text.charCodeAt(offset - 1);
        const start = Math.max(0, offset - (previousUnit >= 0xdc00 && previousUnit <= 0xdfff ? 2 : 1));
        probe.setStart(node, start); probe.setEnd(node, offset);
        const rect = renderedRects(probe).at(-1) ?? probe.getBoundingClientRect();
        return rect.height > 0 ? anchorFromCaretRect(rect, rect.right) : null;
      }
      if (offset < text.length) {
        const length = (text.codePointAt(offset) ?? 0) > 0xffff ? 2 : 1;
        probe.setStart(node, offset); probe.setEnd(node, Math.min(text.length, offset + length));
        const rect = renderedRects(probe).at(0) ?? probe.getBoundingClientRect();
        return rect.height > 0 ? anchorFromCaretRect(rect, rect.left) : null;
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      if (offset > 0) {
        probe.selectNode(element.childNodes[offset - 1]);
        const rect = renderedRects(probe).at(-1) ?? probe.getBoundingClientRect();
        return rect.height > 0 ? anchorFromCaretRect(rect, rect.right) : null;
      }
      if (offset < element.childNodes.length) {
        probe.selectNode(element.childNodes[offset]);
        const rect = renderedRects(probe).at(0) ?? probe.getBoundingClientRect();
        return rect.height > 0 ? anchorFromCaretRect(rect, rect.left) : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function markerQuickActionPosition(
  anchor: MarkerInteractionAnchor,
  viewportWidth: number,
  viewportHeight: number,
  margin = 8,
  gap = 10,
): MarkerQuickActionPosition {
  const { width, height } = markerQuickActionSize;
  const left = Math.max(margin, Math.min(anchor.x, viewportWidth - width - margin));
  const below = anchor.lineBottom + gap;
  const preferredTop = below + height <= viewportHeight - margin
    ? below
    : anchor.lineTop - height - gap;
  const top = Math.max(margin, Math.min(preferredTop, viewportHeight - height - margin));
  return { left, top };
}

export function markerDetailPosition(
  anchor: MarkerInteractionAnchor,
  viewportWidth: number,
  viewportHeight: number,
  panelWidth: number,
  panelHeight: number,
  margin = 8,
  gap = 10,
): MarkerQuickActionPosition {
  const safeWidth = Math.min(panelWidth, Math.max(0, viewportWidth - margin * 2));
  const safeHeight = Math.min(panelHeight, Math.max(0, viewportHeight - margin * 2));
  const left = Math.max(margin, Math.min(anchor.x, viewportWidth - safeWidth - margin));
  const below = anchor.lineBottom + gap;
  const preferredTop = below + safeHeight <= viewportHeight - margin
    ? below
    : anchor.lineTop - safeHeight - gap;
  const top = Math.max(margin, Math.min(preferredTop, viewportHeight - safeHeight - margin));
  return { left, top };
}
