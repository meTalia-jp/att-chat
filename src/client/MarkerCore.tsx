import { useCallback, useEffect, useRef, useState } from 'react';
import type { Highlight, HighlightColor, Turn } from '../shared/contracts.ts';
import { api, apiRequest } from './api.ts';
import { captureSelection, type HighlightDraft } from './marker.ts';
import { filterHighlights, highlightColors, locateHighlightElements, orderHighlights, markerExcerpt } from './marker-list.ts';
import { TurnMarkdown } from './TurnMarkdown.tsx';
import { MiniMap } from './MiniMap.tsx';
import { createPortal } from 'react-dom';
import { MarkerQuickActionBar } from './MarkerQuickActionBar.tsx';
import { markerInteractionAnchor, markerQuickActionPosition, markerQuickActionSize, pointerInteractionAnchor, selectionFocusInteractionAnchor, type MarkerInteractionAnchor, type MarkerQuickActionPosition } from './marker-quick-action.ts';

export type MarkerCoreContext = {
  highlights: Highlight[];
  editing: Highlight | null;
  beginEdit: (highlight: Highlight) => void;
  closeEditing: () => void;
  color: HighlightColor;
  note: string;
  setColor: (color: HighlightColor) => void;
  setNote: (note: string) => void;
  updateEditing: () => Promise<Highlight | null>;
  removeEditing: () => Promise<boolean>;
  message: string;
  error: string;
  getHighlightAnchor: (highlight: Highlight) => MarkerInteractionAnchor | null;
};

export type MarkerCoreProps = {
  conversationId: string;
  turns: Turn[];
  reloadToken: number;
  showTurnIds?: boolean;
  renderEditorExtras?: (context: MarkerCoreContext) => React.ReactNode;
  renderMarkerActions?: (highlight: Highlight, context: MarkerCoreContext) => React.ReactNode;
  renderListExtras?: (context: MarkerCoreContext) => React.ReactNode;
  presentation?: 'full' | 'conversation';
  externalJump?: { highlightId: string; request: number } | null;
  onExternalJumpResult?: (found: boolean) => void;
  minimapHost?: HTMLElement | null;
  minimapMode?: 'detail' | 'overview';
  onMinimapModeChange?: (mode: 'detail' | 'overview') => void;
  showMarkerManagement?: boolean;
  turnContent?: (turn: Turn) => string;
  onQuickMemo?: (text: string) => void | Promise<void>;
  onQuickDictionary?: (text: string) => void | Promise<void>;
};

export type MarkerCreatePosition = MarkerQuickActionPosition;

export function markerCreatePosition(rect: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width'>, viewportWidth: number, viewportHeight: number): MarkerCreatePosition {
  return markerQuickActionPosition(markerInteractionAnchor(rect), viewportWidth, viewportHeight);
}

function finalRenderedRect(element: Element): DOMRect {
  return Array.from(element.getClientRects()).at(-1) ?? element.getBoundingClientRect();
}

// Optional render slots compose application actions; marker state and anchors stay here.
export function MarkerCore({ conversationId, turns, reloadToken, showTurnIds = true, renderEditorExtras, renderMarkerActions, renderListExtras, presentation = 'full', externalJump, onExternalJumpResult, minimapHost, minimapMode, onMinimapModeChange, showMarkerManagement = true, turnContent, onQuickMemo, onQuickDictionary }: MarkerCoreProps) {
  const root = useRef<HTMLDivElement>(null), editor = useRef<HTMLElement>(null), pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null), pulseFrame = useRef<number | null>(null), feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null), signalBusyRef = useRef(false);
  const handledExternalJump = useRef<number | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]), [draft, setDraft] = useState<HighlightDraft | null>(null);
  const [draftPosition, setDraftPosition] = useState<MarkerCreatePosition | null>(null), [activeHighlight, setActiveHighlight] = useState<Highlight | null>(null);
  const [interactionAnchor, setInteractionAnchor] = useState<MarkerInteractionAnchor | null>(null), [interactionHighlightId, setInteractionHighlightId] = useState<string | null>(null);
  const [signalBusy, setSignalBusy] = useState(false), [quickFeedback, setQuickFeedback] = useState('');
  const [highlightsLoaded, setHighlightsLoaded] = useState(false);
  const [color, setColor] = useState<HighlightColor>('yellow'), [note, setNote] = useState(''), [editing, setEditing] = useState<Highlight | null>(null);
  const [enabledColors, setEnabledColors] = useState<Set<HighlightColor>>(() => new Set(highlightColors));
  const [message, setMessage] = useState(''), [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const path = `/api/conversations/${conversationId}/highlights`;
  const visible = filterHighlights(orderHighlights(highlights, turns), enabledColors);

  useEffect(() => {
    let disposed = false;
    setHighlights([]); setHighlightsLoaded(false); setDraft(null); setDraftPosition(null); setInteractionAnchor(null); setInteractionHighlightId(null); setActiveHighlight(null); setEditing(null); setMessage(''); setError(''); setQuickFeedback('');
    setExpanded(new Set());
    void api<Highlight[]>(path).then(value => { if (!disposed) { setHighlights(value); setHighlightsLoaded(true); } }).catch(reason => { if (!disposed) { setError((reason as Error).message); setHighlightsLoaded(true); } });
    return () => { disposed = true; if (pulseTimer.current) clearTimeout(pulseTimer.current); if (feedbackTimer.current) clearTimeout(feedbackTimer.current); if (pulseFrame.current !== null) cancelAnimationFrame(pulseFrame.current); };
  }, [conversationId, reloadToken]);

  useEffect(() => {
    if (!externalJump || !highlightsLoaded || handledExternalJump.current === externalJump.request) return;
    handledExternalJump.current = externalJump.request;
    const highlight = highlights.find(value => value.highlight_id === externalJump.highlightId);
    onExternalJumpResult?.(highlight ? jump(highlight) : false);
  }, [externalJump, highlights, highlightsLoaded, onExternalJumpResult]);

  useEffect(() => {
    const current = root.current;
    if (!current) return;
    current.querySelectorAll('.marker-selected').forEach(element => element.classList.remove('marker-selected'));
    const selected = editing ?? activeHighlight;
    if (selected?.status === 'resolved') locateHighlightElements(current, selected).forEach(element => element.classList.add('marker-selected'));
    return () => current.querySelectorAll('.marker-selected').forEach(element => element.classList.remove('marker-selected'));
  }, [editing?.highlight_id, activeHighlight?.highlight_id, highlights]);

  const closeSignal = useCallback(() => {
    setDraft(null); setActiveHighlight(null); setDraftPosition(null); setInteractionAnchor(null); setInteractionHighlightId(null); setError(''); window.getSelection()?.removeAllRanges();
  }, []);

  const getHighlightAnchor = useCallback((highlight: Highlight): MarkerInteractionAnchor | null => {
    if (interactionAnchor && interactionHighlightId === highlight.highlight_id) return interactionAnchor;
    if (!root.current || highlight.status !== 'resolved') return null;
    const element = locateHighlightElements(root.current, highlight).at(-1);
    return element ? markerInteractionAnchor(finalRenderedRect(element)) : null;
  }, [interactionAnchor, interactionHighlightId]);

  const repositionSignal = useCallback(() => {
    if (interactionAnchor) setDraftPosition(markerQuickActionPosition(interactionAnchor, window.innerWidth, window.innerHeight));
  }, [interactionAnchor]);

  function showQuickFeedback(value: string) {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setQuickFeedback(value);
    feedbackTimer.current = setTimeout(() => { setQuickFeedback(''); feedbackTimer.current = null; }, 1200);
  }

  function select() {
    const current = window.getSelection(); if (!current || current.isCollapsed) return;
    try {
      const range = current.rangeCount ? current.getRangeAt(0) : null;
      const anchor = selectionFocusInteractionAnchor(current, document);
      const fallbackRect = range && typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : null;
      const nextAnchor = anchor ?? (fallbackRect ? markerInteractionAnchor(fallbackRect) : null);
      setError(''); setDraft(captureSelection(root.current!, turns)); setActiveHighlight(null); setEditing(null); setColor('yellow'); setNote(''); setMessage('選択範囲を確認しました');
      setInteractionAnchor(nextAnchor); setInteractionHighlightId(null);
      setDraftPosition(nextAnchor ? markerQuickActionPosition(nextAnchor, window.innerWidth, window.innerHeight) : { left: Math.max(8, (window.innerWidth - markerQuickActionSize.width) / 2), top: 12 });
    }
    catch (reason) { setDraft(null); setDraftPosition(null); setInteractionAnchor(null); setInteractionHighlightId(null); setEditing(null); setError((reason as Error).message); }
  }
  async function register(nextColor = color) {
    if (!draft || signalBusyRef.current) return;
    signalBusyRef.current = true; setSignalBusy(true);
    try {
      setError('');
      const saved = await apiRequest<Highlight>(path, 'POST', { ...draft, color: nextColor, note });
      setHighlights(value => [...value, saved]); setColor(saved.color); setMessage('マーカーを保存しました'); window.getSelection()?.removeAllRanges();
      if (presentation === 'conversation') { setActiveHighlight(saved); setInteractionHighlightId(saved.highlight_id); setDraft(null); }
      else { setDraft(null); setDraftPosition(null); setInteractionAnchor(null); setInteractionHighlightId(null); }
    }
    catch (reason) { setError((reason as Error).message); }
    finally { signalBusyRef.current = false; setSignalBusy(false); }
  }
  function beginEdit(highlight: Highlight) {
    const preserved = interactionHighlightId === highlight.highlight_id ? interactionAnchor : getHighlightAnchor(highlight);
    setInteractionAnchor(preserved); setInteractionHighlightId(highlight.highlight_id);
    setEditing(highlight); setDraft(null); setActiveHighlight(null); setDraftPosition(null); setColor(highlight.color); setNote(highlight.note); setError(''); setMessage('マーカーを選択しました');
    if (presentation === 'full') editor.current?.scrollIntoView({ block: 'start' });
  }
  function chooseMarker(event: React.MouseEvent) {
    if (!window.getSelection()?.isCollapsed) return;
    const id = (event.target as HTMLElement).closest<HTMLElement>('[data-highlight]')?.dataset.highlight;
    const highlight = highlights.find(value => value.highlight_id === id);
    if (!highlight) return;
    if (presentation !== 'conversation') { beginEdit(highlight); return; }
    const element = (event.target as HTMLElement).closest<HTMLElement>('[data-highlight]');
    const rects = element ? Array.from(element.getClientRects()) : [];
    const anchor = element ? pointerInteractionAnchor(rects.length ? rects : [element.getBoundingClientRect()], event.clientX, event.clientY) : null;
    setDraft(null); setEditing(null); setActiveHighlight(highlight); setColor(highlight.color); setNote(highlight.note); setError(''); setMessage('マーカーを選択しました');
    setInteractionAnchor(anchor); setInteractionHighlightId(highlight.highlight_id);
    if (anchor) setDraftPosition(markerQuickActionPosition(anchor, window.innerWidth, window.innerHeight));
  }
  async function updateSignalColor(nextColor: HighlightColor) {
    if (!activeHighlight || signalBusyRef.current || nextColor === activeHighlight.color) return;
    signalBusyRef.current = true; setSignalBusy(true);
    try {
      setError('');
      const saved = await apiRequest<Highlight>(`${path}/${activeHighlight.highlight_id}`, 'PATCH', { color: nextColor, note: activeHighlight.note });
      setHighlights(value => value.map(item => item.highlight_id === saved.highlight_id ? saved : item)); setActiveHighlight(saved); setColor(saved.color); setMessage('マーカー色を変更しました');
    } catch (reason) { setError((reason as Error).message); }
    finally { signalBusyRef.current = false; setSignalBusy(false); }
  }
  async function update() {
    if (!editing) return null;
    try { setError(''); const saved = await apiRequest<Highlight>(`${path}/${editing.highlight_id}`, 'PATCH', { color, note }); setHighlights(value => value.map(item => item.highlight_id === saved.highlight_id ? saved : item)); setEditing(saved); setMessage('マーカーを更新しました'); return saved; }
    catch (reason) { setError((reason as Error).message); return null; }
  }
  async function remove(highlight = editing) {
    if (!highlight) return false;
    try { setError(''); await apiRequest(`${path}/${highlight.highlight_id}`, 'DELETE'); setHighlights(value => value.filter(item => item.highlight_id !== highlight.highlight_id)); if (editing?.highlight_id === highlight.highlight_id) setEditing(null); if (activeHighlight?.highlight_id === highlight.highlight_id) closeSignal(); setMessage('マーカーを削除しました'); return true; }
    catch (reason) { setError((reason as Error).message); return false; }
  }
  function jump(highlight: Highlight) {
    if (highlight.status !== 'resolved') { setError(`ジャンプできません: ${highlight.reason ?? 'unresolved'}`); return false; }
    const elements = root.current ? locateHighlightElements(root.current, highlight) : [];
    if (!elements.length) { setError('現在の描画からマーカー位置を特定できません'); return false; }
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    if (pulseFrame.current !== null) cancelAnimationFrame(pulseFrame.current);
    setError(''); setMessage('該当マーカーへ移動しました');
    pulseFrame.current = requestAnimationFrame(() => {
      pulseFrame.current = null;
      const current = root.current ? locateHighlightElements(root.current, highlight) : [];
      if (!current.length) return;
      root.current!.querySelectorAll('.marker-jump-active').forEach(element => element.classList.remove('marker-jump-active'));
      current.forEach(element => element.classList.add('marker-jump-active'));
      const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      current[0].scrollIntoView({ behavior, block: 'center' }); current[0].focus({ preventScroll: true });
      pulseTimer.current = setTimeout(() => { current.forEach(element => element.classList.remove('marker-jump-active')); pulseTimer.current = null; }, 1800);
    });
    return true;
  }
  function toggleColor(value: HighlightColor) {
    setEnabledColors(current => { const next = new Set(current); if (next.has(value)) next.delete(value); else next.add(value); return next; });
  }

  const context: MarkerCoreContext = {
    highlights, editing, beginEdit, closeEditing: () => { setEditing(null); setInteractionAnchor(null); setInteractionHighlightId(null); }, color, note, setColor, setNote,
    updateEditing: update, removeEditing: () => remove(), message, error, getHighlightAnchor,
  };
  const editorPanel = <section className="marker-editor" ref={editor}>
    <h3>AttMarker</h3><p>completed Assistant本文内の対応範囲を選択してください。</p>
    {(draft || editing) && <><p>選択: {(draft ?? editing)!.target_text}</p><label>色<span className={`color-swatch mark-${color}`} aria-hidden="true" /><select className={`marker-color-select mark-${color}`} value={color} onChange={event => setColor(event.target.value as HighlightColor)}>{highlightColors.map(value => <option key={value}>{value}</option>)}</select></label><label>メモ<textarea value={note} maxLength={10000} onChange={event => setNote(event.target.value)} /></label>{draft ? <button onClick={() => void register()}>登録</button> : <><button onClick={() => void update()}>更新</button><button onClick={() => void remove()}>削除</button></>}</>}
    <p role="status">{message}</p>{error && <p role="alert">{error}</p>}
  </section>;
  const signalTarget = activeHighlight ?? draft;
  const createPopover = presentation === 'conversation' && signalTarget && draftPosition ? <MarkerQuickActionBar
    position={draftPosition} markerReady={Boolean(activeHighlight)} selectedColor={activeHighlight?.color} busy={signalBusy}
    targetText={signalTarget.target_text} operationError={error}
    onColor={value => activeHighlight ? void updateSignalColor(value) : void register(value)}
    onOpenDetail={() => { if (activeHighlight) beginEdit(activeHighlight); }}
    onMemo={onQuickMemo} onDictionary={onQuickDictionary} onClose={closeSignal} onReposition={repositionSignal} onFeedback={showQuickFeedback}
  /> : null;
  const markerError = presentation === 'conversation' && error && !draft && !activeHighlight && !editing ? <p className="production-marker-error" role="alert"><span>{error}</span><button type="button" aria-label="Markerエラーを閉じる" onClick={() => setError('')}>×</button></p> : null;
  const listPanel = <section className="marker-list" aria-label="会話内のマーカー一覧">
    <h3>マーカー一覧</h3>
    <fieldset><legend>色別表示フィルタ</legend>{highlightColors.map(value => <label className="color-filter" key={value}><input type="checkbox" checked={enabledColors.has(value)} onChange={() => toggleColor(value)} /><span className={`color-swatch mark-${value}`} aria-hidden="true" />{value}</label>)}</fieldset>
    <button onClick={() => setEnabledColors(new Set(highlightColors))}>すべて表示</button><button onClick={() => setEnabledColors(new Set())}>すべて非表示</button>
    <p>{visible.length} / {highlights.length}件を表示</p>
    {!visible.length ? <p>表示対象のマーカーはありません。</p> : <ul>{visible.map(highlight => {
      const turn = turns.find(value => value.turn_id === highlight.turn_id);
      const excerpt = markerExcerpt(highlight.target_text), isExpanded = expanded.has(highlight.highlight_id);
      return <li key={highlight.highlight_id} className={`marker-list-item marker-list-${highlight.status}`} data-list-highlight={highlight.highlight_id}>
        <p><span className={`color-swatch mark-${highlight.color}`} aria-hidden="true" /><strong>{highlight.color}</strong> · Assistant #{turn?.sequence_no ?? '?'}</p>
        <blockquote id={`marker-quote-${highlight.highlight_id}`}>{isExpanded ? highlight.target_text : excerpt.text}</blockquote><p>メモ: {highlight.note || '（なし）'}</p>
        {excerpt.truncated && <button aria-expanded={isExpanded} aria-controls={`marker-quote-${highlight.highlight_id}`} onClick={() => setExpanded(current => { const next = new Set(current); if (next.has(highlight.highlight_id)) next.delete(highlight.highlight_id); else next.add(highlight.highlight_id); return next; })}>{isExpanded ? '閉じる' : '全文表示'}</button>}
        {highlight.status === 'unresolved' ? <><p className="unresolved-reason">unresolved: {highlight.reason ?? '理由不明'}</p><button disabled>ジャンプ不可</button></> : <button onClick={() => jump(highlight)}>このマーカーへジャンプ</button>}
        <button onClick={() => beginEdit(highlight)}>編集</button><button onClick={() => void remove(highlight)}>削除</button>
        {renderMarkerActions?.(highlight, context)}
      </li>;
    })}</ul>}
  </section>;
  return <>
    {minimapHost ? createPortal(<MiniMap mode={minimapMode} onModeChange={onMinimapModeChange} key={conversationId} root={root} highlights={highlights} turns={turns} onJump={jump} embedded />, minimapHost) : <MiniMap key={conversationId} root={root} highlights={highlights} turns={turns} onJump={jump} />}
    {presentation === 'conversation' ? <>
      {createPopover}
      {markerError}
      {quickFeedback && <p className="production-marker-feedback" role="status">{quickFeedback}</p>}
      {renderEditorExtras?.(context)}
      {showMarkerManagement && <details className="marker-debug-tools"><summary>Marker管理（開発用）</summary>{editorPanel}{listPanel}<>{renderListExtras?.(context)}</></details>}
    </> : <>{editorPanel}{renderEditorExtras?.(context)}{listPanel}<>{renderListExtras?.(context)}</></>}
    <div ref={root} className="conversation-turns" onMouseUp={select} onClick={chooseMarker}><h3>保存された発言</h3>{turns.map(turn => {
      const content = turnContent?.(turn) ?? turn.content;
      const roleLabel = turn.role === 'user' ? 'You' : 'Assistant';
      const statusLabel = turn.status === 'completed' ? null : { generating: '生成中', cancelled: 'キャンセル', failed: '失敗' }[turn.status];
      return <article key={turn.turn_id} className={`conversation-turn turn-${turn.role} turn-${turn.status}`} data-turn={turn.turn_id}>
        <header className="turn-heading"><span className="turn-role">{roleLabel}</span><span className="turn-sequence">T{turn.sequence_no + 1}</span>{statusLabel && <span className="turn-status">{statusLabel}</span>}</header>
        {turn.role === 'assistant' && turn.status === 'completed' ? <div className="markdown"><TurnMarkdown content={content} highlights={highlights.filter(highlight => highlight.turn_id === turn.turn_id)} /></div> : <p className="turn-plain">{content}</p>}
        {showTurnIds && <small>{turn.turn_id}</small>}
      </article>;
    })}</div>
  </>;
}
