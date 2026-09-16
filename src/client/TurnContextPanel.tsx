import { useEffect,useState } from 'react';
import type { RelatedTurn } from '../shared/semantic-search.ts';
import type { TurnContext } from '../shared/retrieval.ts';
import { api } from './api.ts';

export function TurnContextPanel({target,onClose}:{target:RelatedTurn;onClose:()=>void}){
  const [before,setBefore]=useState(1),[after,setAfter]=useState(1),[data,setData]=useState<TurnContext|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function load(){if(!Number.isInteger(before)||!Number.isInteger(after)||before<0||after<0||before>10||after>10)return;setBusy(true);setError('');try{setData(await api<TurnContext>(`/api/retrieval/turns/${encodeURIComponent(target.turn_id)}/context?before=${before}&after=${after}`));}catch(e){setData(null);setError((e as Error).message);}finally{setBusy(false);}}
  useEffect(()=>{void load();},[target.turn_id]);
  return <section aria-label="Turn Context"><h4>前後の発言 — {target.conversation_title}</h4>
    <p>表示専用です。AIへ送信せず、Conversationも変更しません。</p>
    <label>前<input type="number" min={0} max={10} value={before} disabled={busy} onChange={e=>{setBefore(Number(e.target.value));setData(null);}}/></label>
    <label>後<input type="number" min={0} max={10} value={after} disabled={busy} onChange={e=>{setAfter(Number(e.target.value));setData(null);}}/></label>
    <button disabled={busy||!Number.isInteger(before)||!Number.isInteger(after)||before<0||after<0||before>10||after>10} onClick={()=>void load()}>前後を取得</button><button onClick={onClose}>閉じる</button>
    {busy&&<p role="status">取得中…</p>}{error&&<p role="alert">{error}</p>}
    {data&&<><p>前 {data.metadata.before_returned}/{data.metadata.before_requested}件 · 後 {data.metadata.after_returned}/{data.metadata.after_requested}件</p>
      <ol>{data.turns.map(turn=><li key={turn.turn_id} className={turn.turn_id===data.anchor.turn_id?'retrieval-anchor':undefined} data-context-turn={turn.turn_id}><strong>{turn.role} #{turn.sequence_no}{turn.turn_id===data.anchor.turn_id?' ← anchor':''}</strong><pre>{turn.content}</pre></li>)}</ol>
    </>}
  </section>;
}
