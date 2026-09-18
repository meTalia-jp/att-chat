import { useEffect, useState } from 'react';
import type { GenerationRun, Highlight, Turn } from '../shared/contracts.ts';
import type { QuestionKeep } from '../shared/question-keep.ts';
import type { RelatedTurn } from '../shared/semantic-search.ts';
import { MarkerCore } from './MarkerCore.tsx';
import { QuestionKeeps } from './QuestionKeeps.tsx';
import { RelatedTurns } from './RelatedTurns.tsx';
import { ContextCompare } from './ContextCompare.tsx';

// Att-Chat composition: optional experiments do not belong to MarkerCore.
export function MarkedTurns({ conversationId, turns, reloadToken, runs, onAsk, sending, onRelatedJump }: {
  conversationId: string;
  turns: Turn[];
  reloadToken: number;
  runs: GenerationRun[];
  onAsk: (keep: QuestionKeep, newConversation?: boolean) => void;
  sending: boolean;
  onRelatedJump?: (result: RelatedTurn) => Promise<void>;
}) {
  const [keepTarget, setKeepTarget] = useState<Highlight | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  useEffect(() => { setKeepTarget(null); setCompareId(null); }, [conversationId, reloadToken]);

  return <MarkerCore conversationId={conversationId} turns={turns} reloadToken={reloadToken}
    renderEditorExtras={({ editing, highlights }) => <>
      {editing && onRelatedJump && <RelatedTurns key={editing.highlight_id} conversationId={conversationId} highlight={editing} onJump={onRelatedJump} sending={sending} />}
      {compareId && highlights.some(h => h.highlight_id === compareId) && <ContextCompare conversationId={conversationId} highlightId={compareId} onClose={() => setCompareId(null)} />}
    </>}
    renderMarkerActions={(highlight, { beginEdit }) => <>
      {onRelatedJump && <button disabled={highlight.status !== 'resolved'} onClick={() => beginEdit(highlight)}>Related Turns</button>}
      <button disabled={highlight.status !== 'resolved'} onClick={() => setKeepTarget({ ...highlight })}>質問キープ</button>
      <button disabled={highlight.status !== 'resolved'} onClick={() => setCompareId(highlight.highlight_id)}>Context Compare</button>
    </>}
    renderListExtras={({ highlights }) => <QuestionKeeps key={conversationId} conversationId={conversationId}
      highlights={highlights} selected={highlights.find(h => h.highlight_id === keepTarget?.highlight_id) ? keepTarget : null}
      onClose={() => setKeepTarget(null)} runs={runs} onAsk={onAsk} sending={sending} />}
  />;
}
