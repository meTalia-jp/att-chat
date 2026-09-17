import type { Highlight } from '../shared/contracts.ts';
import { locateHighlightElements } from './marker-list.ts';

const clamp = (n: number) => Math.max(0, Math.min(1, n));
export function viewportRange(top: number, height: number, viewportHeight: number) {
  if (height <= 0 || top >= viewportHeight || top + height <= 0) return null;
  return { start: clamp(-top / height), end: clamp((viewportHeight - top) / height) };
}

/** Horizontal lanes preserve the measured vertical position even in dense groups. */
export function markerLanes(positions: number[], height: number) {
  const ends: number[] = [];
  return positions.map(position => {
    const y = position * height;
    let lane = ends.findIndex(end => y - end >= 22);
    if (lane < 0) lane = ends.length;
    ends[lane] = y;
    return lane;
  });
}

export function measureMinimap(root: HTMLElement, highlights: Highlight[], viewportHeight: number) {
  const rect = root.getBoundingClientRect();
  const normalize = (top: number) => clamp((top - rect.top) / Math.max(1, rect.height));
  const turns = Array.from(root.querySelectorAll<HTMLElement>('article[data-turn]')).map(element => ({ id: element.dataset.turn!, position: normalize(element.getBoundingClientRect().top) }));
  const markers = highlights.flatMap(highlight => {
    const elements = locateHighlightElements(root, highlight);
    return elements.length ? [{ highlight, position: normalize(elements[0].getBoundingClientRect().top) }] : [];
  }).sort((a, b) => a.position - b.position || a.highlight.start_offset - b.highlight.start_offset || a.highlight.highlight_id.localeCompare(b.highlight.highlight_id));
  return { turns, markers, unknown: highlights.length - markers.length, viewport: viewportRange(rect.top, rect.height, viewportHeight) };
}
