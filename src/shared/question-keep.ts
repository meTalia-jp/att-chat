export type KeepStatus = 'pending' | 'asked' | 'dismissed';
export type QuestionKeep = {
  keep_id: string; highlight_id: string; question_draft: string; memo: string;
  status: KeepStatus; created_at: string; updated_at: string; asked_at: string | null;
};

export type GlobalQuestionKeep = {
  conversation: { conversation_id: string; title: string };
  keep: QuestionKeep;
  highlight: {
    highlight_id: string;
    status: 'resolved' | 'unresolved';
    reason: string | null;
    source_text: string;
    target_text: string;
  };
  source_turn: { turn_id: string; sequence_no: number };
};
