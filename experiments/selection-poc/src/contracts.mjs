export const FORMAT = 'attchat-selection-poc';
export const VERSION = 1;
export const colors = ['yellow', 'red', 'green', 'blue'];
export const normalizeLF = text => text.replace(/\r\n?/g, '\n');

export function finalizeTurn(turn) {
  if (turn.status === 'completed') throw new Error('確定Turnは変更できません');
  return Object.freeze({ ...turn, content: normalizeLF(turn.content), status: 'completed' });
}

export function isBoundary(text, offset) {
  if (offset === text.length) return true;
  for (const segment of new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(text)) {
    if (segment.index === offset) return true;
    if (segment.index > offset) return false;
  }
  return false;
}

export function anchorProblem(turn, h) {
  if (!turn) return '参照Turnがありません';
  if (turn.role !== 'assistant' || turn.status !== 'completed') return '確定assistant Turnのみ対象です';
  const { start_offset: s, end_offset: e } = h;
  if (!Number.isSafeInteger(s) || !Number.isSafeInteger(e) || s < 0 || s >= e || e > turn.content.length) return '範囲が不正です';
  if (!isBoundary(turn.content, s) || !isBoundary(turn.content, e)) return '文字の途中で切れています';
  if (turn.content.slice(s, e) !== h.source_text) return 'source_text不一致';
  return null;
}

export const overlaps = (a, b) => a.turn_id === b.turn_id && a.start_offset < b.end_offset && b.start_offset < a.end_offset;

export function addHighlight(state, candidate) {
  if (!candidate.highlight_id || state.highlights.some(h => h.highlight_id === candidate.highlight_id)) throw new Error('Highlight IDが重複しています');
  const problem = anchorProblem(state.turns.find(t => t.turn_id === candidate.turn_id), candidate);
  if (problem) throw new Error(problem);
  if (!colors.includes(candidate.color)) throw new Error('色が不正です');
  if (!candidate.target_text.trim()) throw new Error('空白のみは対象外です');
  if (state.highlights.some(h => h.status === 'resolved' && overlaps(h, candidate))) throw new Error('重複・包含するマーカーは登録できません');
  return { ...state, highlights: [...state.highlights, { ...candidate, status: 'resolved' }] };
}

export function serialize(state) {
  return JSON.stringify({ format: FORMAT, schema_version: VERSION, turns: state.turns, highlights: state.highlights }, null, 2);
}

export function deserialize(json) {
  const data = JSON.parse(json);
  if (data?.format !== FORMAT || data.schema_version !== VERSION || !Array.isArray(data.turns) || !Array.isArray(data.highlights)) throw new Error('形式または版が不正です');
  const ids = new Set();
  const sequences = new Set();
  const turns = data.turns.map(t => {
    if (!t || typeof t.turn_id !== 'string' || !t.turn_id || ids.has(t.turn_id) || typeof t.content !== 'string' || t.content.includes('\r') || !['assistant', 'user'].includes(t.role) || !['completed', 'generating', 'cancelled', 'failed'].includes(t.status) || !Number.isSafeInteger(t.sequence_no) || t.sequence_no < 0 || sequences.has(t.sequence_no)) throw new Error('Turnの形式・ID・順序・改行が不正です');
    ids.add(t.turn_id); sequences.add(t.sequence_no);
    return Object.freeze({ turn_id: t.turn_id, sequence_no: t.sequence_no, role: t.role, status: t.status, content: t.content });
  }).sort((a, b) => a.sequence_no - b.sequence_no);
  ids.clear();
  const highlights = data.highlights.map(h => {
    if (!h || typeof h.highlight_id !== 'string' || !h.highlight_id || ids.has(h.highlight_id) || typeof h.turn_id !== 'string' || typeof h.source_text !== 'string' || typeof h.target_text !== 'string' || !h.target_text.trim() || !colors.includes(h.color) || typeof h.note !== 'string' || typeof h.created_at !== 'string' || !Number.isFinite(Date.parse(h.created_at))) throw new Error('Highlight形式またはIDが不正です');
    ids.add(h.highlight_id);
    const reason = anchorProblem(turns.find(t => t.turn_id === h.turn_id), h);
    return { highlight_id: h.highlight_id, turn_id: h.turn_id, start_offset: h.start_offset, end_offset: h.end_offset, source_text: h.source_text, target_text: h.target_text, color: h.color, note: h.note, created_at: h.created_at, status: reason ? 'unresolved' : 'resolved', reason };
  });
  // Imported overlapping anchors are all quarantined, independent of array order.
  const conflicted = new Set();
  for (let i = 0; i < highlights.length; i++) for (let j = i + 1; j < highlights.length; j++) {
    if (highlights[i].status === 'resolved' && highlights[j].status === 'resolved' && overlaps(highlights[i], highlights[j])) { conflicted.add(i); conflicted.add(j); }
  }
  for (const i of conflicted) Object.assign(highlights[i], { status: 'unresolved', reason: '復元データ内で重複' });
  return { turns, highlights };
}
