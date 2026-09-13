export type Conversation = { conversation_id: string; title: string; created_at: string; updated_at: string };
export type Turn = { turn_id: string; conversation_id: string; sequence_no: number; role: 'user' | 'assistant'; content: string; status: 'completed' | 'generating' | 'cancelled' | 'failed'; created_at: string; finalized_at: string | null };
export type GenerationRun = {
  run_id: string; conversation_id: string; user_turn_id: string; assistant_turn_id: string;
  retry_of_run_id: string | null; kind: string; model_id: string | null; provider: string;
  context_strategy: string; strategy_version: string; request_snapshot: Record<string, unknown>;
  started_at: string; finished_at: string | null; outcome: string; error: Record<string, unknown> | null;
};
export type ConversationDetail = { conversation: Conversation; turns: Turn[]; runs: GenerationRun[] };
