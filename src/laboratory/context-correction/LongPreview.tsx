import { useState } from 'react';
import { markers, turns } from './long-fixture.ts';
import { conditions, preview } from './long-experiment.ts';
export function LongContextPreview() {
 const [id,setId]=useState('A');
 const [condition,setCondition]=useState<typeof conditions[number]>('A');
 const m=markers.find(m=>m.id===id)!,p=preview(m,condition);
 return <details><summary>Context Correction v0.2 — Long Source Preview</summary>
  <p>32 Turn / T20の長い説明を4箇所で比較。UIはPreviewのみ、送信はLab CLI。前後300/800はMarker以外の合計量、5:5。選択箇所のタグは文字数・割合から除外。</p>
  <label>v0.2 Marker <select value={id} onChange={e=>setId(e.target.value)}>{markers.map(m=><option key={m.id}>{m.id}</option>)}</select></label>{' '}
  <label>v0.2 Condition <select value={condition} onChange={e=>setCondition(e.target.value as typeof condition)}>{conditions.map(c=><option key={c}>{c}</option>)}</select></label>
  <p>Experiment v0.2 / Source T20 total: {p.source_utf16} UTF-16 / Window: {p.local_range?`${p.local_range.context_start_offset}–${p.local_range.context_end_offset}`:'なし（Focusのみ）'} / Included: {p.context_utf16} UTF-16 ({p.included_percentage.toFixed(2)}%) / Marker offset: [{p.anchor.start_offset}, {p.anchor.end_offset})</p>
  <p>Input total: {p.input_utf16} UTF-16 / {p.request.model} / temperature {p.request.temperature} / max_tokens {p.request.max_tokens}</p>
  <label>v0.2 Final model-facing text<textarea readOnly rows={16} style={{width:'100%',boxSizing:'border-box'}} value={p.request.messages.map(m=>`[${m.role}]\n${m.content}`).join('\n\n')}/></label>
  <details><summary>v0.2 評価metadata（送信しない）</summary><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(m,null,2)}</pre></details>
  <details><summary>v0.2 固定Conversation</summary>{turns.map(t=><p key={t.turn_id}><strong>{t.turn_id} {t.role}</strong> {t.content}</p>)}</details>
 </details>;
}
