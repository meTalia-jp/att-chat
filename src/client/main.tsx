import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api.ts';
import type { Conversation, ConversationDetail } from '../shared/contracts.ts';
import './style.css';
import './normal-chat.css';
import { Chat } from './Chat.tsx';
import { MarkedTurns } from './MarkedTurns.tsx';
import { GlobalQuestionBox } from './GlobalQuestionBox.tsx';
import type { GlobalQuestionKeep, QuestionKeep } from '../shared/question-keep.ts';
import { jumpToTurn } from './turn-navigation.ts';
import type { RelatedTurn } from '../shared/semantic-search.ts';
import { upsertImmediateAskDraft, type ImmediateAskDraft } from './MarkerDetailAdapter.tsx';

function App() {
  const [list, setList] = useState<Conversation[]>([]), [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [jumpTarget,setJumpTarget]=useState<RelatedTurn|null>(null);
  const [sidebarTab,setSidebarTab]=useState<'chat'|'questions'>('chat');
  const [questionReturn,setQuestionReturn]=useState<{ conversationId:string; turnId:string; highlightId:string; highlightStatus:'resolved'|'unresolved'; request:number }|null>(null);
  const questionReturnRequest=useRef(0);
  useEffect(()=>{
    if(!jumpTarget || detail?.conversation.conversation_id!==jumpTarget.conversation_id)return;
    try{const clear=jumpToTurn(document,jumpTarget.turn_id);const timer=setTimeout(clear,1800);return()=>{clearTimeout(timer);clear();};}
    catch(e){setError((e as Error).message);}
  },[detail,jumpTarget]);
  useEffect(()=>{
    if(!questionReturn || detail?.conversation.conversation_id!==questionReturn.conversationId)return;
    try{
      const clear=jumpToTurn(document,questionReturn.turnId);
      const sequence=detail.turns.find(turn=>turn.turn_id===questionReturn.turnId)?.sequence_no;
      if(questionReturn.highlightStatus==='unresolved')setMessage(`T${sequence===undefined?'?':sequence+1}へ移動しました。Marker位置を確認できません。`);
      const request=questionReturn.request;
      const timer=setTimeout(()=>{clear();setQuestionReturn(current=>current?.request===request?null:current)},1800);
      return()=>{clearTimeout(timer);clear()};
    }catch(e){setError((e as Error).message);}
  },[detail,questionReturn]);
  async function relatedJump(result:RelatedTurn){
    if(busy)return;
    if(detail?.conversation.conversation_id!==result.conversation_id)await refresh(result.conversation_id);
    setJumpTarget({...result});
  }
  const [question, setQuestion] = useState<(QuestionKeep & { newConversation?: boolean; sourceConversationId: string }) | null>(null);
  const [immediateDrafts, setImmediateDrafts] = useState<ImmediateAskDraft[]>([]);
  useEffect(() => { setQuestion(current => current && current.sourceConversationId === detail?.conversation.conversation_id ? current : null); }, [detail?.conversation.conversation_id]);
  useEffect(() => { setImmediateDrafts([]); }, [detail?.conversation.conversation_id]);
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
  async function returnFromQuestionBox(item: GlobalQuestionKeep) {
    if(busy)return;
    await action(async()=>{
      setSidebarTab('chat');
      await refresh(item.conversation.conversation_id);
      questionReturnRequest.current+=1;
      setQuestionReturn({conversationId:item.conversation.conversation_id,turnId:item.source_turn.turn_id,highlightId:item.highlight.highlight_id,highlightStatus:item.highlight.status,request:questionReturnRequest.current});
      setMessage(item.highlight.status==='resolved'?'元のMarkerへ移動します。':'元のTurnへ移動します。Marker位置を確認できません。');
    });
  }
  async function askFromQuestionBox(item: GlobalQuestionKeep,newConversation:boolean) {
    if(busy)return;
    await action(async()=>{
      setSidebarTab('chat');
      await refresh(item.conversation.conversation_id);
      setQuestion({...item.keep,newConversation,sourceConversationId:item.conversation.conversation_id});
      setMessage(newConversation?'New Chat Handoffを開きました。PreviewだけではConversationを作成しません。':'既存の「このチャットで聞く」を開きました。送信するまでKeepは変更しません。');
    });
  }
  useEffect(() => { void action(async () => { await refresh(); setMessage('DBから読込済み'); }); }, []);
  const base = detail ? `/api/conversations/${detail.conversation.conversation_id}` : '';
  return <div className="normal-chat"><header className="app-heading"><h1>Att-Chat</h1></header>
    <p role="status">{message}</p>{error && <p role="alert">{error}</p>}
    <button disabled={busy} onClick={() => void action(async () => { await refresh(detail?.conversation.conversation_id); setMessage('DBから再読込しました'); })}>再読込</button>
    <div className="layout"><aside aria-label="左Sidebar"><div className="sidebar-tabs" role="tablist" aria-label="左Sidebar表示"><button type="button" role="tab" aria-selected={sidebarTab==='chat'} disabled={busy} onClick={()=>setSidebarTab('chat')}>チャット</button><button type="button" role="tab" aria-selected={sidebarTab==='questions'} disabled={busy} onClick={()=>setSidebarTab('questions')}>質問箱</button></div>{sidebarTab==='chat'?<section className="conversation-sidebar" aria-label="会話一覧"><h2>会話一覧</h2><form onSubmit={e => { e.preventDefault(); void action(async () => { const c = await api<Conversation>('/api/conversations', { title: title.trim() || '新しいチャット' }); await refresh(c.conversation_id); setTitle(''); setMessage('会話を保存しました'); }); }}>
      <label>会話タイトル<input value={title} onChange={e => setTitle(e.target.value)} maxLength={200} disabled={busy} /></label><button disabled={busy}>＋ 新規チャット</button></form>
      <ul>{list.map(c => <li key={c.conversation_id}><button disabled={busy} aria-current={detail?.conversation.conversation_id === c.conversation_id ? 'true' : undefined} onClick={() => void action(async () => { await refresh(c.conversation_id); setMessage('会話を読み込みました'); })}>{c.title}</button></li>)}</ul></section>:<GlobalQuestionBox reloadToken={reloadToken} disabled={busy} onReturn={returnFromQuestionBox} onAsk={askFromQuestionBox}/>}</aside>
      <main>{!detail ? <p>新規会話を作成してください。</p> : <><h2>{detail.conversation.title}</h2>
        <details className="developer-tools"><summary>保存確認用操作</summary>
        <label>User本文<textarea value={content} onChange={e => setContent(e.target.value)} disabled={busy} /></label>
        <button disabled={busy || !content.trim()} onClick={() => void action(async () => { await api(`${base}/turns`, { content }); await refresh(detail.conversation.conversation_id); setContent(''); setMessage('User発言を保存しました'); })}>User Turn追加</button>
        <label>回答対象のUser発言<select value={userId} disabled={busy} onChange={e => setUserId(e.target.value)}><option value="">User発言を選択</option>{detail.turns.filter(t => t.role === 'user').map(t => <option key={t.turn_id} value={t.turn_id}>#{t.sequence_no} {t.content.slice(0, 60)}</option>)}</select></label>
        <label>仮Assistant本文<textarea value={reply} onChange={e => setReply(e.target.value)} disabled={busy} /></label>
        <button disabled={busy || !userId || !reply.trim()} onClick={() => void action(async () => { await api(`${base}/mock-runs`, { user_turn_id: userId, content: reply }); await refresh(detail.conversation.conversation_id); setMessage('仮Assistant発言とRunを保存しました'); })}>仮Assistant Turn追加</button>
        </details><div className="normal-markers"><MarkedTurns key={detail.conversation.conversation_id} conversationId={detail.conversation.conversation_id} turns={detail.turns} reloadToken={reloadToken} runs={detail.runs} onAsk={(keep,newConversation=false)=>setQuestion({...keep,newConversation,sourceConversationId:detail.conversation.conversation_id})} sending={busy || detail.runs.some(r => ['preparing','running'].includes(r.outcome))} onRelatedJump={relatedJump} onImmediatePrepared={draft=>{const result=upsertImmediateAskDraft(immediateDrafts,draft);setImmediateDrafts(result.items);setMessage(result.accepted?(result.replaced?'同じMarkerの質問を置き換えました。':'Marker質問を参照中へ追加しました。'):'Marker質問は5件までです。');return result.accepted}} onKeepCreated={()=>{setReloadToken(value=>value+1);setMessage('Question Keepを質問箱へ保存しました。')}} markerJump={questionReturn?.conversationId===detail.conversation.conversation_id&&questionReturn.highlightStatus==='resolved'?{highlightId:questionReturn.highlightId,request:questionReturn.request}:null} onMarkerJumpResult={found=>setMessage(found?'該当Markerへ移動しました。':'元のTurnへ移動しました。Marker位置を確認できません。')} compact /></div>
<Chat normalLayout detail={detail} refresh={id => refresh(id ?? detail.conversation.conversation_id)} onBusy={setBusy} question={question} onCloseQuestion={() => setQuestion(null)} immediateDrafts={immediateDrafts} onChangeImmediateDraft={(highlightId,value)=>setImmediateDrafts(current=>current.map(item=>item.highlightId===highlightId?{...item,question:value}:item))} onClearImmediateDraft={highlightId=>setImmediateDrafts(current=>current.filter(item=>item.highlightId!==highlightId))} onImmediateSent={()=>setImmediateDrafts([])} />
        <details className="run-details"><summary>Run詳細</summary>{detail.runs.map(r => <section key={r.run_id}>
          <p>{r.outcome} · {r.provider} · {r.run_id}</p>
          {r.error && <p>{String(r.error.message ?? r.error.code)}</p>}
          {r.retry_of_run_id && <p>再試行元: {r.retry_of_run_id}</p>}
          {r.keep_id && <><p>Question Keep由来: {r.keep_id}</p><p>確定質問: {r.user_question}</p><details><summary>送信時の引用</summary><pre>{JSON.stringify(r.reference_snapshot,null,2)}</pre></details></>}
          {r.marker_references?.length && <details><summary>Immediate Ask参照 {r.marker_references.length}件</summary><pre>{JSON.stringify(r.marker_references,null,2)}</pre></details>}
          {r.kind === 'mock' && <button disabled={busy || !reply.trim()} onClick={() => void action(async () => { await api(`${base}/runs/${r.run_id}/retry`, { content: reply }); await refresh(detail.conversation.conversation_id); setMessage('新しいAssistant発言とRunで再試行を保存しました'); })}>このRunを仮再試行</button>}
          <details><summary>保存済みスナップショット</summary><pre>{JSON.stringify(r.request_snapshot, null, 2)}</pre></details>
        </section>)}</details></>}
      </main></div></div>;
}
createRoot(document.getElementById('root')!).render(<App />);
