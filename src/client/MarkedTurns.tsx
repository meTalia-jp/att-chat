import { useEffect, useRef, useState } from 'react';
import type { Highlight, HighlightColor, Turn } from '../shared/contracts.ts';
import { api, apiRequest } from './api.ts';
import { captureSelection, type HighlightDraft } from './marker.ts';
import { filterHighlights, highlightColors, locateHighlightElements, orderHighlights } from './marker-list.ts';
import { TurnMarkdown } from './TurnMarkdown.tsx';
import { QuestionKeeps } from './QuestionKeeps.tsx';
import type { GenerationRun } from '../shared/contracts.ts';
import type { QuestionKeep } from '../shared/question-keep.ts';

export function MarkedTurns({ conversationId, turns, reloadToken, runs, onAsk, sending }: { conversationId: string; turns: Turn[]; reloadToken: number; runs: GenerationRun[]; onAsk: (keep: QuestionKeep) => void; sending: boolean }) {
  const root = useRef<HTMLDivElement>(null), editor = useRef<HTMLElement>(null), pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]), [draft, setDraft] = useState<HighlightDraft | null>(null);
  const [color, setColor] = useState<HighlightColor>('yellow'), [note, setNote] = useState(''), [editing, setEditing] = useState<Highlight | null>(null);
  const [enabledColors, setEnabledColors] = useState<Set<HighlightColor>>(() => new Set(highlightColors));
  const [message, setMessage] = useState(''), [error, setError] = useState('');
  const [keepTarget,setKeepTarget] = useState<Highlight|null>(null);
  const path = `/api/conversations/${conversationId}/highlights`;
  const visible = filterHighlights(orderHighlights(highlights, turns), enabledColors);

  useEffect(() => {
    let disposed = false;
    setHighlights([]); setDraft(null); setEditing(null); setMessage(''); setError('');
    setKeepTarget(null);
    void api<Highlight[]>(path).then(value => { if (!disposed) setHighlights(value); }).catch(reason => { if (!disposed) setError((reason as Error).message); });
    return () => { disposed = true; if (pulseTimer.current) clearTimeout(pulseTimer.current); };
  }, [conversationId, reloadToken]);

  function select() {
    const current = window.getSelection(); if (!current || current.isCollapsed) return;
    try { setError(''); setDraft(captureSelection(root.current!, turns)); setEditing(null); setColor('yellow'); setNote(''); setMessage('選択範囲を確認しました'); }
    catch (reason) { setDraft(null); setEditing(null); setError((reason as Error).message); }
  }
  async function register() {
    if (!draft) return;
    try { setError(''); const saved = await apiRequest<Highlight>(path, 'POST', { ...draft, color, note }); setHighlights(value => [...value, saved]); setDraft(null); setMessage('マーカーを保存しました'); window.getSelection()?.removeAllRanges(); }
    catch (reason) { setError((reason as Error).message); }
  }
  function beginEdit(highlight: Highlight) {
    setEditing(highlight); setDraft(null); setColor(highlight.color); setNote(highlight.note); setError(''); setMessage('マーカーを選択しました');
    editor.current?.scrollIntoView({ block: 'start' });
  }
  function chooseMarker(event: React.MouseEvent) {
    const id = (event.target as HTMLElement).closest<HTMLElement>('[data-highlight]')?.dataset.highlight;
    const highlight = highlights.find(value => value.highlight_id === id); if (highlight) beginEdit(highlight);
  }
  async function update() {
    if (!editing) return;
    try { setError(''); const saved = await apiRequest<Highlight>(`${path}/${editing.highlight_id}`, 'PATCH', { color, note }); setHighlights(value => value.map(item => item.highlight_id === saved.highlight_id ? saved : item)); setEditing(saved); setMessage('マーカーを更新しました'); }
    catch (reason) { setError((reason as Error).message); }
  }
  async function remove(highlight = editing) {
    if (!highlight) return;
    try { setError(''); await apiRequest(`${path}/${highlight.highlight_id}`, 'DELETE'); setHighlights(value => value.filter(item => item.highlight_id !== highlight.highlight_id)); if (editing?.highlight_id === highlight.highlight_id) setEditing(null); setMessage('マーカーを削除しました'); }
    catch (reason) { setError((reason as Error).message); }
  }
  function jump(highlight: Highlight) {
    if (highlight.status !== 'resolved') { setError(`ジャンプできません: ${highlight.reason ?? 'unresolved'}`); return; }
    const elements = root.current ? locateHighlightElements(root.current, highlight) : [];
    if (!elements.length) { setError('現在の描画からマーカー位置を特定できません'); return; }
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    root.current!.querySelectorAll('.marker-jump-active').forEach(element => element.classList.remove('marker-jump-active'));
    elements.forEach(element => element.classList.add('marker-jump-active'));
    const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    elements[0].scrollIntoView({ behavior, block: 'center' }); elements[0].focus({ preventScroll: true });
    pulseTimer.current = setTimeout(() => { elements.forEach(element => element.classList.remove('marker-jump-active')); pulseTimer.current = null; }, 1800);
    setError(''); setMessage('該当マーカーへ移動しました');
  }
  function toggleColor(value: HighlightColor) {
    setEnabledColors(current => { const next = new Set(current); if (next.has(value)) next.delete(value); else next.add(value); return next; });
  }

  return <>
    <section className="marker-editor" ref={editor}>
      <h3>AttMarker</h3><p>completed Assistant本文内の対応範囲を選択してください。</p>
      {(draft || editing) && <><p>選択: {(draft ?? editing)!.target_text}</p><label>色<select value={color} onChange={event => setColor(event.target.value as HighlightColor)}>{highlightColors.map(value => <option key={value}>{value}</option>)}</select></label><label>メモ<textarea value={note} maxLength={10000} onChange={event => setNote(event.target.value)} /></label>{draft ? <button onClick={() => void register()}>登録</button> : <><button onClick={() => void update()}>更新</button><button onClick={() => void remove()}>削除</button></>}</>}
      <p role="status">{message}</p>{error && <p role="alert">{error}</p>}
    </section>
    <section className="marker-list" aria-label="会話内のマーカー一覧">
      <h3>マーカー一覧</h3>
      <fieldset><legend>色別表示フィルタ</legend>{highlightColors.map(value => <label className="color-filter" key={value}><input type="checkbox" checked={enabledColors.has(value)} onChange={() => toggleColor(value)} /><span className={`color-swatch mark-${value}`} aria-hidden="true" />{value}</label>)}</fieldset>
      <button onClick={() => setEnabledColors(new Set(highlightColors))}>すべて表示</button><button onClick={() => setEnabledColors(new Set())}>すべて非表示</button>
      <p>{visible.length} / {highlights.length}件を表示</p>
      {!visible.length ? <p>表示対象のマーカーはありません。</p> : <ul>{visible.map(highlight => {
        const turn = turns.find(value => value.turn_id === highlight.turn_id);
        return <li key={highlight.highlight_id} className={`marker-list-item marker-list-${highlight.status}`} data-list-highlight={highlight.highlight_id}>
          <p><span className={`color-swatch mark-${highlight.color}`} aria-hidden="true" /><strong>{highlight.color}</strong> · Assistant #{turn?.sequence_no ?? '?'}</p>
          <blockquote>{highlight.target_text}</blockquote><p>メモ: {highlight.note || '（なし）'}</p>
          {highlight.status === 'unresolved' ? <><p className="unresolved-reason">unresolved: {highlight.reason ?? '理由不明'}</p><button disabled>ジャンプ不可</button></> : <button onClick={() => jump(highlight)}>このマーカーへジャンプ</button>}
          <button onClick={() => beginEdit(highlight)}>編集</button><button onClick={() => void remove(highlight)}>削除</button>
          <button disabled={highlight.status!=='resolved'} onClick={()=>setKeepTarget({...highlight})}>質問キープ</button>
        </li>;
      })}</ul>}
    </section>
    <QuestionKeeps key={conversationId} conversationId={conversationId} highlights={highlights} selected={highlights.find(h=>h.highlight_id===keepTarget?.highlight_id)?keepTarget:null} onClose={()=>setKeepTarget(null)} runs={runs} onAsk={onAsk} sending={sending}/>
    <div ref={root} onMouseUp={select} onClick={chooseMarker}><h3>保存された発言</h3>{turns.map(turn => <article key={turn.turn_id} data-turn={turn.turn_id}><b>#{turn.sequence_no} {turn.role} · {turn.status}</b>{turn.role === 'assistant' && turn.status === 'completed' ? <div className="markdown"><TurnMarkdown content={turn.content} highlights={highlights.filter(highlight => highlight.turn_id === turn.turn_id)} /></div> : <pre>{turn.content}</pre>}<small>{turn.turn_id}</small></article>)}</div>
  </>;
}
