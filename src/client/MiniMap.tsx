import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Highlight, Turn } from '../shared/contracts.ts';
import { markerLanes, measureMinimap } from './minimap.ts';

export function MiniMap({ root, highlights, turns, onJump }: { root: RefObject<HTMLDivElement | null>; highlights: Highlight[]; turns: Turn[]; onJump: (highlight: Highlight) => void }) {
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 1100px)').matches);
  const [map, setMap] = useState<ReturnType<typeof measureMinimap> | null>(null);
  const frame = useRef(0);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1100px)');
    const change = () => { if (!media.matches) setOpen(false); };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!open || !root.current) return;
    const measure = () => { cancelAnimationFrame(frame.current); frame.current = requestAnimationFrame(() => { if (root.current) setMap(measureMinimap(root.current, highlights, window.innerHeight)); }); };
    const observer = new ResizeObserver(measure);
    observer.observe(root.current); observer.observe(document.body);
    window.addEventListener('scroll', measure, { passive: true }); window.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); cancelAnimationFrame(frame.current); window.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); };
  }, [root, highlights, turns, open]);
  const height = 280, lanes = markerLanes(map?.markers.map(m => m.position) ?? [], height);
  return <aside className="minimap" aria-label="会話のminiMAP">
    <button aria-expanded={open} aria-controls="minimap-content" onClick={() => setOpen(value => !value)}>miniMAP {open ? '閉じる' : '開く'}</button>
    {open && <div id="minimap-content">
      <small>会話内の位置<br/>全色を表示</small>
      <div className="minimap-scroll"><div className="minimap-rail" style={{ height: height + 20, width: Math.max(80, (Math.max(0, ...lanes) + 1) * 22 + 16) }}>
        {map?.viewport && <div className="minimap-viewport" aria-label="現在の表示範囲" style={{ top: 10 + map.viewport.start * height, height: Math.max(2, (map.viewport.end - map.viewport.start) * height) }} />}
        {map?.turns.map(turn => <span key={turn.id} className="minimap-turn" aria-hidden="true" style={{ top: 10 + turn.position * height }} />)}
        {map?.markers.map(({ highlight, position }, i) => <button key={highlight.highlight_id} className={`minimap-dot mark-${highlight.color}`} style={{ top: position * height, left: lanes[i] * 22 + 4 }} aria-label={`${highlight.color} Assistant #${turns.find(t => t.turn_id === highlight.turn_id)?.sequence_no ?? '?'} マーカー ${i + 1}へ移動`} onClick={() => onJump(highlight)} />)}
      </div></div>
      <small>{highlights.length === 0 ? 'Markerなし' : `${map?.markers.length ?? 0}件の位置`}</small>
      {!!map?.unknown && <p>位置不明: {map.unknown}件<br/><small>一覧で確認</small></p>}
      {map && !map.viewport && <small>本文は画面外</small>}
    </div>}
  </aside>;
}
