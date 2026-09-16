import { useEffect,useState } from 'react';
import type { ContextPreview,PreviewParameters } from '../shared/context-preview.ts';
export function ContextCompare({conversationId,highlightId,onClose}:{conversationId:string;highlightId:string;onClose:()=>void}){
  const [parameters,setParameters]=useState<PreviewParameters>({strategy:'A',local_budget:600,local_ratio:'5:5',before_turns:1,after_turns:1});
  const [result,setResult]=useState<ContextPreview|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();setResult(null);setError('');
    void fetch(`/api/conversations/${conversationId}/highlights/${highlightId}/context-preview`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(parameters),signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(`${data.error.code}: ${data.error.message}`);if(!controller.signal.aborted)setResult(data);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return ()=>controller.abort();
  },[conversationId,highlightId,parameters]);
  return <section aria-label="Context Compare"><h3>Context Compare — S5 PoC</h3><p>表示専用。AIへ送信しません。総上限20,000 UTF-16、超過時は全文を拒否します。</p>
    <label>Strategy<select value={parameters.strategy} onChange={e=>setParameters({...parameters,strategy:e.target.value as PreviewParameters['strategy']})}>{['A','A+B'].map(x=><option key={x}>{x}</option>)}</select></label>
    <label>Local budget<select value={parameters.local_budget} onChange={e=>setParameters({...parameters,local_budget:Number(e.target.value) as PreviewParameters['local_budget']})}>{[300,600,1000].map(x=><option key={x}>{x}</option>)}</select></label>
    <label>Local ratio<select value={parameters.local_ratio} onChange={e=>setParameters({...parameters,local_ratio:e.target.value as PreviewParameters['local_ratio']})}>{['5:5','6:4','7:3'].map(x=><option key={x}>{x}</option>)}</select></label>
    {(['before_turns','after_turns'] as const).map(key=><label key={key}>{key}<select value={parameters[key]} onChange={e=>setParameters({...parameters,[key]:Number(e.target.value)})}>{[0,1,2,3].map(x=><option key={x}>{x}</option>)}</select></label>)}<button onClick={onClose}>閉じる</button>
    {error&&<p role="alert">{error}</p>}{!result&&!error&&<p>Preview取得中…</p>}
    {result&&<><p>{result.sections.length} sections / {result.total_utf16} UTF-16（本文 {result.content_utf16}） · 前 {result.before_returned} / 後 {result.after_returned}</p>{result.sections.map(s=><article key={s.turn_id}><b>{s.source} · {s.role} #{s.sequence_no}</b>{s.source==='local'?<pre>{s.before}<mark>{s.highlight}</mark>{s.after}</pre>:<pre>{s.content}</pre>}</article>)}<details><summary>request_preview / JSON</summary><pre>{result.request_preview}</pre><pre>{JSON.stringify(result,null,2)}</pre></details></>}
  </section>;
}
