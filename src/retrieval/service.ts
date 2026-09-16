import type { Turn } from '../shared/contracts.ts';
import type { RetrievedTurn,TurnContext } from '../shared/retrieval.ts';
import { RetrievalRepository } from './repository.ts';

export type RetrievalErrorCode='TURN_NOT_FOUND'|'INCOMPLETE_ANCHOR'|'INVALID_WINDOW'|'CONVERSATION_INCONSISTENT';
export class RetrievalError extends Error {
  readonly code:RetrievalErrorCode;readonly status:number;
  constructor(code:RetrievalErrorCode,message:string,status=400){super(message);this.code=code;this.status=status;}
}
export function windowSize(value:unknown,name:'before'|'after',fallback=1){
  const actual=value===undefined?fallback:value;
  if(!Number.isSafeInteger(actual)||(actual as number)<0||(actual as number)>10)throw new RetrievalError('INVALID_WINDOW',`${name}は0〜10の整数で指定してください`);
  return actual as number;
}
export class RetrievalService {
  private repo:RetrievalRepository;
  constructor(repo:RetrievalRepository){this.repo=repo;}
  private resolve(turnId:unknown){
    if(typeof turnId!=='string'||!turnId)throw new RetrievalError('TURN_NOT_FOUND','Turnがありません',404);
    const turn=this.repo.findTurn(turnId);if(!turn)throw new RetrievalError('TURN_NOT_FOUND','Turnがありません',404);
    const conversation=this.repo.findConversation(turn.conversation_id);if(!conversation)throw new RetrievalError('CONVERSATION_INCONSISTENT','TurnのConversationを取得できません',409);
    if(turn.status!=='completed'||!turn.finalized_at)throw new RetrievalError('INCOMPLETE_ANCHOR','completed Turnのみ取得できます',409);
    return {turn,conversation};
  }
  private dto(turn:Turn,title:string):RetrievedTurn {
    if(turn.status!=='completed'||!turn.finalized_at)throw new RetrievalError('INCOMPLETE_ANCHOR','completed Turnのみ取得できます',409);
    return {conversation_id:turn.conversation_id,conversation_title:title,turn_id:turn.turn_id,sequence_no:turn.sequence_no,role:turn.role,status:'completed',content:turn.content,created_at:turn.created_at,completed_at:turn.finalized_at};
  }
  getTurn(turnId:unknown):RetrievedTurn {const {turn,conversation}=this.resolve(turnId);return this.dto(turn,conversation.title);}
  getTurnContext(turnId:unknown,beforeValue:unknown=undefined,afterValue:unknown=undefined):TurnContext {
    const before=windowSize(beforeValue,'before'),after=windowSize(afterValue,'after'),{turn,conversation}=this.resolve(turnId);
    const turns=this.repo.window(turn.turn_id,before,after),beforeReturned=turns.filter(item=>item.sequence_no<turn.sequence_no).length,afterReturned=turns.filter(item=>item.sequence_no>turn.sequence_no).length;
    if(!turns.some(item=>item.turn_id===turn.turn_id))throw new RetrievalError('CONVERSATION_INCONSISTENT','anchor TurnをConversation内に取得できません',409);
    return {anchor:{turn_id:turn.turn_id,conversation_id:turn.conversation_id,sequence_no:turn.sequence_no,role:turn.role},turns:turns.map(item=>this.dto(item,conversation.title)),metadata:{before_requested:before,after_requested:after,before_returned:beforeReturned,after_returned:afterReturned}};
  }
}
