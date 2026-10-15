import { buildContext } from '../../mode-b-poc/context-builder.ts';
import { turns,markers,anchor,fixtureVersion } from './long-fixture.ts';
import {settings as previousSettings,systemPrompt} from './experiment.ts';
export const settings={...previousSettings,model:'google/gemma-4-12b-qat'};
export const levels=[300,800,1500] as const;
export const modes=['S','N'] as const;
export type Level=typeof levels[number];
export type Mode=typeof modes[number];
export function windowFor(source:typeof turns[number],h:ReturnType<typeof anchor>,budget:Level){
 // Reuse read-only anchor validation, without modifying its allowed budget enum.
 buildContext(source,h,'quote_only',{total_context_utf16:300,before_ratio:5,after_ratio:5},'validation',settings.model);
 const half=budget/2,s=h.start_offset,e=h.end_offset;
 let before=Math.min(s,half),after=Math.min(source.content.length-e,half);
 if(before<half) after=Math.min(source.content.length-e,budget-before);
 if(after<half) before=Math.min(s,budget-after);
 const boundaries=[0,...Array.from(new Intl.Segmenter('ja',{granularity:'grapheme'}).segment(source.content),g=>g.index+g.segment.length)];
 return {start:boundaries.find(n=>n>=s-before)!,end:boundaries.filter(n=>n<=e+after).at(-1)!};
}
export function preview(marker:typeof markers[number],mode:Mode,level:Level){
 const source=turns[marker.turn-1],h=anchor(marker),range=windowFor(source,h,level);
 const context=source.content.slice(range.start,range.end);
 const marked=source.content.slice(range.start,h.start_offset)+'【選択箇所開始】'+marker.text+'【選択箇所終了】'+source.content.slice(h.end_offset,range.end);
 const history=mode==='S'?turns.filter(t=>t.status==='completed'&&t.sequence_no<=source.sequence_no):[];
 const question=`[参照文脈]\n${marked}\n\n[Marker Focus]\n${marker.text}\n\n[質問]\n${marker.question}`;
 const request={...settings,messages:[{role:'system',content:systemPrompt},...history.map(t=>({role:t.role,content:t.content})),{role:'user',content:question}]};
 const boundaries=[0,...Array.from(new Intl.Segmenter('ja',{granularity:'grapheme'}).segment(source.content),g=>g.index+g.segment.length)];
 return {experiment:'context-correction-v0.3',fixture_version:fixtureVersion,marker:marker.id,mode,level,condition:`${mode}-${level}`,source_turn:source.turn_id,source_utf16:source.content.length,source_text:marker.text,question:marker.question,anchor:h,local_range:range,context_utf16:context.length,included_percentage:100*context.length/source.content.length,history_turn_ids:history.map(t=>t.turn_id),included_turn_ids:[...new Set([...history.map(t=>t.turn_id),source.turn_id])],history_utf16:history.reduce((n,t)=>n+t.content.length,0),input_utf16:request.messages.reduce((n,t)=>n+t.content.length,0),request,automatic:{marker_match:source.content.slice(h.start_offset,h.end_offset)===marker.text,window_boundaries:boundaries.includes(range.start)&&boundaries.includes(range.end),source_only:range.start>=0&&range.end<=source.content.length,marker_contained:range.start<=h.start_offset&&range.end>=h.end_offset,no_future_turns:history.every(t=>t.sequence_no<=source.sequence_no),mode_match:mode==='S'?history.length===marker.turn:history.length===0,level_match:range.end-range.start<=level+marker.text.length},human_review:'pending'};
}
export function escalation(answer:string){
 const phrases=['参照文脈が不足','文脈が不足','特定できない','特定できません','いずれか','場合による','場合によります','不明','定義がありません','定義されていません'];
 const evidence=phrases.filter(p=>answer.includes(p));
 return {escalation_candidate:evidence.length>0,escalation_evidence:evidence,escalation_method:'literal-screen-v1; review for false positives/negatives; no retry'};
}
