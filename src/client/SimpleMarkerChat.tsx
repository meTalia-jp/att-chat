import { useEffect, useRef, useState } from 'react';
import type { Conversation, ConversationDetail } from '../shared/contracts.ts';
import { api } from './api.ts';
import { Chat } from './Chat.tsx';
import { MarkerCore } from './MarkerCore.tsx';

export function SimpleMarkerChat({ onBusy, conversationId, readOnly = false }: { onBusy?: (busy: boolean) => void; conversationId?: string; readOnly?: boolean } = {}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const lock = useRef(false);
  const active = detail?.runs.some(run => ['preparing', 'running'].includes(run.outcome)) ?? false;

  useEffect(() => { onBusy?.(busy || active); }, [busy, active, onBusy]);

  async function refresh(preferred?: string) {
    const list = await api<Conversation[]>('/api/conversations');
    const selected = list.find(c => c.conversation_id === (conversationId ?? preferred)) ?? (!conversationId ? list[0] : undefined);
    const next = selected ? await api<ConversationDetail>(`/api/conversations/${selected.conversation_id}`) : null;
    setConversations(list); setDetail(next); setReloadToken(value => value + 1);
  }
  async function action(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await work(); }
    catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  useEffect(() => { void action(() => refresh()); }, []);

  return <>
    <h1>Simple Marker Chat</h1>
    {error && <p role="alert">{error}</p>}
    <button disabled={busy || active} onClick={() => void action(() => refresh(detail?.conversation.conversation_id))}>再読込</button>
    <div className="layout">
      <aside aria-label="Conversation一覧">
        <h2>会話一覧</h2>
        {!conversationId && <form onSubmit={event => { event.preventDefault(); void action(async () => {
          const conversation = await api<Conversation>('/api/conversations', { title });
          await refresh(conversation.conversation_id); setTitle('');
        }); }}>
          <label>会話タイトル<input value={title} maxLength={200} disabled={busy || active} onChange={event => setTitle(event.target.value)} /></label>
          <button disabled={busy || active || !title.trim()}>新規会話</button>
        </form>}
        <ul>{conversations.map(conversation => <li key={conversation.conversation_id}>
          <button disabled={busy || active || !!conversationId} aria-current={detail?.conversation.conversation_id === conversation.conversation_id ? 'true' : undefined}
            onClick={() => void action(() => refresh(conversation.conversation_id))}>{conversation.title}</button>
        </li>)}</ul>
      </aside>
      <main>{detail ? <>
        <h2>{detail.conversation.title}</h2>
        {!readOnly && <Chat detail={detail} refresh={id => refresh(id ?? detail.conversation.conversation_id)} onBusy={setBusy} question={null} onCloseQuestion={() => {}} />}
        <MarkerCore key={detail.conversation.conversation_id} conversationId={detail.conversation.conversation_id}
          turns={detail.turns} reloadToken={reloadToken} showTurnIds={false} />
      </> : <p>新規会話を作成してください。</p>}</main>
    </div>
  </>;
}
