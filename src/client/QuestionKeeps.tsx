import { useEffect, useRef, useState } from 'react';
import type { Highlight, GenerationRun } from '../shared/contracts.ts';
import type { KeepStatus, QuestionKeep } from '../shared/question-keep.ts';
import { api, apiRequest } from './api.ts';

export function QuestionKeeps({ conversationId, highlights, selected, onClose, runs, onAsk, sending }: {
  conversationId: string; highlights: Highlight[]; selected: Highlight | null; onClose: () => void;
  runs: GenerationRun[]; onAsk: (keep: QuestionKeep, newConversation?: boolean) => void; sending: boolean;
}) {
  const [keeps,setKeeps]=useState<QuestionKeep[]>([]),[editing,setEditing]=useState<QuestionKeep|null>(null);
  const [questionRuns,setQuestionRuns]=useState<GenerationRun[]>([]);
  const [draft,setDraft]=useState(''),[memo,setMemo]=useState(''),[filter,setFilter]=useState<KeepStatus>('pending');
  const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const lock=useRef(false), panel=useRef<HTMLElement>(null);
  const path=`/api/conversations/${conversationId}/question-keeps`;
  useEffect(()=>{
    let disposed=false;
    void api<QuestionKeep[]>(path).then(value=>{if(!disposed)setKeeps(value)}).catch(e=>{if(!disposed)setError(e.message)});
    void api<GenerationRun[]>(`/api/conversations/${conversationId}/question-runs`).then(value=>{if(!disposed)setQuestionRuns(value)}).catch(e=>{if(!disposed)setError(e.message)});
    return()=>{disposed=true};
  },[path,highlights,runs,conversationId]);
  useEffect(()=>{if(selected){setEditing(null);setDraft('');setMemo('');setError('');panel.current?.scrollIntoView({block:'start'})}},[selected]);
  useEffect(()=>{if(editing&&!highlights.some(h=>h.highlight_id===editing.highlight_id))setEditing(null)},[highlights,editing]);
  async function action(fn:()=>Promise<void>) {
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');setMessage('');
    try{await fn()}catch(e){setError((e as Error).message)}finally{lock.current=false;setBusy(false)}
  }
  async function save() {
    if(editing){const saved=await apiRequest<QuestionKeep>(`${path}/${editing.keep_id}`,'PATCH',{question_draft:draft,memo});setKeeps(v=>v.map(k=>k.keep_id===saved.keep_id?saved:k))}
    else if(selected){const saved=await apiRequest<QuestionKeep>(path,'POST',{highlight_id:selected.highlight_id,question_draft:draft,memo});setKeeps(v=>[...v,saved]);setFilter('pending')}
    setEditing(null);onClose();setMessage('質問キープを保存しました');
  }
  async function changeStatus(keep:QuestionKeep,status:'pending'|'dismissed') {
    const saved=await apiRequest<QuestionKeep>(`${path}/${keep.keep_id}`,'PATCH',{status});
    setKeeps(v=>v.map(k=>k.keep_id===saved.keep_id?saved:k));if(editing?.keep_id===keep.keep_id)setEditing(null);setMessage('状態を更新しました');
  }
  const active=editing?highlights.find(h=>h.highlight_id===editing.highlight_id):selected;
  return <section ref={panel} aria-label="Question Keep"><h3>Question Keep</h3>
    <p>あとで聞きたい質問を保存します。マーカーを削除すると、その質問キープもすべて削除されます。</p>
    {(selected||editing)&&active&&<form onSubmit={event=>{event.preventDefault();void action(save)}}>
      <blockquote>{active.target_text}</blockquote>
      <label>質問下書き<textarea value={draft} maxLength={10000} disabled={busy} onChange={e=>setDraft(e.target.value)}/></label>
      <label>キープメモ<textarea value={memo} maxLength={10000} disabled={busy} onChange={e=>setMemo(e.target.value)}/></label>
      <button disabled={busy||(!editing&&active.status!=='resolved')}>キープ保存</button>
      <button type="button" disabled={busy} onClick={()=>{setEditing(null);onClose()}}>閉じる</button>
    </form>}
    <label>キープの状態<select value={filter} onChange={e=>setFilter(e.target.value as KeepStatus)}><option value="pending">pending（あとで聞く）</option><option value="dismissed">dismissed（取り下げ）</option><option value="asked">asked（質問済み）</option></select></label>
    <p role="status">{message}</p>{error&&<p role="alert">{error}</p>}
    <ul>{keeps.filter(k=>k.status===filter&&highlights.some(h=>h.highlight_id===k.highlight_id)).map(keep=>{
      const h=highlights.find(h=>h.highlight_id===keep.highlight_id)!;
      return <li key={keep.keep_id}><blockquote>{h.target_text}</blockquote><p>質問: {keep.question_draft||'（下書きなし）'}</p><p>メモ: {keep.memo||'（なし）'}</p><p>{keep.status}</p>
        {h.status==='unresolved'&&<p>元マーカーが解決不能のため質問できません — {h.reason}</p>}
        {keep.status!=='dismissed'&&<button disabled={busy||sending||h.status!=='resolved'} onClick={()=>onAsk({...keep})}>{keep.status==='asked'?'このチャットでもう一度聞く':'このチャットで聞く'}</button>}
        {keep.status!=='dismissed'&&<button disabled={busy||sending||h.status!=='resolved'} onClick={()=>onAsk({...keep},true)}>新しいチャットで聞く</button>}
        {keep.status==='asked'&&<p>質問送信開始済み · 関連Run {questionRuns.filter(r=>r.keep_id===keep.keep_id).length}件 · 最新結果: {questionRuns.filter(r=>r.keep_id===keep.keep_id).at(-1)?.outcome??'Runを再読込してください'} · 最新質問先: {questionRuns.filter(r=>r.keep_id===keep.keep_id).at(-1)?.conversation_id}</p>}
        {keep.status!=='asked'&&<><button disabled={busy} onClick={()=>{onClose();setEditing(keep);setDraft(keep.question_draft);setMemo(keep.memo)}}>キープ編集</button>
          <button disabled={busy} onClick={()=>void action(()=>changeStatus(keep,keep.status==='pending'?'dismissed':'pending'))}>{keep.status==='pending'?'取り下げ':'pendingに戻す'}</button></>}
        <button disabled={busy} onClick={()=>void action(async()=>{await apiRequest(`${path}/${keep.keep_id}`,'DELETE');setKeeps(v=>v.filter(k=>k.keep_id!==keep.keep_id));if(editing?.keep_id===keep.keep_id)setEditing(null);setMessage('キープを削除しました')})}>キープ削除</button>
      </li>;
    })}</ul>
    {!keeps.some(k=>k.status===filter&&highlights.some(h=>h.highlight_id===k.highlight_id))&&<p>この状態のキープはありません。</p>}
  </section>;
}
