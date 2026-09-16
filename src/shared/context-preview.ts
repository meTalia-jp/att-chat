export type PreviewParameters = { strategy:'A'|'A+B'; local_budget:300|600|1000; local_ratio:'5:5'|'6:4'|'7:3'; before_turns:number; after_turns:number };
type SectionBase={turn_id:string;sequence_no:number;role:'user'|'assistant'};
export type PreviewSection = SectionBase & ({source:'local';before:string;highlight:string;after:string;start_offset:number;end_offset:number;display_target_text:string}|{source:'temporal_before'|'temporal_after';content:string});
export type ContextPreview={strategy:'A'|'A+B';highlight_id:string;anchor_turn_id:string;parameters:PreviewParameters;sections:PreviewSection[];request_preview:string;total_utf16:number;content_utf16:number;max_utf16:number;before_returned:number;after_returned:number};
