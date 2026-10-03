import type { DatabaseSync } from 'node:sqlite';
import type { Highlight } from '../shared/contracts.ts';
import type { ContextPreview, PreviewParameters, PreviewSection } from '../shared/context-preview.ts';
import {
  buildKeepContextMessage,
  isKeepContextLevel,
  keepContextPreviousTurns,
  keepContextStrategy,
  keepContextStrategyVersion,
  type KeepContextPreview,
} from '../shared/production-keep-context.ts';
import { RetrievalService } from '../retrieval/service.ts';

export const PREVIEW_MAX_UTF16=20000;
export class PreviewError extends Error {
  code:string;status:number;
  constructor(code:string,message:string,status=400){super(message);this.code=code;this.status=status;}
}
export function previewParameters(input:Record<string,unknown>):PreviewParameters {
  const p={strategy:'A',local_budget:600,local_ratio:'5:5',before_turns:1,after_turns:1,...input};
  if(Object.keys(input).some(k=>!['strategy','local_budget','local_ratio','before_turns','after_turns'].includes(k))||!['A','A+B'].includes(p.strategy as string)||![300,600,1000].includes(p.local_budget as number)||!['5:5','6:4','7:3'].includes(p.local_ratio as string)||![p.before_turns,p.after_turns].every(n=>Number.isInteger(n)&&Number(n)>=0&&Number(n)<=3))throw new PreviewError('INVALID_PARAMETERS','比較条件が不正です');
  return p as PreviewParameters;
}
/** SELECT-only adapter: never call the mutating Highlight resolution path. */
export class ContextPreviewService {
  private db:DatabaseSync; private retrieval:RetrievalService;
  constructor(db:DatabaseSync,retrieval:RetrievalService){this.db=db;this.retrieval=retrieval;}
  build(conversationId:string,highlightId:string,input:Record<string,unknown>={}):ContextPreview {
    const parameters=previewParameters(input);
    const h=this.db.prepare('SELECT h.* FROM highlights h JOIN turns t ON t.turn_id=h.turn_id WHERE h.highlight_id=? AND t.conversation_id=?').get(highlightId,conversationId) as Highlight|undefined;
    if(!h)throw new PreviewError('HIGHLIGHT_NOT_FOUND','マーカーがありません',404);
    const t=this.retrieval.getTurn(h.turn_id),s=h.start_offset,e=h.end_offset;
    if(t.role!=='assistant'||h.status!=='resolved'||!Number.isSafeInteger(s)||!Number.isSafeInteger(e)||s<0||e<=s||e>t.content.length||t.content.slice(s,e)!==h.source_text)throw new PreviewError('INVALID_ANCHOR','マーカーの原文または状態が一致しません',409);
    const boundaries=[0];for(const part of new Intl.Segmenter('ja',{granularity:'grapheme'}).segment(t.content))boundaries.push(part.index+part.segment.length);
    if(!boundaries.includes(s)||!boundaries.includes(e))throw new PreviewError('INVALID_ANCHOR','grapheme途中のanchorです',409);
    // Selective port of Mode B PoC: edge shortage is redistributed; grapheme rounding loss is not.
    const budget=parameters.local_budget,quota=Math.floor(budget*Number(parameters.local_ratio[0])/10);
    let before=Math.min(s,quota),after=Math.min(t.content.length-e,budget-quota);
    if(before<quota)after=Math.min(t.content.length-e,budget-before);
    if(after<budget-quota)before=Math.min(s,budget-after);
    const left=boundaries.find(n=>n>=s-before)!;let right=e;
    for(const n of boundaries){if(n>e+after)break;right=n;}
    const local:PreviewSection={source:'local',turn_id:t.turn_id,sequence_no:t.sequence_no,role:t.role,before:t.content.slice(left,s),highlight:h.source_text,after:t.content.slice(e,right),start_offset:left,end_offset:right,display_target_text:h.target_text};
    const context=parameters.strategy==='A+B'?this.retrieval.getTurnContext(t.turn_id,parameters.before_turns,parameters.after_turns):null;
    const sections:PreviewSection[]=context?context.turns.map(turn=>turn.turn_id===t.turn_id?local:{source:turn.sequence_no<t.sequence_no?'temporal_before':'temporal_after',turn_id:turn.turn_id,sequence_no:turn.sequence_no,role:turn.role,content:turn.content}):[local];
    const content=(section:PreviewSection)=>section.source==='local'?section.before+section.highlight+section.after:section.content;
    const request_preview=sections.map(section=>`[${section.source} ${section.role} #${section.sequence_no}]\n${content(section)}`).join('\n\n');
    if(request_preview.length>PREVIEW_MAX_UTF16)throw new PreviewError('PREVIEW_TOO_LARGE',`Preview ${request_preview.length} UTF-16 が上限 ${PREVIEW_MAX_UTF16} を超えています`,413);
    return {strategy:parameters.strategy,highlight_id:h.highlight_id,anchor_turn_id:t.turn_id,parameters,sections,request_preview,total_utf16:request_preview.length,content_utf16:sections.reduce((n,section)=>n+content(section).length,0),max_utf16:PREVIEW_MAX_UTF16,before_returned:context?.metadata.before_returned??0,after_returned:context?.metadata.after_returned??0};
  }

  buildKeepQuestion(conversationId:string,highlightId:string,question:unknown,level:unknown):KeepContextPreview {
    if(typeof question!=='string'||!question.trim()||question.length>10000||question.includes('\0'))throw new PreviewError('INVALID_QUESTION','質問が空、長すぎる、または不正です');
    if(!isKeepContextLevel(level))throw new PreviewError('INVALID_CONTEXT_LEVEL','引継ぎContextが不正です');
    const normalized=question.replace(/\r\n?/g,'\n');
    const h=this.db.prepare('SELECT h.* FROM highlights h JOIN turns t ON t.turn_id=h.turn_id WHERE h.highlight_id=? AND t.conversation_id=?').get(highlightId,conversationId) as Highlight|undefined;
    if(!h)throw new PreviewError('HIGHLIGHT_NOT_FOUND','マーカーがありません',404);
    const target=this.retrieval.getTurn(h.turn_id),s=h.start_offset,e=h.end_offset;
    if(target.role!=='assistant'||h.status!=='resolved'||!Number.isSafeInteger(s)||!Number.isSafeInteger(e)||s<0||e<=s||e>target.content.length||target.content.slice(s,e)!==h.source_text)throw new PreviewError('INVALID_ANCHOR','マーカーの原文または状態が一致しません',409);
    const context=this.retrieval.getTurnContext(target.turn_id,keepContextPreviousTurns[level],0);
    const included=context.turns;
    if(included.at(-1)?.turn_id!==target.turn_id||included.filter(turn=>turn.turn_id===target.turn_id).length!==1)throw new PreviewError('INVALID_CONTEXT','Target Turnを一度だけ取得できません',409);
    return {
      source_conversation_id:conversationId,
      source_turn_id:target.turn_id,
      source_turn_number:target.sequence_no+1,
      source_highlight_id:h.highlight_id,
      marker_target_text:h.target_text,
      context_level:level,
      previous_turn_limit:keepContextPreviousTurns[level],
      included_turn_ids:included.map(turn=>turn.turn_id),
      included_turns:included.map(turn=>({turn_id:turn.turn_id,turn_number:turn.sequence_no+1,role:turn.role})),
      first_user_message:buildKeepContextMessage(included,target.turn_id,h.target_text,normalized),
      context_strategy:keepContextStrategy,
      strategy_version:keepContextStrategyVersion,
    };
  }
}
