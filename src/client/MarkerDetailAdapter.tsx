import { useEffect, useRef, useState } from 'react';
import type { Turn } from '../shared/contracts.ts';
import type { QuestionKeep } from '../shared/question-keep.ts';
import { apiRequest } from './api.ts';
import { highlightColors } from './marker-list.ts';
import type { MarkerCoreContext } from './MarkerCore.tsx';
import { immediateAskMaxReferences, upsertImmediateAskReference, type ImmediateAskPrefix } from '../shared/production-immediate-ask.ts';

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

const prefixes = [
  ['質問', '質問です。 '],
  ['しかし…', 'ただ、疑問が残ります。 '],
  ['意見', '私の考えでは、'],
] as const;

export function MarkerDetailAdapter({ conversationId, turns, context, sending, onImmediatePrepared, onKeepCreated }: {
  conversationId: string;
  turns: Turn[];
  context: MarkerCoreContext;
  sending: boolean;
  onImmediatePrepared: (draft: ImmediateAskDraft) => unknown;
  onKeepCreated: (keep: QuestionKeep) => void;
}) {
  const marker = context.editing;
  const [mode, setMode] = useState<'immediate' | 'deferred'>('immediate');
  const [prefix, setPrefix] = useState<ImmediateAskPrefix>('質問');
  const [question, setQuestion] = useState('');
  const [keepMemo, setKeepMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const panel = useRef<HTMLElement>(null);
  const latestAssistant = turns.filter(turn => turn.role === 'assistant' && turn.status === 'completed').sort((a, b) => a.sequence_no - b.sequence_no).at(-1);
  const markerTurn = marker ? turns.find(turn => turn.turn_id === marker.turn_id) : undefined;
  const immediateAvailable = !!marker && marker.status === 'resolved' && marker.turn_id === latestAssistant?.turn_id;

  useEffect(() => {
    if (!marker) return;
    setMode(marker.status === 'resolved' && marker.turn_id === latestAssistant?.turn_id ? 'immediate' : 'deferred');
    setPrefix('質問'); setQuestion(''); setKeepMemo(''); setMessage(''); setError('');
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

  if (!marker) return null;
  const activeMarker = marker;
  const turnNumber = (markerTurn?.sequence_no ?? -1) + 1;

  async function saveKeep() {
    if (busy || activeMarker.status !== 'resolved') return;
    setBusy(true); setError(''); setMessage('');
    try {
      const keep = await apiRequest<QuestionKeep>(`/api/conversations/${conversationId}/question-keeps`, 'POST', {
        highlight_id: activeMarker.highlight_id, question_draft: question, memo: keepMemo,
      });
      onKeepCreated(keep); setMessage('質問箱へ保存しました'); context.closeEditing();
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }

  function prepareImmediate() {
    if (!immediateAvailable || sending || !question.trim()) return;
    const accepted=onImmediatePrepared({ highlightId: activeMarker.highlight_id, turnId: activeMarker.turn_id, turnNumber, quote: activeMarker.target_text, prefix, question });
    if(accepted===false){setError('Marker質問は5件までです。既存の参照を外してから追加してください。');return}
    setMessage('参照中へ追加しました。'); context.closeEditing();
  }

  return <aside ref={panel} className="production-marker-detail" role="dialog" aria-label="Marker Detail">
    <header><div><small>T{turnNumber} Marker</small><blockquote>「{marker.target_text}」</blockquote></div><button type="button" aria-label="Marker Detailを閉じる" onClick={context.closeEditing}>×</button></header>
    <div className="production-marker-ask-modes"><button type="button" aria-pressed={mode === 'immediate'} disabled={!immediateAvailable || sending} onClick={() => setMode('immediate')}>今すぐ質問</button><button type="button" aria-pressed={mode === 'deferred'} disabled={marker.status !== 'resolved'} onClick={() => setMode('deferred')}>後で質問</button></div>
    {!immediateAvailable && <small className="production-marker-guidance">今すぐ質問は最新のcompleted Assistant Turnだけ利用できます。過去のMarkerは「後で質問」を利用できます。</small>}
    {marker.status === 'unresolved' && <small className="production-marker-guidance">Marker位置を確認できないため質問を保存できません。</small>}
    <div className="production-marker-prefixes"><span>prefix</span>{prefixes.map(([label, text]) => <button type="button" key={label} aria-pressed={prefix===label} disabled={busy} onClick={() => {setPrefix(label);setQuestion(current => current + text)}}>{label}</button>)}</div>
    <label>質問入力<input value={question} maxLength={10000} disabled={busy} onChange={event => setQuestion(event.target.value)} /></label>
    {mode === 'deferred' && <label>質問メモ<textarea value={keepMemo} maxLength={10000} disabled={busy} onChange={event => setKeepMemo(event.target.value)} /></label>}
    <label>Marker色<span><i className={`color-swatch mark-${context.color}`} aria-hidden="true" /><select aria-label="Marker色" value={context.color} disabled={busy} onChange={event => context.setColor(event.target.value as typeof context.color)}>{highlightColors.map(value => <option key={value}>{value}</option>)}</select></span></label>
    <label>Marker memo<textarea value={context.note} maxLength={10000} disabled={busy} onChange={event => context.setNote(event.target.value)} /></label>
    <div className="production-marker-detail-actions"><button type="button" disabled={busy} onClick={() => void context.updateEditing()}>Markerを更新</button><button type="button" className="primary" disabled={busy || sending || (mode === 'immediate' ? !immediateAvailable || !question.trim() : marker.status !== 'resolved')} onClick={() => mode === 'immediate' ? prepareImmediate() : void saveKeep()}>{mode === 'immediate' ? 'Composerへ準備' : '質問箱へ保存'}</button></div>
    <p role="status">{message || context.message}</p>{(error || context.error) && <p role="alert">{error || context.error}</p>}
  </aside>;
}
