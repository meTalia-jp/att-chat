import { useState } from 'react';
import { markers, turns } from './fixture.ts';
import { conditions, preview } from './experiment.ts';
import { LongContextPreview } from './LongPreview.tsx';
import { HandoffPreview } from './HandoffPreview.tsx';

export function ContextCorrectionPreview() {
  const [markerId,setMarkerId]=useState('A');
  const [condition,setCondition]=useState<typeof conditions[number]>('A');
  const marker=markers.find(m=>m.id===markerId)!;
  const value=preview(marker,condition);
  return <><HandoffPreview/><LongContextPreview/><details><summary>Context Correction v0.1 — 送信前Preview</summary>
    <p>固定40 Turn / 4 Marker。UIはPreviewのみ。実行はLab専用CLI、各条件で独立した最初の1回答を取得します。</p>
    <label>Marker <select value={markerId} onChange={e=>setMarkerId(e.target.value)}>{markers.map(m=><option key={m.id} value={m.id}>{m.id} / T{m.turn}</option>)}</select></label>{' '}
    <label>条件 <select value={condition} onChange={e=>setCondition(e.target.value as typeof condition)}>{conditions.map(c=><option key={c}>{c}</option>)}</select></label>
    <p>Experiment: {value.experiment} / Included Turn IDs: {value.included_turn_ids.join(', ') || 'なし（Focusのみ）'} / Context: {value.context_utf16} UTF-16 / Input: {value.input_utf16} UTF-16</p>
    <p>Marker: {value.source_text} / Question: {value.question}</p>
    <p>model: {value.request.model} / temperature: {value.request.temperature} / max tokens: {value.request.max_tokens}</p>
    <label>Final model-facing text<textarea readOnly rows={18} style={{width:'100%',boxSizing:'border-box'}} value={value.request.messages.map(m=>`[${m.role}]\n${m.content}`).join('\n\n')}/></label>
    <details><summary>評価metadata（送信しない）</summary><p>{marker.expected}</p><p>{marker.known}</p></details>
    <details><summary>固定Conversation全文（後続Turnは送信しない）</summary>{turns.map(t=><p key={t.turn_id}><strong>{t.turn_id} {t.role}</strong> {t.content}</p>)}</details>
  </details></>;
}
