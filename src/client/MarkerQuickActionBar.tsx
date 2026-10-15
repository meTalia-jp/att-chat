import { useEffect, useRef, useState } from 'react';
import type { HighlightColor } from '../shared/contracts.ts';
import { highlightColors } from './marker-list.ts';
import type { MarkerQuickActionPosition } from './marker-quick-action.ts';

export function MarkerQuickActionBar({ position, markerReady, selectedColor, busy, targetText, operationError, onColor, onOpenDetail, onMemo, onDictionary, onClose, onReposition, onFeedback }: {
  position: MarkerQuickActionPosition;
  markerReady: boolean;
  selectedColor?: HighlightColor;
  busy: boolean;
  targetText: string;
  operationError?: string;
  onColor: (color: HighlightColor) => void;
  onOpenDetail: () => void;
  onMemo?: (text: string) => void | Promise<void>;
  onDictionary?: (text: string) => void | Promise<void>;
  onClose: () => void;
  onReposition: () => void;
  onFeedback: (message: string) => void;
}) {
  const signal = useRef<HTMLElement>(null);
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickError, setQuickError] = useState('');

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    const outside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && !signal.current?.contains(target)) onClose();
    };
    const reposition = () => onReposition();
    document.addEventListener('keydown', keydown);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [onClose, onReposition]);

  async function runQuickAction(action: ((text: string) => void | Promise<void>) | undefined, success: string, failure: string) {
    if (!action || quickBusy) return;
    setQuickBusy(true); setQuickError('');
    try {
      await action(targetText);
      onFeedback(success);
      onClose();
    } catch (error) {
      setQuickError(error instanceof Error && error.message ? error.message : failure);
    } finally {
      setQuickBusy(false);
    }
  }

  return <aside ref={signal} className="marker-quick-signal" role="dialog" aria-label="Marker Quick Action" style={{ left: position.left, top: position.top }} onPointerDown={event => { event.preventDefault(); event.stopPropagation(); }}>
    <div className="marker-quick-signal-row" role="toolbar" aria-label="Marker操作">
      <button type="button" className="marker-quick-glyph" aria-label="Marker詳細" disabled={!markerReady || busy || quickBusy} onClick={onOpenDetail}>▽</button>
      <span className="marker-quick-palette" aria-label="Marker色を選択">{highlightColors.map(value => <button type="button" key={value} className="marker-quick-color" aria-label={`${value} Marker色`} aria-pressed={selectedColor === value} disabled={busy || quickBusy} onClick={() => onColor(value)}><span className={`color-swatch mark-${value}`} aria-hidden="true" /></button>)}</span>
      <button type="button" className="marker-quick-text" disabled={busy || quickBusy || !onMemo} onClick={() => void runQuickAction(onMemo,'Quickメモへ追加しました','Quickメモへ追加できませんでした')}>メモ</button>
      <button type="button" className="marker-quick-text" disabled={busy || quickBusy || !onDictionary} onClick={() => void runQuickAction(onDictionary,'Quick辞書で検索しました','Quick辞書を開けませんでした')}>辞書</button>
    </div>
    {(quickError || operationError) && <small className="marker-quick-error" role="alert">{quickError || operationError}</small>}
  </aside>;
}
