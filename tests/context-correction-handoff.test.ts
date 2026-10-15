import test from 'node:test';
import assert from 'node:assert/strict';
import { markers,turns,anchor } from '../src/laboratory/context-correction/long-fixture.ts';
import { levels,modes,preview,windowFor,escalation } from '../src/laboratory/context-correction/handoff-experiment.ts';
test('v0.3 Pilot pairs differ only in completed history; independent frozen requests',()=>{
 assert.deepEqual(levels,[300,800,1500]);assert.equal(markers.length*modes.length*levels.length,24);
 for(const m of markers)for(const l of levels){
  const s=preview(m,'S',l),n=preview(m,'N',l);
  assert.deepEqual(s.history_turn_ids,turns.slice(0,20).map(t=>t.turn_id));
  assert.deepEqual(n.history_turn_ids,[]);assert.equal(n.history_utf16,0);
  assert.equal(s.request.messages.length,22);assert.equal(n.request.messages.length,2);
  assert.deepEqual(s.request.messages[0],n.request.messages[0]);
  assert.deepEqual(s.request.messages.at(-1),n.request.messages.at(-1));
  assert.equal(s.input_utf16-n.input_utf16,s.history_utf16);
  assert.equal(s.history_utf16,turns.slice(0,20).reduce((sum,t)=>sum+t.content.length,0));
  for(const p of [s,n]){
   assert.ok(Object.values(p.automatic).every(Boolean));
   assert.equal(p.context_utf16,l+m.text.length);
   assert.equal(p.request.temperature,0);assert.equal(p.request.max_tokens,2048);
   assert.ok(p.included_turn_ids.every(id=>Number(id.slice(1))<=20));
   assert.equal(p.request.messages.at(-1)!.content.split('【選択箇所開始】').length,2);
   assert.deepEqual(p,preview(m,p.mode,p.level));
  }
 }
});
test('v0.3 windows preserve combined graphemes and redistribute at both edges',()=>{
 const content='👩‍🔬e\u0301'.repeat(400),source={...turns[19],content};
 const boundaries=new Set([0,...Array.from(new Intl.Segmenter('ja',{granularity:'grapheme'}).segment(content),g=>g.index+g.segment.length)]);
 for(const start of [0,700,2793])for(const budget of levels){
  const h={...anchor(markers[0]),start_offset:start,end_offset:start+7,source_text:content.slice(start,start+7)};
  const r=windowFor(source,h,budget);
  assert.ok(boundaries.has(r.start)&&boundaries.has(r.end));
  assert.ok(r.start<=start&&r.end>=start+7&&r.end-r.start<=budget+7);
  if(start===0)assert.equal(r.start,0);if(start===2793)assert.equal(r.end,2800);
 }
 assert.equal(escalation('文脈が不足して特定できません').escalation_candidate,true);
 assert.equal(escalation('総運動量です').escalation_candidate,false);
});
