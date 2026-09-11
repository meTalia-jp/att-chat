export type Turn = { turn_id: string; sequence_no: number; role: 'user' | 'assistant'; status: 'completed' | 'generating' | 'cancelled' | 'failed'; content: string };
export type Highlight = { highlight_id: string; turn_id: string; start_offset: number; end_offset: number; source_text: string; target_text: string; color: string; note: string; created_at: string; status: string; reason?: string | null };
export type State = { turns: Turn[]; highlights: Highlight[] };
