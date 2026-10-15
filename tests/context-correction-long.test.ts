import test from 'node:test';
import assert from 'node:assert/strict';
import {longSource,turns,markers,anchor} from '../src/laboratory/context-correction/long-fixture.ts';
import {conditions,preview,localWindow} from '../src/laboratory/context-correction/long-experiment.ts';
test('v0.2 fixed long Source, distinct repeated anchors, independent source-only requests',()=>{
 assert.equal(turns.length,32);assert.ok(longSource.length>=2000&&longSource.length<=4000);
 turns.forEach((t,i)=>assert.equal(t.role,i%2?'assistant':'user'));
 assert.equal(new Set(markers.map(m=>anchor(m).start_offset)).size,4);
 for(const m of markers){
  const results=conditions.map(c=>preview(m,c));
  for(const p of results){
   assert.ok(Object.values(p.automatic).every(Boolean));
   assert.deepEqual(p.included_turn_ids,p.condition==='A'?[]:['T20']);
   assert.equal(p.request.messages.length,2);
   assert.ok(!p.request.messages[1].content.includes(m.required_prerequisite));
   assert.equal(p.request.model,results[0].request.model);
   assert.equal(p.request.messages[0].content,results[0].request.messages[0].content);
   assert.equal(p.request.temperature,0);assert.equal(p.request.max_tokens,2048);
   if(p.condition!=='A') {
    assert.equal(p.request.messages[1].content.split('【選択箇所開始】').length,2);
    assert.ok(p.request.messages[1].content.includes(`【選択箇所開始】${m.text}【選択箇所終了】`));
   }
   assert.deepEqual(p,preview(m,p.condition));
   if(p.local_range){
    const r=p.local_range; assert.ok(r.context_start_offset<=p.anchor.start_offset&&r.context_end_offset>=p.anchor.end_offset);
    assert.equal(p.context_utf16,r.context_end_offset-r.context_start_offset);
    assert.ok(Math.abs(p.included_percentage-p.context_utf16/longSource.length*100)<1e-10);
   }
  }
  assert.equal(results[1].context_utf16,300+m.text.length);
  assert.equal(results[2].context_utf16,800+m.text.length);
  assert.ok(results[1].context_utf16<results[2].context_utf16&&results[2].context_utf16<longSource.length);
  assert.equal(results[3].context_utf16,longSource.length);
 }
 // Intended prerequisite distance is fixed before observing model responses.
 assert.ok(!preview(markers[1],'B').request.messages[1].content.includes('Δは、'));
 assert.ok(preview(markers[1],'C').request.messages[1].content.includes('Δは、'));
 assert.ok(!preview(markers[2],'C').request.messages[1].content.includes('台帳Q」は'));
});
test('local wrapper respects graphemes, Turn edges and invalid anchor rejection',()=>{
 const content='👩‍🔬e\u0301'.repeat(250);
 const source={...turns[19],content};
 for(const index of [0,100,249]) for(const budget of [300,800] as const){
  const start=index*7,h={...anchor(markers[0]),start_offset:start,end_offset:start+7,source_text:content.slice(start,start+7)};
  const r=localWindow(source,h,budget);
  const bounds=new Set([0,...Array.from(new Intl.Segmenter('ja',{granularity:'grapheme'}).segment(content),s=>s.index+s.segment.length)]);
  assert.ok(bounds.has(r.context_start_offset)&&bounds.has(r.context_end_offset));
  assert.ok(r.context_start_offset<=start&&r.context_end_offset>=start+7);
  assert.ok(r.context_end_offset-r.context_start_offset<=budget+7);
 }
 assert.throws(()=>localWindow(source,{...anchor(markers[0]),start_offset:1,end_offset:2,source_text:content.slice(1,2)},800));
});
