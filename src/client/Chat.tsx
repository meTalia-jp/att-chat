import { useEffect, useRef, useState } from 'react';
import { api } from './api.ts';
import type { ConversationDetail, GenerationRun } from '../shared/contracts.ts';

export function Chat({ detail, refresh, onBusy }: { detail: ConversationDetail; refresh: () => Promise<void>; onBusy: (value: boolean) => void }) {
  const [models, setModels] = useState<string[]>([]), [model, setModel] = useState('');
  const [input, setInput] = useState(''), [text, setText] = useState(''), [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState(''), [status, setStatus] = useState(''), [error, setError] = useState('');
  const lock = useRef(false), request = useRef<{ id: string; input: string; model: string } | null>(null);
  const base = `/api/conversations/${detail.conversation.conversation_id}`;
  const active = detail.runs.find(r => ['preparing','running'].includes(r.outcome));
  async function loadModels() {
    try { setError(''); const result = await api<{ models: string[] }>('/api/models'); setModels(result.models); setModel(previous => result.models.includes(previous) ? previous : ''); }
    catch (e) { setModels([]); setModel(''); setError((e as Error).message); }
  }
  useEffect(() => { void loadModels(); }, []);
  async function send() {
    if (lock.current || active || !model || !input.trim()) return;
    lock.current = true; setBusy(true); onBusy(true); setText(''); setError(''); setStatus('準備中');
    if (!request.current || request.current.input !== input || request.current.model !== model) request.current = { id: crypto.randomUUID(), input, model };
    let prepared = false;
    try {
      const res = await fetch(`${base}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: input, model, request_id: request.current.id }) });
      if (!res.ok) { const value = await res.json(); throw new Error(value.error?.message ?? `HTTP ${res.status}`); }
      if (!res.body) throw new Error('streamがありません');
      const reader = res.body.getReader(), decoder = new TextDecoder(); let buffer = '', terminal = false;
      try {
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          let end;
          while ((end = buffer.indexOf('\n')) >= 0) {
            const event = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
            if (event.type === 'prepared') { prepared = true; setRunId((event.run as GenerationRun).run_id); setInput(''); }
            if (event.type === 'running') setStatus('生成中');
            if (event.type === 'delta') setText(t => t + event.text);
            if (event.type === 'terminal') { terminal = true; setStatus(event.outcome); if (event.outcome === 'failed') setError(event.message); }
            if (event.type === 'storage_error') throw new Error(event.message);
          }
        }
        if (!terminal) throw new Error('終了確認前に接続が切れました。再読込で状態を確認してください。');
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    } catch (e) { setStatus('成功未確認'); setError((e as Error).message); }
    finally {
      try { await refresh(); } catch (e) { setError(`DB再取得失敗: ${(e as Error).message}`); }
      if (prepared) request.current = null;
      setBusy(false); onBusy(false); setRunId(''); lock.current = false;
    }
  }
  async function stop() {
    try { const r = await api<GenerationRun>(`${base}/runs/${runId || active?.run_id}/cancel`, {}); setStatus(r.outcome); await refresh(); }
    catch (e) { setError((e as Error).message); }
  }
  return <section><h3>LM Studioチャット</h3>
    <button disabled={busy} onClick={() => void loadModels()}>モデル一覧更新</button>
    <label>モデル<select value={model} disabled={busy || !!active} onChange={e => setModel(e.target.value)}><option value="">モデルを選択</option>{models.map(m => <option key={m} value={m}>{m}</option>)}</select></label>
    {!models.length && <p>利用可能なモデルがありません。LM Studioの起動と設定を確認してください。</p>}
    <label>チャット本文<textarea value={input} disabled={busy || !!active} onChange={e => setInput(e.target.value)} /></label>
    <button disabled={busy || !!active || !model || !input.trim()} onClick={() => void send()}>送信</button>
    <button disabled={!runId && !active} onClick={() => void stop()}>停止</button>
    <p role="status">{status || (active ? '生成中Runがあります' : '')}</p>{error && <p role="alert">{error}</p>}
    {text && <pre aria-label="streaming本文">{text.replace(/\r\n?/g, '\n')}</pre>}
  </section>;
}
