import { useEffect, useRef, useState } from 'react';
import type { SelectionPoint } from './marker-quick-action.ts';
import { NewChatHandoffSetup } from './NewChatHandoffSetup.tsx';
import type { HandoffSource } from './new-chat-handoff.ts';

// Experiment-local read model; not a production Keep schema.
export type LabQuestionKeep = {
  keepId: string; markerId: string; conversationId: string;
  turnId: string; turnNumber: number; sourceText: string; question_draft: string;
  start: SelectionPoint; end: SelectionPoint; createdAt: string;
  unresolved?: boolean;
  sourceTurnText?: string; markerStartOffset?: number; markerEndOffset?: number;
};
export const questionBoxConversations = [
  { id: 'quick-action-fixture', title: 'Conversation A' },
  { id: 'question-box-b', title: 'Conversation B' },
  { id: 'question-box-c', title: 'Conversation C' },
  { id: 'question-box-d', title: 'Conversation D' },
  { id: 'question-box-e', title: 'Conversation E' },
  { id: 'question-box-f', title: 'Conversation F' },
  { id: 'question-box-empty', title: 'Conversation G（Keepなし）' },
] as const;

export function QuestionBoxSidebar({ tab, onTab, conversationId, onConversation, keeps, onReturn, notice }: {
  tab: 'chat' | 'questions'; onTab: (tab: 'chat' | 'questions') => void;
  conversationId: string; onConversation: (id: string) => void;
  keeps: LabQuestionKeep[]; onReturn: (keep: LabQuestionKeep) => void; notice: string;
}) {
  // Newest timestamp first; insertion order resolves equal timestamps.
  const ordered = keeps.map((keep, index) => ({keep, index})).sort((a,b) =>
    b.keep.createdAt.localeCompare(a.keep.createdAt) || b.index - a.index).map(item => item.keep);
  const groups = Array.from(new Set(ordered.map(k => k.conversationId))).map(id => ({
    id, title: questionBoxConversations.find(c => c.id === id)?.title ?? '不明な会話',
    items: ordered.filter(k => k.conversationId === id),
  }));
  const [expanded, setExpanded] = useState<string[]>([]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState('');
  const [newChatKeep, setNewChatKeep] = useState<LabQuestionKeep | null>(null);
  const menuRoot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuId) return;
    const outside = (event: PointerEvent) => {
      // Let another trigger switch menus on click without shifting it under the pointer.
      if ((event.target as Element).closest?.('.question-box-more')) return;
      if (!menuRoot.current?.contains(event.target as Node)) setMenuId(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        menuRoot.current?.querySelector<HTMLButtonElement>('.question-box-more')?.focus();
        setMenuId(null);
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [menuId]);
  useEffect(() => {
    setMenuId(null); setActionNotice('');
    if (tab === 'questions') setExpanded(groups.length ? [groups[0].id] : []);
    // Reset on entering the box only; additions must not undo manual collapse.
  }, [tab]);
  return <aside className="question-box-sidebar" aria-label="Lab左Sidebar">
    <div role="tablist" aria-label="Lab左Sidebar切替">
      <button role="tab" id="question-box-chat-tab" aria-controls="question-box-chat" aria-selected={tab === 'chat'} onClick={() => onTab('chat')}>チャット</button>
      <button role="tab" id="question-box-keeps-tab" aria-controls="question-box-keeps" aria-selected={tab === 'questions'} onClick={() => onTab('questions')}>質問箱</button>
    </div>
    <div id="question-box-chat" role="tabpanel" aria-labelledby="question-box-chat-tab" hidden={tab !== 'chat'}>
      <p>Lab会話fixture</p>
      {questionBoxConversations.map(c => <button key={c.id} aria-current={conversationId === c.id ? 'true' : undefined} onClick={() => onConversation(c.id)}>{c.title}</button>)}
    </div>
    <div id="question-box-keeps" role="tabpanel" aria-labelledby="question-box-keeps-tab" hidden={tab !== 'questions'}>
      <section aria-label="Lab Question Keep"><h3>質問箱</h3><small>疑問が生まれた場所</small>
        <button type="button" onClick={() => { setExpanded([]); setMenuId(null); }}>すべて閉じる</button>
        {groups.length === 0 ? <p>まだありません。</p> : groups.map(group => <div key={group.id} data-question-group={group.id}>
          <button className="question-box-group-heading" type="button" aria-expanded={expanded.includes(group.id)} aria-controls={`keeps-${group.id}`} onClick={() => { if (group.items.some(k => k.keepId === menuId)) setMenuId(null); setExpanded(current => current.includes(group.id) ? current.filter(id => id !== group.id) : [...current, group.id]); }}>
            <span>{expanded.includes(group.id) ? '▼' : '▶'} {group.title}</span><span>{group.items.length}件</span>
          </button>
          <ul id={`keeps-${group.id}`} hidden={!expanded.includes(group.id)}>{group.items.map(k => <li key={k.keepId} data-keep-id={k.keepId}>
          <div className="question-box-item-heading"><strong>T{k.turnNumber}</strong><div className="question-box-item-actions"><button className="question-box-return" type="button" onClick={() => { setMenuId(null); onReturn(k); }}>元へ戻る</button>
            <div className="question-box-menu-anchor" ref={menuId === k.keepId ? menuRoot : undefined}>
              <button className="question-box-more" type="button" aria-label={`T${k.turnNumber}のその他の操作`} aria-expanded={menuId === k.keepId} aria-controls={`actions-${k.keepId}`} onClick={() => { setMenuId(current => current === k.keepId ? null : k.keepId); setActionNotice(''); }}>…</button>
            </div>
          </div></div>
          {menuId === k.keepId && <div id={`actions-${k.keepId}`} className="question-box-secondary-actions" role="group" aria-label={`T${k.turnNumber}の操作候補`} onPointerDown={event => event.stopPropagation()}>
            <button type="button" onClick={() => { setActionNotice(`T${k.turnNumber} 質問する：未実装`); setMenuId(null); }}>質問する</button>
            <button type="button" onClick={() => { setNewChatKeep(k); setMenuId(null); setActionNotice(''); }}>新規チャット</button>
          </div>}
          <q title={k.sourceText}>{Array.from(k.sourceText).slice(0, 70).join('')}{Array.from(k.sourceText).length > 70 ? '…' : ''}</q>
          {k.question_draft && <p>{k.question_draft}</p>}
          {k.unresolved && <small>Marker位置未解決</small>}
        </li>)}</ul></div>)}
      </section>
    </div>
    <p role="status" className="question-box-notice">{notice}</p>
    {actionNotice && <p role="status" className="question-box-notice">{actionNotice}</p>}
    {newChatKeep && <NewChatHandoffSetup source={{
      conversationId: newChatKeep.conversationId,
      conversationTitle: questionBoxConversations.find(c => c.id === newChatKeep.conversationId)?.title ?? '不明な会話',
      turnId: newChatKeep.turnId, turnNumber: newChatKeep.turnNumber,
      markerId: newChatKeep.markerId, markerSourceText: newChatKeep.sourceText,
      questionDraft: newChatKeep.question_draft, sourceTurnText: newChatKeep.sourceTurnText,
      markerStartOffset: newChatKeep.markerStartOffset, markerEndOffset: newChatKeep.markerEndOffset,
      unresolved: newChatKeep.unresolved,
    } satisfies HandoffSource} close={() => setNewChatKeep(null)} />}
  </aside>;
}
