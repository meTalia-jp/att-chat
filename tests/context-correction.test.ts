import test from 'node:test';
import assert from 'node:assert/strict';
import { markers, turns, anchor } from '../src/laboratory/context-correction/fixture.ts';
import { conditions, preview, settings, systemPrompt } from '../src/laboratory/context-correction/experiment.ts';

test('Context correction fixed fixture and anchors are reproducible',()=>{
  assert.equal(turns.length,40); assert.equal(markers.length,4);
  turns.forEach((t,i)=>assert.equal(t.role,i%2?'assistant':'user'));
  for(const m of markers) {
    const a=anchor(m);assert.equal(turns[m.turn-1].content.slice(a.start_offset,a.end_offset),m.text);
    const previews=conditions.map(c=>preview(m,c));
    assert.deepEqual(previews.map(p=>p.included_turn_ids.length),[0,1,3,7]);
    for(const p of previews) {
      assert.ok(p.automatic.marker_match && p.automatic.no_future_turns);
      assert.ok(p.included_turn_ids.every(id=>Number(id.slice(1))<=m.turn));
      assert.equal(p.request.model,settings.model);assert.equal(p.request.temperature,0);assert.equal(p.request.max_tokens,2048);
      assert.equal(p.request.messages[0].content,systemPrompt);assert.equal(p.request.messages.length,2);
      assert.equal(p.question,m.question);assert.equal(p.source_text,m.text);
      assert.ok(!p.request.messages[1].content.includes(m.known));
      assert.deepEqual(p,preview(m,p.condition));
    }
    assert.ok(previews[1].local_range!.context_end_offset<=turns[m.turn-1].content.length);
    assert.ok(previews[0].context_utf16<previews[1].context_utf16 && previews[1].context_utf16<previews[2].context_utf16 && previews[2].context_utf16<previews[3].context_utf16);
  }
});
