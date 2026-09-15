import { useEffect, useRef, useState } from 'react';
import type { Highlight } from '../shared/contracts.ts';
import type { RelatedTurn, SearchOptions, SearchResponse } from '../shared/semantic-search.ts';

export function RelatedTurns({conversationId,highlight,onJump,sending}:{conversationId:string;highlight:Highlight;onJump:(result:RelatedTurn)=>Promise<void>;sending:boolean}) {
  const [options,setOptions]=useState<SearchOptions>({variant:'Q1',role:'all',scope:'current',top_k:5});
  const [data,setData]=useState<SearchResponse|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  function change<K extends keyof SearchOptions>(key:K,value:SearchOptions[K]){setOptions(current=>({...current,[key]:value}));setData(null);}
  async function search() {
    if(controller.current)return;
    const current=new AbortController();controller.current=current;setBusy(true);setError('');setData(null);
    try {
      const response=await fetch(`/api/conversations/${conversationId}/highlights/${highlight.highlight_id}/related-turns`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(options),signal:current.signal});
      const result=await response.json();if(!response.ok)throw new Error(result.error?.message??'検索に失敗しました');
      if(!current.signal.aborted)setData(result);
    }catch(e){if(!current.signal.aborted)setError((e as Error).message);}
    finally{controller.current=null;if(!current.signal.aborted)setBusy(false);}
  }
  return <section aria-label="Related Turns"><h3>Related Turns — 関連する発言</h3>
    <blockquote>{highlight.target_text}</blockquote><p>人間が確認する検索です。結果はAIへ自動送信されません。</p>
    <label>Query variant<select value={options.variant} disabled={busy} onChange={e=>change('variant',e.target.value as 'Q1'|'Q2')}><option>Q1</option><option>Q2</option></select></label>
    <p>Q1: 引用のみ ／ Q2: 引用＋同じTurnの前後各150 UTF-16以内</p>
    <label>Role<select value={options.role} disabled={busy} onChange={e=>change('role',e.target.value as SearchOptions['role'])}><option value="all">All</option><option value="assistant">Assistant</option><option value="user">User</option></select></label>
    <label>検索範囲<select value={options.scope} disabled={busy} onChange={e=>change('scope',e.target.value as SearchOptions['scope'])}><option value="current">Current Conversation</option><option value="all">All Conversations</option></select></label>
    <label>top_k<input type="number" min={1} max={10} value={options.top_k} disabled={busy} onChange={e=>change('top_k',Number(e.target.value))}/></label>
    <button disabled={busy || highlight.status!=='resolved' || options.top_k<1 || options.top_k>10 || !Number.isInteger(options.top_k)} onClick={()=>void search()}>Search</button>
    {busy && <p role="status">検索中…</p>}{error && <p role="alert">{error}</p>}
    {data && <><p>Semantic coverage（全会話・active space）: {data.coverage.ready} / {data.coverage.total_completed} ready</p>
      <p>pending {data.coverage.pending} / failed {data.coverage.failed} / stale {data.coverage.stale} / missing {data.coverage.missing} / INPUT_TOO_LONG {data.coverage.input_too_long}</p>
      <p>未索引・失敗・長文の発言は検索されません。元マーカーのTurnは除外します。類似度は順位の補助値で、確率や正しさではありません。</p>
      <small>space: {data.space_id}</small><details><summary>queryと検索時間</summary><pre>{data.query_text}</pre><p>query {data.timings.query_embedding_ms.toFixed(1)}ms / load {data.timings.vector_load_ms.toFixed(1)}ms / similarity {data.timings.similarity_ms.toFixed(1)}ms / total {data.timings.total_ms.toFixed(1)}ms / 対象 {data.timings.ready_vector_count}件 / 不正vector除外 {data.timings.invalid_vectors}件</p></details>
      {!data.results.length && <p>条件に合う検索結果はありません。</p>}
      <ol>{data.results.map(result=><li key={result.turn_id}><p>{result.conversation_title} · #{result.sequence_no} {result.role} · 類似度 {result.score.toFixed(4)}</p><blockquote>{result.excerpt}</blockquote><button disabled={sending} onClick={()=>void onJump(result).catch(e=>setError(e.message))}>Jump</button></li>)}</ol>
    </>}
  </section>;
}
