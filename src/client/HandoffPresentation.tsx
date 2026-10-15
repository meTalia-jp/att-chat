import { useEffect, useState } from 'react';
import type { Conversation, ConversationDetail, GenerationRun, Turn } from '../shared/contracts.ts';
import { api } from './api.ts';

export type HandoffOriginReference = {
  sourceConversationId: string;
  sourceTurnId: string;
};

export function findHandoffOrigin(runs: readonly GenerationRun[]): HandoffOriginReference | null {
  const run = runs.find(item => item.context_strategy === 'turn_based_handoff'
    && item.reference_snapshot?.source_conversation_id
    && item.reference_snapshot.source_turn_id);
  return run ? {
    sourceConversationId: run.reference_snapshot!.source_conversation_id!,
    sourceTurnId: run.reference_snapshot!.source_turn_id,
  } : null;
}

export function handoffQuestionForDisplay(content: string): string {
  const normalized = content.replace(/\r\n?/g, '\n');
  const match = /^## 質問\s*$/m.exec(normalized);
  if (!match) return content;
  const question = normalized.slice(match.index + match[0].length).trim();
  return question || content;
}

export function turnContentForDisplay(turn: Turn, runs: readonly GenerationRun[]): string {
  const isHandoffUserTurn = runs.some(run => run.context_strategy === 'turn_based_handoff' && run.user_turn_id === turn.turn_id);
  return isHandoffUserTurn ? handoffQuestionForDisplay(turn.content) : turn.content;
}

export function HandoffOrigin({ detail, conversations }: { detail: ConversationDetail; conversations: readonly Conversation[] }) {
  const origin = findHandoffOrigin(detail.runs);
  const listedTitle = origin ? conversations.find(item => item.conversation_id === origin.sourceConversationId)?.title : undefined;
  const [resolved, setResolved] = useState<{ title: string; turnNumber: number | null } | null>(null);

  useEffect(() => {
    let disposed = false;
    setResolved(null);
    if (!origin) return () => { disposed = true; };
    void api<ConversationDetail>(`/api/conversations/${origin.sourceConversationId}`).then(source => {
      if (disposed) return;
      const turn = source.turns.find(item => item.turn_id === origin.sourceTurnId);
      setResolved({ title: source.conversation.title, turnNumber: turn ? turn.sequence_no + 1 : null });
    }).catch(() => {
      if (!disposed && listedTitle) setResolved({ title: listedTitle, turnNumber: null });
    });
    return () => { disposed = true; };
  }, [origin?.sourceConversationId, origin?.sourceTurnId, listedTitle]);

  if (!origin) return null;
  const title = resolved?.title ?? listedTitle;
  if (!title) return null;
  return <p className="handoff-origin" aria-label="引継ぎ元">
    元の会話「{title}」{resolved?.turnNumber ? ` / T${resolved.turnNumber}` : ''} から引継ぎ
  </p>;
}
