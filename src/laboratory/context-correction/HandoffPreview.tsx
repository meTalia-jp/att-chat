import {useState} from 'react';
import {markers} from './long-fixture.ts';
import {modes,levels,preview,type Mode,type Level} from './handoff-experiment.ts';
export function HandoffPreview(){
 const [id,setId]=useState('A'),[mode,setMode]=useState<Mode>('S'),[level,setLevel]=useState<Level>(300);
 const p=preview(markers.find(m=>m.id===id)!,mode,level);
 return <details><summary>Context Correction v0.3 — Same / New Preview</summary>
  <p>Pilot 24 Run / 300・800・1500。500・1100は未実行。SameはSource自身を含むT1–T20、Newは履歴ゼロ。UIは送信しません。</p>
  <label>v0.3 Marker <select value={id} onChange={e=>setId(e.target.value)}>{markers.map(m=><option key={m.id}>{m.id}</option>)}</select></label>{' '}
  <label>Chat Mode <select value={mode} onChange={e=>setMode(e.target.value as Mode)}>{modes.map(m=><option key={m}>{m}</option>)}</select></label>{' '}
  <label>Context Level <select value={level} onChange={e=>setLevel(Number(e.target.value) as Level)}>{levels.map(l=><option key={l}>{l}</option>)}</select></label>
  <p>Source T20: {p.source_utf16} UTF-16 / Window [{p.local_range.start}, {p.local_range.end}) / Included {p.context_utf16} ({p.included_percentage.toFixed(2)}%) / Marker [{p.anchor.start_offset}, {p.anchor.end_offset})</p>
  <p>Included Turn IDs: {p.included_turn_ids.join(', ')} / History Turn IDs: {p.history_turn_ids.join(', ')||'なし'} / History {p.history_utf16} UTF-16 / Total input {p.input_utf16} UTF-16</p>
  <p>{p.request.model} / temperature {p.request.temperature} / max_tokens {p.request.max_tokens}</p>
  <label>v0.3 Final model-facing messages<textarea rows={18} readOnly style={{width:'100%',boxSizing:'border-box'}} value={JSON.stringify(p.request.messages,null,2)}/></label>
 </details>;
}
