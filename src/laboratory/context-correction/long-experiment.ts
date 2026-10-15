import { buildContext } from '../../mode-b-poc/context-builder.ts';
import { turns, markers, anchor, fixtureVersion } from './long-fixture.ts';
import { settings, systemPrompt, conditions } from './experiment.ts';
export { settings, conditions };

// Mode B validates anchors. Its 1000-character slice is narrowed to 800 locally.
export function localWindow(source: typeof turns[number], highlight: ReturnType<typeof anchor>, budget:300|800) {
 const base=buildContext(source,highlight,'same_turn_context',{total_context_utf16:budget===300?300:1000,before_ratio:5,after_ratio:5},'validation',settings.model);
 if(budget===300) return base.source_range;
 const bounds=[0,...Array.from(new Intl.Segmenter('ja',{granularity:'grapheme'}).segment(source.content),s=>s.index+s.segment.length)];
 const {start_offset:s,end_offset:e}=highlight;
 let before=Math.min(s,400),after=Math.min(source.content.length-e,400);
 if(before<400) after=Math.min(source.content.length-e,800-before);
 if(after<400) before=Math.min(s,800-after);
 return {context_start_offset:bounds.find(n=>n>=s-before)!,highlight_start_offset:s,highlight_end_offset:e,context_end_offset:bounds.filter(n=>n<=e+after).at(-1)!};
}
export function preview(marker:typeof markers[number],condition:typeof conditions[number]) {
 const source=turns[marker.turn-1],h=anchor(marker);
 const range=condition==='B'||condition==='C'?localWindow(source,h,condition==='B'?300:800):{context_start_offset:condition==='A'?h.start_offset:0,context_end_offset:condition==='A'?h.end_offset:source.content.length,highlight_start_offset:h.start_offset,highlight_end_offset:h.end_offset};
 const context=condition==='A'?'':source.content.slice(range.context_start_offset,range.context_end_offset);
 // Explicitly mark the selected occurrence; identical text elsewhere must not steal Focus.
 const markedContext=condition==='A'?'なし':source.content.slice(range.context_start_offset,h.start_offset)+'【選択箇所開始】'+marker.text+'【選択箇所終了】'+source.content.slice(h.end_offset,range.context_end_offset);
 const content=`[参照文脈]\n${markedContext}\n\n[Marker Focus]\n${marker.text}\n\n[質問]\n${marker.question}`;
 const request={...settings,messages:[{role:'system',content:systemPrompt},{role:'user',content}]};
 const boundaries=[0,...Array.from(new Intl.Segmenter('ja',{granularity:'grapheme'}).segment(source.content),s=>s.index+s.segment.length)];
 return {experiment:'context-correction-v0.2',fixture_version:fixtureVersion,marker:marker.id,condition,source_turn:source.turn_id,source_utf16:source.content.length,source_text:marker.text,question:marker.question,anchor:h,local_range:condition==='A'?null:range,context_utf16:context.length,included_percentage:100*context.length/source.content.length,input_utf16:request.messages.reduce((n,m)=>n+m.content.length,0),included_turn_ids:condition==='A'?[]:[source.turn_id],request,automatic:{marker_match:source.content.slice(h.start_offset,h.end_offset)===marker.text,window_boundaries:[range.context_start_offset,range.context_end_offset,h.start_offset,h.end_offset].every(n=>boundaries.includes(n)),source_only:range.context_start_offset>=0&&range.context_end_offset<=source.content.length,no_future_turns:true},human_review:'pending'};
}
