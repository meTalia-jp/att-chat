export type Conversation = { conversation_id: string; title: string; created_at: string; updated_at: string };
export type Turn = { turn_id: string; conversation_id: string; sequence_no: number; role: 'user' | 'assistant'; content: string; status: 'completed' | 'generating' | 'cancelled' | 'failed'; created_at: string; finalized_at: string | null };
export type GenerationRun = {
  run_id: string; conversation_id: string; user_turn_id: string; assistant_turn_id: string;
  retry_of_run_id: string | null; kind: string; model_id: string | null; provider: string;
  context_strategy: string; strategy_version: string; request_snapshot: Record<string, unknown>;
  started_at: string; finished_at: string | null; outcome: string; error: Record<string, unknown> | null;
  keep_id?: string; source_highlight_id?: string; source_turn_id?: string; user_question?: string;
  reference_snapshot?: { highlight_id: string; source_turn_id: string; start_offset: number; end_offset: number; source_text: string; target_text: string };
};
export type ConversationDetail = { conversation: Conversation; turns: Turn[]; runs: GenerationRun[] };
export type HighlightColor = 'yellow' | 'red' | 'green' | 'blue';
export type Highlight = {
  highlight_id: string; turn_id: string; start_offset: number; end_offset: number;
  source_text: string; target_text: string; color: HighlightColor; note: string;
  created_at: string; updated_at: string; status: 'resolved' | 'unresolved'; reason: string | null;
};
