import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Turn } from '../shared/contracts.ts';
import type { QuestionKeep } from '../shared/question-keep.ts';
import { apiRequest } from './api.ts';
import type { MarkerCoreContext } from './MarkerCore.tsx';
import { immediateAskMaxReferences, upsertImmediateAskReference, type ImmediateAskPrefix } from '../shared/production-immediate-ask.ts';
import { markerDetailPosition, type MarkerQuickActionPosition } from './marker-quick-action.ts';
import { markerQuestionPrefixes, applyMarkerQuestionPrefix, storedMarkerQuestionPrefix, hasExpertQuestionPrefix, type MarkerQuestionPrefix } from '../shared/marker-question-prefix.ts';

export type ImmediateAskDraft = {
  highlightId: string;
  turnId: string;
  turnNumber: number;
  quote: string;
  prefix: ImmediateAskPrefix;
  question: string;
};

export function upsertImmediateAskDraft(current: ImmediateAskDraft[], next: ImmediateAskDraft) {
  return upsertImmediateAskReference(current, next);
}

export function MarkerDetailAdapter({ conversationId, turns, context, sending, onImmediatePrepared, onKeepCreated }: {
  conversationId: string;
  turns: Turn[];
  context: MarkerCoreContext;
  sending: boolean;
  onImmediatePrepared: (draft: ImmediateAskDraft) => unknown;
  onKeepCreated: (keep: QuestionKeep) => void;
}) {
  const marker = context.editing;
  const [prefix, setPrefix] = useState<MarkerQuestionPrefix>('質問');
  const [question, setQuestion] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [position, setPosition] = useState<MarkerQuickActionPosition | null>(null);
  const panel = useRef<HTMLElement>(null);
  const latestAssistant = turns.filter(turn => turn.role === 'assistant' && turn.status === 'completed').sort((a, b) => a.sequence_no - b.sequence_no).at(-1);
  const markerTurn = marker ? turns.find(turn => turn.turn_id === marker.turn_id) : undefined;
  const immediateAvailable = !!marker && marker.status === 'resolved' && marker.turn_id === latestAssistant?.turn_id;

  useEffect(() => {
    if (!marker) return;
    setPrefix('質問'); setQuestion(''); setMemo(marker.note); setMessage(''); setError('');
  }, [marker?.highlight_id, latestAssistant?.turn_id]);

  useEffect(() => {
    if (!marker) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && !panel.current?.contains(target) && !(target as Element).closest?.('[data-highlight]')) context.closeEditing();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') context.closeEditing(); };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [marker?.highlight_id, context.closeEditing]);

  useLayoutEffect(() => {
    if (!marker) { setPosition(null); return; }
    const reposition = () => {
      const element = panel.current;
      if (!element) return;
      const panelRect = element.getBoundingClientRect();
      const anchor = context.getHighlightAnchor(marker) ?? {
        x: Math.max(8, (window.innerWidth - panelRect.width) / 2),
        y: 54,
        lineTop: 54,
        lineBottom: 54,
      };
      setPosition(markerDetailPosition(anchor, window.innerWidth, window.innerHeight, panelRect.width, panelRect.height));
    };
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [marker?.highlight_id, context.getHighlightAnchor]);

  if (!marker) return null;
  const activeMarker = marker;
  const turnNumber = (markerTurn?.sequence_no ?? -1) + 1;

  async function saveMemoIfChanged() {
    if (memo === activeMarker.note) return true;
    const saved = await context.updateEditing();
    if (!saved) { setError('メモを保存できませんでした。'); return false; }
    return true;
  }

  async function saveKeep() {
    if (busy || activeMarker.status !== 'resolved') return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (!await saveMemoIfChanged()) return;
      const keep = await apiRequest<QuestionKeep>(`/api/conversations/${conversationId}/question-keeps`, 'POST', {
        highlight_id: activeMarker.highlight_id, question_draft: question, memo,
      });
      onKeepCreated(keep); setMessage('質問箱へ保存しました'); context.closeEditing();
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }

  async function prepareImmediate() {
    if (busy || !immediateAvailable || sending || !question.trim()) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (!await saveMemoIfChanged()) return;
      const accepted=onImmediatePrepared({ highlightId: activeMarker.highlight_id, turnId: activeMarker.turn_id, turnNumber, quote: activeMarker.target_text, prefix:storedMarkerQuestionPrefix(prefix), question });
      if(accepted===false){setError('Marker質問は5件までです。既存の参照を外してから追加してください。');return}
      setMessage('参照中へ追加しました。'); context.closeEditing();
    } finally { setBusy(false); }
  }

  async function saveMemo() {
    if (busy || memo === activeMarker.note) return;
    setBusy(true); setError(''); setMessage('');
    try { if (await saveMemoIfChanged()) setMessage('メモを保存しました。'); }
    finally { setBusy(false); }
  }

  async function removeMarker() {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await context.removeEditing(); }
    finally { setBusy(false); }
  }

  return <aside ref={panel} className="production-marker-detail" role="dialog" aria-label="Marker Detail" style={{ left: position?.left ?? 8, top: position?.top ?? 8, visibility: position ? 'visible' : 'hidden' }}>
    <header><div><small>T{turnNumber} Marker</small><blockquote>「{marker.target_text}」</blockquote></div><button type="button" aria-label="Marker Detailを閉じる" onClick={context.closeEditing}>×</button></header>
    {!immediateAvailable && <small className="production-marker-guidance">今すぐ質問は最新のcompleted Assistant Turnだけ利用できます。過去のMarkerは「後で質問」を利用できます。</small>}
    {marker.status === 'unresolved' && <small className="production-marker-guidance">Marker位置を確認できないため質問を保存できません。</small>}
    <div className="production-marker-prefixes"><span>prefix</span>{markerQuestionPrefixes.map(([label]) => <button type="button" key={label} aria-pressed={prefix===label} disabled={busy} onClick={() => {setPrefix(label);setQuestion(current => applyMarkerQuestionPrefix(current, label))}}>{label}</button>)}</div>
    <label className="production-marker-question">AIへの質問<textarea value={question} rows={4} maxLength={10000} disabled={busy} onChange={event => { const value = event.target.value; setQuestion(value); if (prefix === '素人' && !hasExpertQuestionPrefix(value)) setPrefix('質問'); }} /></label>
    <label className="production-marker-memo">メモ<textarea value={memo} rows={2} maxLength={10000} disabled={busy} onInput={event => { const value=event.currentTarget.value; setMemo(value); context.setNote(value); }} /></label>
    <div className="production-marker-detail-actions"><button type="button" className="primary" disabled={busy || sending || !immediateAvailable || !question.trim()} onClick={() => void prepareImmediate()}>今すぐ質問</button><button type="button" disabled={busy || activeMarker.status !== 'resolved'} onClick={() => void saveKeep()}>質問箱（後で質問）</button></div>
    <div className="production-marker-detail-secondary"><button type="button" className="danger" disabled={busy} onClick={() => void removeMarker()}>削除</button><button type="button" disabled={busy || memo === activeMarker.note} onClick={() => void saveMemo()}>メモを保存</button></div>
    <p role="status">{message || context.message}</p>{(error || context.error) && <p role="alert">{error || context.error}</p>}
  </aside>;
}
