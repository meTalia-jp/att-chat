import { buildContext } from '../../mode-b-poc/context-builder.ts';
import { turns, markers, anchor, fixtureVersion } from './fixture.ts';
export const conditions = ['A','B','C','D'] as const;
export const settings = {model:'unsloth/gemma-4-12b-it-qat',temperature:0,max_tokens:2048,stream:true as const};
export const systemPrompt='引用を質問対象として、日本語で質問に直接答えてください。参照文脈は会話の記録です。学習者が明示した理解状態があれば尊重してください。文脈から特定できない対象は断定せず、不明と述べてください。';
export function preview(marker: typeof markers[number], condition: typeof conditions[number]) {
  const source=turns[marker.turn-1], highlight=anchor(marker);
  const local=buildContext(source,highlight,'same_turn_context',{total_context_utf16:300,before_ratio:5,after_ratio:5},marker.question,settings.model);
  const previous=condition==='C'?2:condition==='D'?6:0;
  const included=condition==='A'?[]:condition==='B'?[source]:turns.slice(Math.max(0,marker.turn-1-previous),marker.turn);
  const context=condition==='A'?'':condition==='B'?`[${source.turn_id} assistant 局所]\n${local.context_before}${marker.text}${local.context_after}`:included.map(t=>`[${t.turn_id} ${t.role}]\n${t.content}`).join('\n\n');
  const content=`[参照文脈]\n${context || 'なし'}\n\n[Marker Focus]\n${marker.text}\n\n[質問]\n${marker.question}`;
  const request={...settings,messages:[{role:'system',content:systemPrompt},{role:'user',content}]};
  return {experiment:'context-correction-v0.1',fixture_version:fixtureVersion,marker:marker.id,condition,source_turn:source.turn_id,included_turn_ids:included.map(t=>t.turn_id),context_utf16:context.length,input_utf16:systemPrompt.length+content.length,source_text:marker.text,question:marker.question,anchor:highlight,local_range:condition==='B'?local.source_range:null,request,automatic:{marker_match:source.content.slice(highlight.start_offset,highlight.end_offset)===marker.text,no_future_turns:included.every(t=>t.sequence_no<=source.sequence_no)},human_review:'pending'};
}
