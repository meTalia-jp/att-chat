export type SearchOptions = { variant: 'Q1'|'Q2'; role: 'all'|'assistant'|'user'; scope: 'current'|'all'; top_k: number };
export type RelatedTurn = { conversation_id:string; conversation_title:string; turn_id:string; sequence_no:number; role:'assistant'|'user'; excerpt:string; score:number; space_id:string; source_hash:string };
export type SearchResponse = {
  results:RelatedTurn[]; options:SearchOptions; space_id:string; query_text:string;
  coverage:{total_completed:number;ready:number;pending:number;failed:number;stale:number;missing:number;input_too_long:number};
  timings:{ready_vector_count:number;vector_load_ms:number;query_embedding_ms:number;similarity_ms:number;total_ms:number;invalid_vectors:number};
};
