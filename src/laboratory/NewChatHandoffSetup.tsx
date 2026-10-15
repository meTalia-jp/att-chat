import { useEffect, useState } from 'react';
import {
  buildNewChatHandoffPreview, handoffExperimentalFuture, handoffExperimentalPast,
  handoffLevelLabel, handoffPastPresets, type HandoffFuture, type HandoffPast, type HandoffSource,
  type NewChatHandoffPreview, type NewChatHandoffRun,
} from './new-chat-handoff.ts';

export function NewChatHandoffSetup({ source, close }: { source: HandoffSource; close: () => void }) {
  const [handoff, setHandoff] = useState(true);
  const [past, setPast] = useState<HandoffPast>(800);
  const [future, setFuture] = useState<HandoffFuture>(0);
  const [result, setResult] = useState<ReturnType<typeof buildNewChatHandoffPreview> | null>(null);
  const [firstUserMessage,setFirstUserMessage]=useState('');
  const [sending,setSending]=useState(false),[sendError,setSendError]=useState('');
  const [runs,setRuns]=useState<NewChatHandoffRun[]>([]);
  useEffect(() => { setResult(null); setFirstUserMessage(''); setSendError(''); }, [handoff, past, future]);
  const preview: NewChatHandoffPreview | null = result?.status === 'ready' ? result.preview : null;
  function prepare(){
    const next=buildNewChatHandoffPreview(source,handoff,past,handoff?future:0);setResult(next);setSendError('');
    setFirstUserMessage(next.status==='ready'?next.preview.finalFirstUserMessage:'');
  }
  async function send(){
    if(!preview||sending)return;setSending(true);setSendError('');
    try{
      const response=await fetch('/api/laboratory/new-chat-handoff',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        sourceConversation:preview.sourceConversation,sourceConversationId:preview.sourceConversationId,sourceTurn:preview.sourceTurn,
        markerId:preview.markerId,markerSourceText:preview.markerSourceText,markerStatus:preview.marker.status,
        handoff:preview.handoff,handoffLevel:preview.handoffLevel,pastContextUtf16:preview.pastContextUtf16,
        futureContextUtf16:preview.futureContextUtf16,finalFirstUserMessage:firstUserMessage,
      })});
      const value=await response.json();if(!response.ok)throw new Error(value?.error?.message??`HTTP ${response.status}`);
      setRuns(current=>[...current,value as NewChatHandoffRun]);
    }catch(error){setSendError((error as Error).message);}finally{setSending(false);}
  }
  return <div className="new-chat-handoff-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section className="new-chat-handoff-setup" role="dialog" aria-modal="true" aria-label="New Chat Handoff Setup">
      <header><div><small>Draft New Conversation</small><h3>新しいチャットへ</h3></div><button type="button" aria-label="New Chat Handoffを閉じる" onClick={close}>×</button></header>
      <fieldset><legend>引継ぎ</legend>
        <label><input type="radio" name="handoff-enabled" checked={handoff} onChange={() => setHandoff(true)} />する</label>
        <label><input type="radio" name="handoff-enabled" checked={!handoff} onChange={() => setHandoff(false)} />しない</label>
      </fieldset>
      <fieldset disabled={!handoff}><legend>引継ぎ量</legend><div className="new-chat-handoff-presets">
        {handoffPastPresets.map(value => <label key={value}><input type="radio" name="handoff-level" checked={past === value} onChange={() => setPast(value)} /><span>{handoffLevelLabel(value)}</span></label>)}
      </div></fieldset>
      <details><summary>Experimental</summary>
        <label>Past context<select aria-label="Experimental Past context" value={past} disabled={!handoff} onChange={event => setPast(Number(event.target.value) as HandoffPast)}>{handoffExperimentalPast.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Future context<select aria-label="Experimental Future context" value={future} disabled={!handoff} onChange={event => setFuture(Number(event.target.value) as HandoffFuture)}>{handoffExperimentalFuture.map(value => <option key={value} value={value}>{value === 0 ? 'OFF' : value}</option>)}</select></label>
        <small>通常UIはPastのみを変更し、FutureはOFFです。</small>
      </details>
      {source.unresolved && <p className="new-chat-handoff-warning">Marker位置未解決</p>}
      <div className="new-chat-handoff-actions"><button type="button" onClick={close}>キャンセル</button><button type="button" onClick={prepare}>準備</button></div>
      {result?.status === 'blocked' && <p role="alert" className="new-chat-handoff-warning">{result.warning}</p>}
      {preview && <section className="new-chat-handoff-preview" aria-label="New Chat Handoff Preview">
        <h4>New Chat Handoff Preview</h4>
        {result?.status === 'ready' && result.warning && <p className="new-chat-handoff-warning">{result.warning}</p>}
        <dl>
          <dt>Source Conversation</dt><dd>{preview.sourceConversation}</dd><dt>Source Turn</dt><dd>{preview.sourceTurn}</dd>
          <dt>Marker ID</dt><dd>{preview.markerId}</dd><dt>Marker source text</dt><dd>{preview.markerSourceText}</dd>
          <dt>Question draft</dt><dd>{preview.questionDraft || '（空）'}</dd><dt>Handoff</dt><dd>{preview.handoff ? 'ON' : 'OFF'}</dd>
          <dt>Handoff Level</dt><dd>{preview.handoffLevel}</dd><dt>Past context</dt><dd>{preview.pastContextUtf16} UTF-16</dd>
          <dt>Future context</dt><dd>{preview.futureContextUtf16} UTF-16</dd><dt>Range</dt><dd>{preview.range ? `[${preview.range.start}, ${preview.range.end})` : 'Marker位置未解決'}</dd>
        </dl>
        <label>New Conversation — First User Message<textarea value={firstUserMessage} onChange={event=>setFirstUserMessage(event.target.value)} /></label>
        <div className="new-chat-handoff-actions"><button type="button" disabled={sending} onClick={()=>{setResult(null);setFirstUserMessage('');setSendError('');}}>戻る</button><button type="button" disabled={sending||!firstUserMessage.trim()} onClick={()=>void send()}>{sending?'送信中…':'新規チャットとして送信'}</button></div>
        <small>Lab memory-only。本番Conversation・SQLite・通常Chat履歴へ保存しません。</small>
        {sendError&&<p role="alert" className="new-chat-handoff-warning">{sendError}</p>}
        {runs.map(run=><section className="new-chat-handoff-result" aria-label="New Chat Result" key={run.temporaryConversationId}>
          <h4>New Chat Result</h4><p><strong>User</strong></p><pre>{run.firstUserMessage}</pre>
          <p><strong>Assistant</strong></p><div className="new-chat-handoff-answer">{run.assistantResponse||'（回答なし）'}</div>
          <dl><dt>Temporary Conversation</dt><dd>{run.temporaryConversationId}</dd><dt>Model</dt><dd>{run.model}</dd>
            <dt>Finish reason</dt><dd>{run.finishReason??'なし'}</dd><dt>Error</dt><dd>{run.error??'なし'}</dd>
            <dt>History</dt><dd>{run.oldConversationMessageCount} / {run.messageRoles.join(' + ')}</dd><dt>Human review</dt><dd>{run.humanReview}</dd></dl>
        </section>)}
      </section>}
    </section>
  </div>;
}
