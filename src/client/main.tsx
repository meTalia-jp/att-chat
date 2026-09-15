import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api.ts';
import type { Conversation, ConversationDetail } from '../shared/contracts.ts';
import './style.css';
import { Chat } from './Chat.tsx';
import { MarkedTurns } from './MarkedTurns.tsx';
import type { QuestionKeep } from '../shared/question-keep.ts';
import { jumpToTurn } from './turn-navigation.ts';
import type { RelatedTurn } from '../shared/semantic-search.ts';

function App() {
  const [list, setList] = useState<Conversation[]>([]), [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [jumpTarget,setJumpTarget]=useState<RelatedTurn|null>(null);
  useEffect(()=>{
    if(!jumpTarget || detail?.conversation.conversation_id!==jumpTarget.conversation_id)return;
    try{const clear=jumpToTurn(document,jumpTarget.turn_id);const timer=setTimeout(clear,1800);return()=>{clearTimeout(timer);clear();};}
    catch(e){setError((e as Error).message);}
  },[detail,jumpTarget]);
  async function relatedJump(result:RelatedTurn){
    if(busy)return;
    if(detail?.conversation.conversation_id!==result.conversation_id)await refresh(result.conversation_id);
    setJumpTarget({...result});
  }
  const [question, setQuestion] = useState<(QuestionKeep & { newConversation?: boolean }) | null>(null);
  useEffect(() => { setQuestion(null); }, [detail?.conversation.conversation_id]);
  const [title, setTitle] = useState(''), [content, setContent] = useState(''), [reply, setReply] = useState('保存確認用の仮Assistant回答です。');
  const [userId, setUserId] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('読込中…'), [error, setError] = useState('');
  async function refresh(preferred?: string) {
    const conversations = await api<Conversation[]>('/api/conversations');
    const selected = conversations.find(c => c.conversation_id === preferred) ?? conversations[0];
    const loaded = selected ? await api<ConversationDetail>(`/api/conversations/${selected.conversation_id}`) : null;
    setList(conversations); setDetail(loaded); setReloadToken(value => value + 1);
    setUserId(loaded?.turns.filter(t => t.role === 'user').at(-1)?.turn_id ?? '');
  }
  async function action(fn: () => Promise<void>) { setBusy(true); setError(''); setMessage('処理中…'); try { await fn(); } catch (e) { setMessage(''); setError(`${(e as Error).message} 入力は保持しています。保存結果が不明な場合は再読込で確認してください。`); } finally { setBusy(false); } }
  useEffect(() => { void action(async () => { await refresh(); setMessage('DBから読込済み'); }); }, []);
  const base = detail ? `/api/conversations/${detail.conversation.conversation_id}` : '';
  return <><h1>METAMI Att-Chat — Phase 3B-2</h1><p>Question Keepの引用と質問を、この会話または新しい会話へ送信できます。</p>
    <p role="status">{message}</p>{error && <p role="alert">{error}</p>}
    <button disabled={busy} onClick={() => void action(async () => { await refresh(detail?.conversation.conversation_id); setMessage('DBから再読込しました'); })}>再読込</button>
    <div className="layout"><aside><h2>会話一覧</h2><form onSubmit={e => { e.preventDefault(); void action(async () => { const c = await api<Conversation>('/api/conversations', { title }); await refresh(c.conversation_id); setTitle(''); setMessage('会話を保存しました'); }); }}>
      <label>会話タイトル<input value={title} onChange={e => setTitle(e.target.value)} maxLength={200} disabled={busy} /></label><button disabled={busy || !title.trim()}>新規会話</button></form>
      <ul>{list.map(c => <li key={c.conversation_id}><button disabled={busy} aria-current={detail?.conversation.conversation_id === c.conversation_id ? 'true' : undefined} onClick={() => void action(async () => { await refresh(c.conversation_id); setMessage('会話を読み込みました'); })}>{c.title}</button></li>)}</ul></aside>
      <main>{!detail ? <p>新規会話を作成してください。</p> : <><h2>{detail.conversation.title}</h2>
        <Chat detail={detail} refresh={id => refresh(id ?? detail.conversation.conversation_id)} onBusy={setBusy} question={question} onCloseQuestion={() => setQuestion(null)} />
        <details><summary>Phase 1A保存確認用操作</summary>
        <label>User本文<textarea value={content} onChange={e => setContent(e.target.value)} disabled={busy} /></label>
        <button disabled={busy || !content.trim()} onClick={() => void action(async () => { await api(`${base}/turns`, { content }); await refresh(detail.conversation.conversation_id); setContent(''); setMessage('User発言を保存しました'); })}>User Turn追加</button>
        <label>回答対象のUser発言<select value={userId} disabled={busy} onChange={e => setUserId(e.target.value)}><option value="">User発言を選択</option>{detail.turns.filter(t => t.role === 'user').map(t => <option key={t.turn_id} value={t.turn_id}>#{t.sequence_no} {t.content.slice(0, 60)}</option>)}</select></label>
        <label>仮Assistant本文<textarea value={reply} onChange={e => setReply(e.target.value)} disabled={busy} /></label>
        <button disabled={busy || !userId || !reply.trim()} onClick={() => void action(async () => { await api(`${base}/mock-runs`, { user_turn_id: userId, content: reply }); await refresh(detail.conversation.conversation_id); setMessage('仮Assistant発言とRunを保存しました'); })}>仮Assistant Turn追加</button>
        </details><MarkedTurns key={detail.conversation.conversation_id} conversationId={detail.conversation.conversation_id} turns={detail.turns} reloadToken={reloadToken} runs={detail.runs} onAsk={(keep,newConversation=false)=>setQuestion({...keep,newConversation})} sending={busy || detail.runs.some(r => ['preparing','running'].includes(r.outcome))} onRelatedJump={relatedJump} />
        <h3>GenerationRun（保存確認）</h3>{detail.runs.map(r => <section key={r.run_id}>
          <p>{r.outcome} · {r.provider} · {r.run_id}</p>
          {r.error && <p>{String(r.error.message ?? r.error.code)}</p>}
          {r.retry_of_run_id && <p>再試行元: {r.retry_of_run_id}</p>}
          {r.keep_id && <><p>Question Keep由来: {r.keep_id}</p><p>確定質問: {r.user_question}</p><details><summary>送信時の引用</summary><pre>{JSON.stringify(r.reference_snapshot,null,2)}</pre></details></>}
          {r.kind === 'mock' && <button disabled={busy || !reply.trim()} onClick={() => void action(async () => { await api(`${base}/runs/${r.run_id}/retry`, { content: reply }); await refresh(detail.conversation.conversation_id); setMessage('新しいAssistant発言とRunで再試行を保存しました'); })}>このRunを仮再試行</button>}
          <details><summary>保存済みスナップショット</summary><pre>{JSON.stringify(r.request_snapshot, null, 2)}</pre></details>
        </section>)}</>}
      </main></div></>;
}
createRoot(document.getElementById('root')!).render(<App />);
