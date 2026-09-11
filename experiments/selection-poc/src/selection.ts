import { anchorProblem } from './contracts.mjs';
import type { State, Highlight } from './types';

export function captureSelection(root: HTMLElement, state: State): Highlight {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) throw new Error('本文を選択してください');
  const range = selection.getRangeAt(0);
  const parent = (node: Node) => node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement;
  const startParent = parent(range.startContainer), endParent = parent(range.endContainer);
  const startTurn = startParent?.closest<HTMLElement>('[data-turn]'), endTurn = endParent?.closest<HTMLElement>('[data-turn]');
  if (!startTurn || startTurn !== endTurn || !root.contains(startTurn)) throw new Error('Turnまたぎ・本文外の選択は拒否します');
  const turn = state.turns.find(t => t.turn_id === startTurn.dataset.turn);
  if (!turn || turn.role !== 'assistant' || turn.status !== 'completed') throw new Error('確定assistant Turnのみ対象です');
  if (startParent?.closest('pre,table') || endParent?.closest('pre,table')) throw new Error('コードブロック・表は対象外です');
  const block = startParent?.closest('[data-block]');
  if (!block || block !== endParent?.closest('[data-block]')) throw new Error('複数段落・ブロックをまたぐ選択は対象外です');
  if (range.startContainer.nodeType !== Node.TEXT_NODE || range.endContainer.nodeType !== Node.TEXT_NODE) throw new Error('要素境界の選択は対象外です');
  const boundary = (node: Node, offset: number) => {
    const span = node.parentElement;
    if (!span?.matches('[data-s][data-e]') || span.childNodes.length !== 1) throw new Error('原文へ正確に変換できない選択です');
    const s = Number(span.dataset.s), e = Number(span.dataset.e);
    if (e - s !== node.textContent!.length || offset < 0 || offset > e - s) throw new Error('原文位置が不正です');
    return s + offset;
  };
  const start = boundary(range.startContainer, range.startOffset), end = boundary(range.endContainer, range.endOffset);
  // Reject selections traversing unmapped text, even if both endpoints are mapped.
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!node.textContent) continue;
    const probe = document.createRange(); probe.selectNodeContents(node);
    if (range.compareBoundaryPoints(Range.END_TO_START, probe) < 0 && range.compareBoundaryPoints(Range.START_TO_END, probe) > 0 && !node.parentElement?.matches('[data-s][data-e]')) throw new Error('原文未対応の文字を含みます');
  }
  const candidate: Highlight = { highlight_id: crypto.randomUUID(), turn_id: turn.turn_id, start_offset: start, end_offset: end, source_text: turn.content.slice(start, end), target_text: selection.toString(), color: 'yellow', note: '', created_at: new Date().toISOString(), status: 'resolved' };
  const problem = anchorProblem(turn, candidate);
  if (problem) throw new Error(problem);
  if (!candidate.target_text.trim()) throw new Error('空白のみは対象外です');
  return candidate;
}

export function jump(root: HTMLElement, id: string) {
  const target = Array.from(root.querySelectorAll<HTMLElement>('[data-highlight]')).find(el => el.dataset.highlight === id);
  if (!target) throw new Error('描画可能なマーカーがありません');
  target.scrollIntoView({ block: 'center', behavior: 'instant' });
  target.focus({ preventScroll: true });
  return target;
}
