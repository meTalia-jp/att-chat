export type KeepStatus = 'pending' | 'asked' | 'dismissed';
export type QuestionKeep = {
  keep_id: string; highlight_id: string; question_draft: string; memo: string;
  status: KeepStatus; created_at: string; updated_at: string; asked_at: string | null;
};
