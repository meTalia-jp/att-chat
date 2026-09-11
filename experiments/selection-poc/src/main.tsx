import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Markdown } from './Markdown';
import { initial } from './fixtures';
import { addHighlight, colors, deserialize, serialize } from './contracts.mjs';
import { captureSelection, jump } from './selection';
import { runBrowserTests } from './browser-tests';
import type { Highlight, State } from './types';
import './style.css';

export function Turns({ state }: { state: State }) {
  return <>{state.turns.map(turn => <article key={turn.turn_id} data-turn={turn.turn_id}>
    <header><span>{turn.role === 'assistant' ? 'ASSISTANT' : 'USER'}</span><code>{turn.turn_id}</code><span>{turn.status}</span></header>
    <div className="markdown"><Markdown content={turn.content} highlights={state.highlights.filter(h => h.turn_id === turn.turn_id)} /></div>
  </article>)}</>;
}
const key = 'attchat-phase0-snapshot-v1';
function download(name: string, value: string) {
  const url = URL.createObjectURL(new Blob([value], { type: 'application/json;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function App() {
  const [state, setState] = useState<State>(() => deserialize(serialize(initial)) as State);
  const [pending, setPending] = useState<Highlight | null>(null);
  const [color, setColor] = useState('yellow'), [note, setNote] = useState('');
  const [message, setMessage] = useState('確定したASSISTANT本文をドラッグして選択してください。');
  const [json, setJson] = useState(''), [results, setResults] = useState('未実行'), [busy, setBusy] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const act = (fn: () => void) => { try { fn(); } catch (e) { setMessage((e as Error).message); } };
  const capture = () => act(() => { setPending(null); const h = captureSelection(root.current!, state); setPending(h); setMessage('選択を取得しました。色とメモを指定して登録できます。'); });
  return <>
    <div className="top"><div><span className="eyebrow">METAMI / PHASE 0</span><h1>会話に印を、戻る場所を。</h1><p>Selection PoC — 固定文書・原文位置・保存復元の検証</p></div><span className="badge">LOCAL EXPERIMENT</span></div>
    <div className="toolbar"><button onClick={() => setNarrow(!narrow)}>表示幅を切替</button>
      <button onClick={() => act(() => { const text = serialize(state); localStorage.setItem(key, text); setJson(text); setMessage('ブラウザへJSON保存しました。再読込ボタンで復元できます。'); })}>JSONをブラウザ保存</button>
      <button onClick={() => act(() => { const text = localStorage.getItem(key); if (!text) throw new Error('保存データがありません'); setState(deserialize(text) as State); setPending(null); setJson(text); setMessage('保存済みJSONから復元しました。'); })}>保存データを再読込</button>
      <button onClick={() => download('selection-poc.json', serialize(state))}>JSONファイル出力</button>
      <label className="file">JSONファイル読込<input type="file" accept=".json,application/json" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; try { const text = await file.text(); const next = deserialize(text) as State; setState(next); setPending(null); setJson(text); setMessage('ファイルから復元しました。'); } catch (e) { setMessage((e as Error).message); } event.target.value = ''; }} /></label>
    </div>
    <p role="status" className="notice">{message}</p>
    <main><div ref={root} className={`conversation ${narrow ? 'narrow' : ''}`} onMouseUp={capture} onKeyUp={event => { if (event.key === 'Shift') capture(); }}><Turns state={state} /></div>
      <aside><h2>参照マーカー <span>{state.highlights.length}</span></h2><p className="muted">色は目印です。質問や校正の意味はありません。</p>
        <fieldset><legend>選択を登録</legend><div className="colors">{colors.map(c => <button key={c} className={`mark-${c}`} aria-pressed={color === c} onClick={() => setColor(c)}>{c}</button>)}</div>
          <label>参照メモ<textarea aria-label="参照メモ" value={note} onChange={e => setNote(e.target.value)} placeholder="あとで確認すること（任意）" /></label>
          <button className="primary" disabled={!pending} onClick={() => act(() => { const next = addHighlight(state, { ...pending!, color, note }); setState(next as State); setPending(null); setNote(''); window.getSelection()?.removeAllRanges(); setMessage('登録しました。保存すると再読込できます。'); })}>マーカーを登録</button>
          {pending && <pre className="anchor-preview">{JSON.stringify(pending, null, 2)}</pre>}
        </fieldset>
        <ul className="markers">{state.highlights.map(h => <li key={h.highlight_id}><button className={`marker-link mark-${h.color}`} disabled={h.status !== 'resolved'} onClick={() => act(() => { jump(root.current!, h.highlight_id); setMessage(`${h.turn_id} の ${h.start_offset} へ移動しました。`); })}>{h.target_text}</button><p>{h.note || 'メモなし'}</p><small>{h.turn_id} · [{h.start_offset}, {h.end_offset}) · {h.status}</small>{h.reason && <p className="error">{h.reason}</p>}</li>)}</ul>
      </aside></main>
    <section className="lab"><h2>検証パネル</h2><p>同じ描画・選択・保存関数を、ブラウザのDOM Range / Selectionで検証します。現在のマーカーは変更しません。</p>
      <button disabled={busy} onClick={async () => { setBusy(true); setResults('実行中…'); try { const report = await runBrowserTests(); setResults(JSON.stringify(report, null, 2)); } catch (e) { setResults(String(e)); } finally { setBusy(false); } }}>ブラウザ検証を実行</button>
      <button disabled={busy || results === '未実行'} onClick={() => download('browser-results.json', results)}>検証結果を出力</button>
      <pre id="test-results">{results}</pre>
      <details><summary>JSONを確認・貼り付けて復元</summary><textarea aria-label="保存JSON" className="json" value={json} onChange={e => setJson(e.target.value)} /><button onClick={() => act(() => { setState(deserialize(json) as State); setPending(null); setMessage('貼り付けJSONから復元しました。'); })}>このJSONから復元</button></details>
    </section><footer>Phase 0 only · LM Studio / DB / チャット生成なし</footer>
  </>;
}
createRoot(document.getElementById('root')!).render(<App />);
