export type RetrievedTurn = {
  conversation_id:string; conversation_title:string; turn_id:string; sequence_no:number;
  role:'user'|'assistant'; status:'completed'; content:string; created_at:string; completed_at:string;
};
export type TurnContext = {
  anchor:Pick<RetrievedTurn,'turn_id'|'conversation_id'|'sequence_no'|'role'>;
  turns:RetrievedTurn[];
  metadata:{before_requested:number;after_requested:number;before_returned:number;after_returned:number};
};
