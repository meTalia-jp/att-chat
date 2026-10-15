import {
  buildNewChatHandoffPreview, buildNewChatHandoffRequest, newChatHandoffExperimentSources,
  type HandoffPast,
} from './new-chat-handoff.ts';

export const newChatHandoffConditions = [0,300,800,1500] as const;
export type NewChatHandoffCondition = typeof newChatHandoffConditions[number];

export function newChatHandoffExperimentPreview(sourceIndex:number,condition:NewChatHandoffCondition){
  const source=newChatHandoffExperimentSources[sourceIndex];
  if(!source)throw new Error('Unknown fixture source');
  const handoff=condition!==0;
  const result=buildNewChatHandoffPreview(source,handoff,(condition||300) as HandoffPast,0);
  if(result.status!=='ready')throw new Error(result.warning);
  const preview=result.preview,request=buildNewChatHandoffRequest(preview.finalFirstUserMessage);
  return {
    experiment:'new-chat-handoff-v0.2',fixture:`case-${sourceIndex+1}`,condition:condition===0?'OFF':String(condition),
    source_conversation:preview.sourceConversation,source_conversation_id:preview.sourceConversationId,
    source_turn:preview.sourceTurn,marker_id:preview.markerId,marker_source_text:preview.markerSourceText,
    marker_status:preview.marker.status,handoff:preview.handoff,handoff_level:preview.handoffLevel,
    past_context_utf16:preview.pastContextUtf16,future_context_utf16:preview.futureContextUtf16,
    range:preview.range,final_first_user_message:preview.finalFirstUserMessage,request,
    automatic:{
      new_chat_history_zero:true,no_old_conversation_messages_directly_sent:true,
      request_matches_first_user_message:request.messages[1].content===preview.finalFirstUserMessage,
      off_has_no_context:handoff||(!preview.finalFirstUserMessage.includes('前の会話からの引継ぎ')&&preview.pastContextUtf16===0),
      amount_mapping:preview.requestedPastUtf16===condition,future_zero:preview.futureContextUtf16===0,
      marker_contained:preview.finalFirstUserMessage.includes(preview.markerSourceText),
      model_fixed:request.model==='google/gemma-4-12b-qat',message_roles:request.messages.map(message=>message.role),
    },human_review:'pending' as const,
  };
}

export function allNewChatHandoffPreviews(){
  return newChatHandoffExperimentSources.flatMap((_source,index)=>newChatHandoffConditions.map(condition=>newChatHandoffExperimentPreview(index,condition)));
}
