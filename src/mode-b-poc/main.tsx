import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Conversation, ConversationDetail, Highlight } from '../shared/contracts.ts';
import { buildContext, type ContextResult, type Parameters, type Strategy } from './context-builder.ts';

async function read<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`読込失敗: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}
function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]), [id, setId] = useState('');
  const [loaded, setLoaded] = useState<{ detail: ConversationDetail; highlights: Highlight[] } | null>(null);
  const [highlightId, setHighlightId] = useState(''), [question, setQuestion] = useState(''), [model, setModel] = useState('比較用モデルID');
  const [strategy, setStrategy] = useState<Strategy>('quote_only'), [budget, setBudget] = useState<Parameters['total_context_utf16']>(600), [ratio, setRatio] = useState<Parameters['before_ratio']>(6);
  const [results, setResults] = useState<ContextResult[]>([]), [error, setError] = useState('');
  useEffect(() => { void read<Conversation[]>('/api/conversations').then(setConversations).catch(e => setError(String(e))); }, []);
  useEffect(() => {
    let active = true; setLoaded(null); setHighlightId(''); setError('');
    if (id) void Promise.all([read<ConversationDetail>(`/api/conversations/${encodeURIComponent(id)}`), read<Highlight[]>(`/api/conversations/${encodeURIComponent(id)}/highlights`)]).then(([detail, highlights]) => { if (active) setLoaded({ detail, highlights }); }).catch(e => { if (active) setError(String(e)); });
    return () => { active = false; };
  }, [id]);
  function build() {
    try {
      const highlight = loaded?.highlights.find(h => h.highlight_id === highlightId);
      const turn = loaded?.detail.turns.find(t => t.turn_id === highlight?.turn_id);
      if (!highlight || !turn) throw new Error('Highlightを選択してください');
      const result = buildContext(turn, highlight, strategy, { total_context_utf16: budget, before_ratio: ratio, after_ratio: 10 - ratio }, question, model);
      setResults(previous => [...previous, result]); setError('');
    } catch (e) { setError(String(e)); }
  }
  return <main style={{ fontFamily: 'sans-serif', maxWidth: 1100, margin: 'auto' }}><h1>Mode B ContextBuilder 比較PoC</h1>
    <p>Build結果はメモリ上だけに保持します。モデルIDは比較条件の記録用で、通信は行いません。再読込すると比較結果は消えます。</p>
    <label>Conversation <select value={id} onChange={e => setId(e.target.value)}><option value="">選択</option>{conversations.map(c => <option key={c.conversation_id} value={c.conversation_id}>{c.title}</option>)}</select></label>{' '}
    <label>Highlight <select value={highlightId} onChange={e => setHighlightId(e.target.value)}><option value="">選択</option>{loaded?.highlights.map(h => <option key={h.highlight_id} value={h.highlight_id}>{h.status} · {h.target_text} · {h.highlight_id}</option>)}</select></label>
    <p><label>質問 <textarea value={question} onChange={e => setQuestion(e.target.value)} /></label></p>
    <p><label>モデルID <input value={model} onChange={e => setModel(e.target.value)} /></label></p>
    <label>strategy <select value={strategy} onChange={e => setStrategy(e.target.value as Strategy)}><option>quote_only</option><option>same_turn_context</option></select></label>{' '}
    <label>前後合計UTF-16 <select disabled={strategy === 'quote_only'} value={budget} onChange={e => setBudget(Number(e.target.value) as Parameters['total_context_utf16'])}>{[300,600,1000].map(n => <option key={n}>{n}</option>)}</select></label>{' '}
    <label>before:after <select disabled={strategy === 'quote_only'} value={ratio} onChange={e => setRatio(Number(e.target.value) as Parameters['before_ratio'])}>{[5,6,7].map(n => <option key={n} value={n}>{n}:{10-n}</option>)}</select></label>{' '}
    <button onClick={build} disabled={!loaded}>Build</button> <button onClick={() => setResults([])}>比較結果をクリア</button>
    {error && <p role="alert">{error}</p>}
    {results.map((r, i) => <section key={i} style={{ borderTop: '1px solid', marginTop: 20 }}><h2>比較 {i+1}: {r.strategy}</h2>
      <p>前 {r.lengths.before} / 引用 {r.lengths.quote} / 後 {r.lengths.after} UTF-16・未使用予算 {r.lengths.unused_budget}</p>
      {(['context_before','target_text','context_after'] as const).map(key => <div key={key}><h3>{key}</h3><pre style={{ whiteSpace: 'pre-wrap' }}>{r[key]}</pre></div>)}
      <details open><summary>offset・parameters・snapshot・request preview・既存baseline</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(r, null, 2)}</pre></details>
    </section>)}
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
