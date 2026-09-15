import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContext, requestBody, type Parameters } from '../src/mode-b-poc/context-builder.ts';
import type { Turn, Highlight } from '../src/shared/contracts.ts';

function fixture(before = 'あ'.repeat(1200), quote = '引用😀', after = 'Z'.repeat(1200)) {
  const turn: Turn = { turn_id: 't', conversation_id: 'c', sequence_no: 1, role: 'assistant', status: 'completed', content: before + quote + after, created_at: '', finalized_at: '' };
  const h: Highlight = { highlight_id: 'h', turn_id: 't', start_offset: before.length, end_offset: before.length + quote.length, source_text: quote, target_text: quote, color: 'yellow', note: '', status: 'resolved', reason: null, created_at: '', updated_at: '' };
  return { turn, h };
}
const p: Parameters = { total_context_utf16: 600, before_ratio: 6, after_ratio: 4 };
const run = (f: ReturnType<typeof fixture>, parameters = p) => buildContext(f.turn, f.h, 'same_turn_context', parameters, '質問', 'fixed-model');
test('Mode B quote_onlyと既存quote_question_only baseline、入力不変', () => {
  const f = fixture(); const saved = structuredClone(f);
  const r = buildContext(f.turn, f.h, 'quote_only', p, '質問', 'fixed-model');
  assert.equal(r.context_before + r.context_after, ''); assert.equal(r.parameters.total_context_utf16, 0);
  assert.deepEqual(r.request_preview, requestBody('fixed-model', '引用😀', '質問'));
  assert.deepEqual(r.request_preview, r.quote_question_only_baseline); assert.deepEqual(f, saved);
});
for (const total_context_utf16 of [300,600,1000] as const) for (const before_ratio of [5,6,7] as const) {
  test(`Mode B ${total_context_utf16}/${before_ratio}:${10-before_ratio} 再現可能・中央offset`, () => {
    const f = fixture(); const parameters = { total_context_utf16, before_ratio, after_ratio: 10-before_ratio };
    const r = run(f, parameters); assert.deepEqual(r, run(f, parameters));
    assert.equal(r.lengths.before, total_context_utf16 * before_ratio / 10);
    assert.equal(r.lengths.after, total_context_utf16 * (10-before_ratio) / 10);
    assert.equal(r.source_range.context_start_offset, 1200-r.lengths.before);
    assert.equal(r.source_range.context_end_offset, 1204+r.lengths.after);
    assert.equal(r.request_preview.model, 'fixed-model'); assert.equal(r.request_preview.messages.length,2);
    assert.equal(r.request_preview.messages[1].content, `[参照文脈]\n${r.context_before}\n\n[引用]\n引用😀\n\n[続き]\n${r.context_after}\n\n[質問]\n質問`);
  });
}
for (const [before, after, expected] of [[50,1200,[50,550]], [1200,50,[550,50]], [0,1200,[0,600]], [1200,0,[600,0]], [20,30,[20,30]]] as const) {
  test(`Mode B Turn端再配分 ${before}/${after}`, () => {
    const r = run(fixture('a'.repeat(before),'引用','b'.repeat(after)));
    assert.deepEqual([r.lengths.before,r.lengths.after],expected);
    assert.equal(r.lengths.unused_budget,600-expected[0]-expected[1]);
  });
}
for (const cluster of ['😀','👩‍👩‍👧‍👦','e\u0301','か\u3099']) {
  test(`Mode B grapheme境界 ${cluster}`, () => {
    const f = fixture(cluster.repeat(200),'引用',cluster.repeat(200));
    const boundaries = new Set([0,...Array.from(new Intl.Segmenter('ja',{granularity:'grapheme'}).segment(f.turn.content),s=>s.index+s.segment.length)]);
    for (const budget of [300,600,1000] as const) for (const ratio of [5,6,7] as const) {
      const r = run(f,{total_context_utf16:budget,before_ratio:ratio,after_ratio:10-ratio});
      assert.ok(Object.values(r.source_range).every(n=>boundaries.has(n)));
      assert.ok(r.lengths.before+r.lengths.after<=budget);
      assert.equal(r.context_before+r.target_text+r.context_after, f.turn.content.slice(r.source_range.context_start_offset,r.source_range.context_end_offset));
    }
    f.h.start_offset=1; f.h.source_text=f.turn.content.slice(1,f.h.end_offset); assert.throws(()=>run(f),/grapheme/);
  });
}
test('Mode B repeated textはoffset基準、Markdown原文と表示baselineを区別', () => {
  const f=fixture('同じ **語**。','同じ **語**','。同じ **語**'); f.h.target_text='同じ 語';
  const r=run(f); assert.equal(r.source_range.highlight_start_offset,9); assert.equal(r.target_text,'同じ **語**');
  assert.equal(r.reference_snapshot.display_target_text,'同じ 語');
  assert.equal(r.quote_question_only_baseline.messages[1].content,'[引用]\n同じ 語\n\n[質問]\n質問');
  assert.ok(r.request_preview.messages[1].content.includes('同じ **語**'));
});
test('Mode B unresolved・不一致・会話外Turn・不正offset拒否', () => {
  for (const patch of [{status:'unresolved'}, {source_text:'違う'}, {turn_id:'other'}, {start_offset:-1}, {end_offset:Infinity}, {start_offset:0.5}] ) {
    const f=fixture(); Object.assign(f.h,patch); assert.throws(()=>run(f));
  }
});
test('Mode B User・generating・failed・cancelled拒否', () => {
  const f=fixture(); f.turn.role='user'; assert.throws(()=>run(f));
  f.turn.role='assistant'; for(const status of ['generating','failed','cancelled'] as const) { f.turn.status=status; assert.throws(()=>run(f)); }
});
test('Mode B 不正parameters・空質問・空モデル拒否',()=>{
  const f=fixture();
  for(const bad of [{...p,total_context_utf16:301},{...p,before_ratio:8},{...p,after_ratio:5}]) assert.throws(()=>run(f,bad as Parameters));
  assert.throws(()=>buildContext(f.turn,f.h,'quote_only',p,'','m'));
  assert.throws(()=>buildContext(f.turn,f.h,'quote_only',p,'q',''));
});
