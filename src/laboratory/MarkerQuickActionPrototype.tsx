import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { HighlightColor } from '../shared/contracts.ts';
import { palettePosition, paragraphSlice, overlaps, textareaHeight, type PalettePosition, type QuickMarker, type SelectionPoint } from './marker-quick-action.ts';
import './marker-quick-action.css';

const colors: readonly HighlightColor[] = ['yellow', 'red', 'green', 'blue'];
type UiVariant = 'a' | 'd2';
type OpenPanel = 'none' | 'detail' | 'quick';
const variants: readonly { id: UiVariant; title: string; note: string }[] = [
  { id: 'a', title: 'A: Light', note: '白い筐体と細い境界線' },
  { id: 'd2', title: 'D2: Soft Gray', note: '薄いグレーの操作部品' },
] as const;
const compactSize = { width: 216, height: 44 } as const;
const expandedWidth = 360;
const paragraphs = [
  '画面上部の選択を確認する段落です。文中の語句をドラッグし、パレットが選択範囲を大きく隠さないか確認してください。行頭から選ぶ場合も試せます。',
  '会話を読み返していると、結論だけでなく、その結論へ至った条件や例外にも印を付けたくなります。色を一度押すだけで操作が終われば、読み進める流れを止めずに複数の気付きへMarkerを付けられる可能性があります。',
  'この段落は複数行選択の確認用です。途中から次の行まで広く選択し、通常は選択範囲の下にパレットが現れ、下側に収まらない場合は上へ反転すること、選択文字列が色ボタンの背後へ完全に隠れないことを観察します。文章の終端付近を選ぶ試験にも利用してください。',
  'スクロール後の位置も重要です。ページの中ほどまで移動してから文章を選び、現在のviewportを基準にパレットが再計算されるか確認します。開いたままスクロールした場合も位置を追従します。',
  '左右端を試すための段落です。狭い画面では行頭または行末を選び、パレットが画面外へはみ出さず、4つの色を押せる幅を維持するか確認してください。',
  '画面下部の確認用段落です。通常は選択範囲の下へ表示し、下端近くで十分な余白がない場合だけ上へ反転します。最終的にはviewport内へ収めます。',
] as const;

type Draft = { start: SelectionPoint; end: SelectionPoint; selectedText: string };

function SignalHeader({ selected, markerReady, panel, colorAction, openDetail, openQuick }: {
  selected?: HighlightColor; markerReady: boolean; panel: OpenPanel;
  colorAction: (color: HighlightColor) => void; openDetail: () => void; openQuick: () => void;
}) {
  return <div className="quick-signal-header" role="toolbar" aria-label="Marker Signal" data-signal-header>
    <button type="button" className="quick-signal-arrow" aria-label="Marker Detailを開く" aria-expanded={panel === 'detail'} disabled={!markerReady}
      title={markerReady ? '参考メモ・Attention' : 'Marker作成後に使用できます'} onPointerDown={event => event.preventDefault()} onClick={openDetail}>▽</button>
    {colors.map(color => <button key={color} type="button" className={`quick-color-button quick-color-${color}`} aria-label={selected ? `${color}に変更` : `${color} Markerを作成`}
      aria-pressed={selected ? selected === color : undefined} title={color} onPointerDown={event => event.preventDefault()} onClick={() => colorAction(color)} />)}
    <button type="button" className="quick-signal-arrow" aria-label="Quick Toolを開く" aria-expanded={panel === 'quick'}
      title="Quick Tool" onPointerDown={event => event.preventDefault()} onClick={openQuick}>▽</button>
  </div>;
}

function AutoGrowTextarea({ value, rows, minHeight, maxHeight, label, update }: {
  value: string; rows: number; minHeight: number; maxHeight: number; label: string;
  update: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    const sizing = textareaHeight(element.scrollHeight, minHeight, maxHeight);
    element.style.height = `${sizing.height}px`;
    element.style.overflowY = sizing.overflowY;
  }, [value, minHeight, maxHeight]);
  return <textarea ref={ref} rows={rows} value={value} aria-label={label} data-auto-grow
    onChange={event => update(event.target.value)} />;
}

function paragraphPoint(root: HTMLElement, node: Node, offset: number): SelectionPoint | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  const paragraph = element?.closest<HTMLElement>('[data-quick-paragraph]');
  if (!paragraph || !root.contains(paragraph)) return null;
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  try { range.setEnd(node, offset); } catch { return null; }
  return { paragraph: Number(paragraph.dataset.quickParagraph), offset: range.toString().length };
}

function renderParagraph(text: string, paragraph: number, markers: readonly QuickMarker[], open: (id: string) => void) {
  const slices = markers.flatMap(marker => {
    const slice = paragraphSlice(marker, paragraph, text.length);
    return slice ? [{ ...slice, marker }] : [];
  }).sort((a, b) => a.start - b.start);
  const result: React.ReactNode[] = [];
  let cursor = 0;
  for (const { start, end, marker } of slices) {
    if (start < cursor) continue;
    if (start > cursor) result.push(<Fragment key={`${cursor}-plain`}>{text.slice(cursor, start)}</Fragment>);
    result.push(<mark key={marker.marker_id} data-quick-marker={marker.marker_id} role="button" tabIndex={0} aria-label={`Markerを編集: ${text.slice(start, end)}`} onClick={() => { if (window.getSelection()?.isCollapsed !== false) open(marker.marker_id); }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(marker.marker_id); } }} className={`quick-mark quick-mark-${marker.color}`}>{text.slice(start, end)}</mark>);
    cursor = end;
  }
  if (cursor < text.length) result.push(<Fragment key={`${cursor}-plain`}>{text.slice(cursor)}</Fragment>);
  return result;
}

export function MarkerQuickActionPrototype() {
  const rootRef = useRef<HTMLDivElement>(null), paletteRef = useRef<HTMLDivElement>(null), rangeRef = useRef<Range | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [variant, setVariant] = useState<UiVariant>('d2');
  const [panel, setPanel] = useState<OpenPanel>('none');
  const [position, setPosition] = useState<PalettePosition>({ left: 8, top: 8, placement: 'below' });
  const [markers, setMarkers] = useState<QuickMarker[]>([]), [message, setMessage] = useState('文章をドラッグ選択してください。');

  function place(range = rangeRef.current) {
    const element = editing ? rootRef.current?.querySelector<HTMLElement>(`[data-quick-marker="${editing}"]`) : null;
    if (!element && !range) return;
    const rect = element ? element.getBoundingClientRect() : range!.getBoundingClientRect();
    const expanded = panel !== 'none';
    const width = Math.min(expandedWidth, window.innerWidth - 16);
    const size = expanded ? {width, height: paletteRef.current?.getBoundingClientRect().height || 320} : { width: Math.min(compactSize.width, window.innerWidth - 16), height: compactSize.height };
    setPosition(palettePosition(rect, { width: window.innerWidth, height: window.innerHeight }, size, 8, true));
  }
  function close(clearSelection = false) {
    setDraft(null); setEditing(null); setPanel('none'); rangeRef.current = null;
    if (clearSelection) window.getSelection()?.removeAllRanges();
  }
  function selected() {
    const root = rootRef.current, selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const start = paragraphPoint(root, range.startContainer, range.startOffset);
    const end = paragraphPoint(root, range.endContainer, range.endOffset);
    const selectedText = range.toString();
    if (!start || !end || !selectedText.trim()) return;
    close();
    if (markers.some(marker => overlaps({start,end}, marker))) {
      setMessage('既存Markerと重複しています'); return;
    }
    rangeRef.current = range.cloneRange();
    setDraft({ start, end, selectedText }); place(range);
    setMessage(`${selectedText.length}文字を選択中。色を選ぶと1クリックでMarker化します。`);
  }
  function create(color: HighlightColor) {
    if (!draft || markers.some(marker => overlaps(draft, marker))) return;
    const id = crypto.randomUUID();
    setMarkers(current => [...current, { marker_id: id, color, start: draft.start, end: draft.end, selected_text: draft.selectedText, memo: '', attention: '' }]);
    setMessage(`${color} Markerを作成しました。Detailは左▽から開けます。`);
    setDraft(null); rangeRef.current = null; window.getSelection()?.removeAllRanges(); setEditing(id); setPanel('none');
  }
  function open(id: string) { close(true); setEditing(id); setPanel('none'); }
  const marker = markers.find(item => item.marker_id === editing);
  function update(values: Partial<Pick<QuickMarker, 'color' | 'memo' | 'attention'>>) {
    setMarkers(current => current.map(item => item.marker_id === editing ? {...item,...values} : item));
  }
  useEffect(() => {
    if (!editing) return;
    const timer = window.setTimeout(() => place(), 0);
    return () => window.clearTimeout(timer);
  }, [editing, marker?.memo, marker?.attention, variant, panel]);
  useEffect(() => {
    if (!draft) return;
    const timer = window.setTimeout(() => place(), 0);
    return () => window.clearTimeout(timer);
  }, [draft, variant, panel]);
  useEffect(() => {
    if (!draft && !editing) return;
    const outside = (event: PointerEvent) => { if (!paletteRef.current?.contains(event.target as Node)) close(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { close(); setMessage('パレットを閉じました。'); } };
    const reposition = () => place();
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', key);
    window.addEventListener('scroll', reposition, true); window.addEventListener('resize', reposition);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition); };
  }, [draft, editing, variant, panel]);

  return <div className={`quick-action-prototype quick-variant-${variant}`} aria-label="Marker Quick Action Prototype" data-ui-variant={variant}>
    <fieldset className="quick-variant-picker">
      <legend>UI Variant</legend>
      {variants.map(item => <label key={item.id}>
        <input type="radio" name="quick-ui-variant" value={item.id} checked={variant === item.id} onChange={() => setVariant(item.id)} />
        <span><strong>{item.title}</strong><small>{item.note}</small></span>
      </label>)}
    </fieldset>
    <p className="quick-action-guide">数段落のAssistant本文を想定した操作実験です。選択後に現れる4色の小型パレットを試してください。Markerはメモリ内だけに保持し、DBへ保存しません。</p>
    <p role="status">{message}</p>
    <div className="quick-action-document" ref={rootRef} onMouseUp={selected} aria-label="試験用Assistant本文">
      {paragraphs.map((text, index) => <p key={index} data-quick-paragraph={index}>{renderParagraph(text, index, markers, open)}</p>)}
    </div>
    {(draft || marker) && <div ref={paletteRef} role={panel === 'none' ? undefined : 'dialog'} aria-label={panel === 'detail' ? 'Marker Detail Popup' : panel === 'quick' ? 'Quick Tool Popup' : undefined}
      className={`quick-floating ${panel === 'none' ? 'quick-floating-compact' : 'quick-floating-expanded'} quick-floating-${position.placement}`} style={{left:position.left,top:position.top}}>
      <SignalHeader selected={marker?.color} markerReady={!!marker} panel={panel}
        colorAction={marker ? color => update({color}) : create}
        openDetail={() => { if (marker) setPanel(current => current === 'detail' ? 'none' : 'detail'); }}
        openQuick={() => setPanel(current => current === 'quick' ? 'none' : 'quick')} />
      {panel === 'detail' && marker && <div className="quick-detail-body">
        <label>参考メモ<AutoGrowTextarea label="参考メモ" rows={3} minHeight={72} maxHeight={176} value={marker.memo} update={memo => update({memo})}/></label>
        <label>Attention<AutoGrowTextarea label="Attention" rows={4} minHeight={94} maxHeight={202} value={marker.attention} update={attention => update({attention})}/></label>
        <button className="quick-delete-marker" type="button" onClick={() => {setMarkers(current => current.filter(item => item.marker_id !== editing)); close(true); setMessage('Markerを削除しました');}}>Markerを削除</button>
      </div>}
      {panel === 'quick' && <div className="quick-tool-body"><strong>Quick Tool</strong><p>Quick Memo</p><small>Coming next</small></div>}
    </div>}
    <section className="quick-action-created" aria-label="作成済みPrototype Marker"><h3>作成済みMarker</h3>
      {markers.length === 0 ? <p>まだありません。</p> : <ol>{markers.map(marker => <li key={marker.marker_id}><span className={`quick-created-swatch quick-color-${marker.color}`} />{marker.color}: {marker.selected_text}</li>)}</ol>}
    </section>
  </div>;
}
