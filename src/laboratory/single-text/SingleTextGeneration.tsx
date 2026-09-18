import { useEffect, useRef, useState } from 'react';
import type { ExperimentRun, RunEvent } from './contracts.ts';

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init), body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? 'リクエスト失敗');
  return body;
}
export function SingleTextGeneration({ onBusy }: { onBusy?: (busy: boolean) => void } = {}) {
  const [models, setModels] = useState<string[]>([]), [model, setModel] = useState('');
  const [input, setInput] = useState(''), [output, setOutput] = useState('');
  const [run, setRun] = useState<ExperimentRun | null>(null), [runId, setRunId] = useState('');
  const [busy, setBusy] = useState(false), [status, setStatus] = useState('idle'), [error, setError] = useState('');
  const lock = useRef(false), request = useRef<{ text: string; model: string; id: string } | null>(null);
  async function modelsLoad() {
    try { const value = await json<{ models: string[] }>('/api/single/models'); setModels(value.models); setModel(m => value.models.includes(m) ? m : ''); }
    catch (e) { setModels([]); setModel(''); setError((e as Error).message); }
  }
  function display(saved: ExperimentRun) {
    setRun(saved); setRunId(saved.run_id); setStatus(saved.status);
    setOutput(saved.output_snapshot ?? saved.partial_output); setError(saved.error?.message ?? '');
  }
  async function reload() {
    if (lock.current) return;
    try { const latest = await json<ExperimentRun | null>('/api/single/latest'); if (latest) display(latest); }
    catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void modelsLoad(); void reload(); }, []);
  async function generate() {
    if (lock.current || !input.trim() || !model || status === 'running') return;
    lock.current = true; setBusy(true); setError(''); setOutput(''); setRun(null); setRunId(''); setStatus('開始記録を保存中');
    if (!request.current || request.current.text !== input || request.current.model !== model) request.current = { text: input, model, id: crypto.randomUUID() };
    let terminal = false, started = false;
    try {
      const response = await fetch('/api/single/runs', { method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ text: input, model, request_id: request.current.id }) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error?.message ?? '生成を開始できません'); }
      if (!response.body) throw new Error('streamがありません');
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
      try {
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          let end: number;
          while ((end = buffer.indexOf('\n')) >= 0) {
            const event = JSON.parse(buffer.slice(0, end)) as RunEvent; buffer = buffer.slice(end + 1);
            if (event.type === 'started') { started = true; setRunId(event.run_id); setStatus('running'); }
            if (event.type === 'delta') setOutput(value => value + event.text);
            if (event.type === 'terminal') { terminal = true; display(event.run); }
            if (event.type === 'storage_error') { setOutput(event.partial_output); throw new Error(event.message); }
          }
        }
        if (!terminal) throw new Error('終了結果が未確認です。再読込してください');
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    } catch (e) { setStatus('保存・完了未確認'); setError((e as Error).message); }
    finally { if (started) request.current = null; lock.current = false; setBusy(false); }
  }
  async function stop() {
    try { display(await json<ExperimentRun>(`/api/single/runs/${runId}/stop`, { method:'POST',headers:{'Content-Type':'application/json'},body:'{}' })); }
    catch (e) { setError((e as Error).message); }
  }
  const active = busy || status === 'running';
  useEffect(() => { onBusy?.(active); }, [active, onBusy]);
  return <main className="single-text-generation">
    <h1>Single Text Generation</h1>
    <button disabled={active} onClick={() => { setError(''); void modelsLoad(); }}>モデル一覧更新</button>
    <label>Model<select value={model} disabled={active} onChange={e => setModel(e.target.value)}><option value="">モデルを選択</option>{models.map(m => <option key={m}>{m}</option>)}</select></label>
    {!models.length && <p>モデルがありません。LM Studioを確認してください。</p>}
    <label>Text Input<textarea value={input} maxLength={100000} disabled={active} onChange={e => setInput(e.target.value)} /></label>
    <button disabled={active || !input.trim() || !model} onClick={() => void generate()}>Generate</button>
    <button disabled={!runId || !active} onClick={() => void stop()}>Stop</button>
    <button disabled={busy} onClick={() => void reload()}>保存Runを再読込</button>
    <p role="status">Run State: {status}</p>
    {error && <p role="alert">{error}</p>}
    <h2>Output</h2><pre aria-label="Output">{output}</pre>
    {run && <p>Run: {run.run_id} / Validation: {run.validation_status} / {run.status === 'running' ? '途中記録' : '終了記録を保存済み'}</p>}
  </main>;
}
