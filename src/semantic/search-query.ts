import type { Highlight, Turn } from '../shared/contracts.ts';
import { isGraphemeBoundary } from '../server/storage/repository.ts';

/** Read-only local slice. Same inward grapheme rounding idea as Mode B PoC, no runtime import. */
export function buildSearchQuery(turn:Turn,h:Highlight,variant:'Q1'|'Q2') {
  const start=h.start_offset,end=h.end_offset;
  if(h.status!=='resolved' || turn.status!=='completed' || turn.role!=='assistant' || h.turn_id!==turn.turn_id || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start<0 || end<=start || end>turn.content.length || turn.content.slice(start,end)!==h.source_text || !isGraphemeBoundary(turn.content,start) || !isGraphemeBoundary(turn.content,end)) throw new Error('元マーカーが解決不能のため検索できません');
  if(variant==='Q1') return h.target_text;
  if(variant!=='Q2') throw new Error('Query variantが不正です');
  // At most 150 UTF-16 units on each side, no edge-budget redistribution.
  let left=start,right=end;
  for(const part of new Intl.Segmenter('ja',{granularity:'grapheme'}).segment(turn.content)) {
    if(part.index>=start-150 && part.index<left)left=part.index;
    const boundary=part.index+part.segment.length;
    if(boundary>=end && boundary<=end+150)right=boundary;
  }
  return turn.content.slice(left,start)+h.target_text+turn.content.slice(end,right);
}
