import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { HighlightColor } from '../shared/contracts.ts';
import { palettePosition, endSignalPosition, quickMenuPosition, paragraphSlice, overlaps, textareaHeight, type PalettePosition, type QuickMarker, type SelectionPoint } from './marker-quick-action.ts';
import './marker-quick-action.css';
import { QuestionBoxSidebar, type LabQuestionKeep } from './QuestionBoxSidebar.tsx';
import { QuickMemoPanel, type QuickMemoItem } from './QuickMemoPanel.tsx';
import { DictionaryPanel } from './DictionaryPanel.tsx';
import { createDictionarySearch, quickDictionary, type DictionaryResult } from './quick-dictionary.ts';
import {
  questionBoxHandoffMarkerStart, questionBoxHandoffPrerequisiteMarker,
  questionBoxHandoffPrerequisiteSource, questionBoxHandoffPrerequisiteStart, questionBoxHandoffSource,
} from './new-chat-handoff.ts';

const colors: readonly HighlightColor[] = ['yellow', 'red', 'green', 'blue'];
type UiVariant = 'a' | 'd2';
type OpenPanel = 'none' | 'detail' | 'quick';
const quickItems = ['Quick Memo', 'Dictionary'] as const;
const sourceTurnId = 'quick-action-fixture-assistant-1';
const variants: readonly { id: UiVariant; title: string; note: string }[] = [
  { id: 'a', title: 'A: Light', note: '白い筐体と細い境界線' },
  { id: 'd2', title: 'D2: Soft Gray', note: '薄いグレーの操作部品' },
] as const;
const compactSize = { width: 216, height: 44 } as const;
const expandedWidth = 360;
const paragraphs = [
  'experiment EXPERIMENT  experiment  qzxqzxunknown 日本語 two words test123 experiment, を選択してDictionaryを確認できます。',
  '画面上部の選択を確認する段落です。文中の語句をドラッグし、パレットが選択範囲を大きく隠さないか確認してください。行頭から選ぶ場合も試せます。',
  '会話を読み返していると、結論だけでなく、その結論へ至った条件や例外にも印を付けたくなります。色を一度押すだけで操作が終われば、読み進める流れを止めずに複数の気付きへMarkerを付けられる可能性があります。',
  'この段落は複数行選択の確認用です。途中から次の行まで広く選択し、通常は選択範囲の下にパレットが現れ、下側に収まらない場合は上へ反転すること、選択文字列が色ボタンの背後へ完全に隠れないことを観察します。文章の終端付近を選ぶ試験にも利用してください。',
  'スクロール後の位置も重要です。ページの中ほどまで移動してから文章を選び、現在のviewportを基準にパレットが再計算されるか確認します。開いたままスクロールした場合も位置を追従します。',
  '左右端を試すための段落です。狭い画面では行頭または行末を選び、パレットが画面外へはみ出さず、4つの色を押せる幅を維持するか確認してください。',
  '画面下部の確認用段落です。通常は選択範囲の下へ表示し、下端近くで十分な余白がない場合だけ上へ反転します。最終的にはviewport内へ収めます。',
] as const;

const handoffTurns = [10, 25, 25] as const;
const questionBoxExtraSamples = [
  ['question-box-d', 3, '要件の優先順位を確認する', 'この判断の根拠を確認'],
  ['question-box-d', 7, '既存仕様との境界を整理する', '変更範囲を後で確認'],
  ['question-box-d', 12, '操作後の状態を保持する', '保持期間を確認'],
  ['question-box-d', 18, '例外時はTurnへ戻る', '例外条件を整理'],
  ['question-box-d', 24, '小さな案内を表示する', '表示時間を確認'],
  ['question-box-e', 2, '一覧は新しい順に並べる', '同時刻の順序を確認'],
  ['question-box-e', 6, 'Conversationごとにまとめる', '分類単位を確認'],
  ['question-box-e', 11, '見出しに件数を表示する', '件数更新を確認'],
  ['question-box-e', 16, 'すべて閉じる操作を置く', '再展開方法を確認'],
  ['question-box-e', 21, 'Keepがある会話だけ表示する', '空会話の扱いを確認'],
  ['question-box-f', 4, 'Marker本文を短く抜粋する', '抜粋長を確認'],
  ['question-box-f', 9, '質問メモは任意にする', '空欄表示を確認'],
  ['question-box-f', 15, '元へ戻るボタンを明示する', '誤操作しないか確認'],
  ['question-box-f', 20, '最新の会話だけを展開する', '初期状態を確認'],
] as const;
type AskReference = { markerId: string; turnId: string; turnNumber: number; sourceText: string };
type AskPreparation = AskReference & { draftText: string; mode: 'immediate' | 'deferred' };
type DeferredQuestion = LabQuestionKeep;

type Draft = { start: SelectionPoint; end: SelectionPoint; selectedText: string };

function SignalHeader({ selected, markerReady, markerAllowed, panel, colorAction, openDetail, openQuick }: {
  selected?: HighlightColor; markerReady: boolean; markerAllowed: boolean; panel: OpenPanel;
  colorAction: (color: HighlightColor) => void; openDetail: () => void; openQuick: () => void;
}) {
  return <div className="quick-signal-header" role="toolbar" aria-label="Marker Signal" data-signal-header>
    <button type="button" className="quick-signal-arrow" aria-label="Marker Detailを開く" aria-expanded={panel === 'detail'} disabled={!markerReady}
      title={markerReady ? '質問とMarker操作' : 'Marker作成後に使用できます'} onPointerDown={event => event.preventDefault()} onClick={openDetail}>▽</button>
    {colors.map(color => <button key={color} type="button" className={`quick-color-button quick-color-${color}`} aria-label={selected ? `${color}に変更` : `${color} Markerを作成`}
      aria-pressed={selected ? selected === color : undefined} disabled={!markerAllowed} title={markerAllowed ? color : '既存Markerと重複しています'} onPointerDown={event => event.preventDefault()} onClick={() => colorAction(color)} />)}
    <button type="button" className="quick-signal-arrow" aria-label="Quick Menuを開く" aria-expanded={panel === 'quick'}
      title="Quick Menu（操作試験）" onPointerDown={event => event.preventDefault()} onClick={openQuick}>▷</button>
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

function renderParagraph(text: string, paragraph: number, markers: readonly QuickMarker[], open: (id: string) => void, annotated: ReadonlySet<string>) {
  const slices = markers.flatMap(marker => {
    const slice = paragraphSlice(marker, paragraph, text.length);
    return slice ? [{ ...slice, marker }] : [];
  }).sort((a, b) => a.start - b.start);
  const result: React.ReactNode[] = [];
  let cursor = 0;
  for (const { start, end, marker } of slices) {
    if (start < cursor) continue;
    if (start > cursor) result.push(<Fragment key={`${cursor}-plain`}>{text.slice(cursor, start)}</Fragment>);
    result.push(<mark key={marker.marker_id} data-quick-marker={marker.marker_id} role="button" tabIndex={0} aria-label={`Markerを編集: ${text.slice(start, end)}`} onClick={() => { if (window.getSelection()?.isCollapsed !== false) open(marker.marker_id); }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(marker.marker_id); } }} data-question-info={annotated.has(marker.marker_id) ? 'true' : undefined} title={annotated.has(marker.marker_id) ? '質問の追加情報あり' : undefined} className={`quick-mark quick-mark-${marker.color}`}>{text.slice(start, end)}</mark>);
    cursor = end;
  }
  if (cursor < text.length) result.push(<Fragment key={`${cursor}-plain`}>{text.slice(cursor)}</Fragment>);
  return result;
}

export function MarkerQuickActionPrototype() {
  const rootRef = useRef<HTMLDivElement>(null), paletteRef = useRef<HTMLDivElement>(null), rangeRef = useRef<Range | null>(null);
  const [preparation, setPreparation] = useState<AskPreparation | null>(null);
  const [immediateQuestions, setImmediateQuestions] = useState<(AskReference & { questionText: string })[]>([]);
  const [deferredQuestions, setDeferredQuestions] = useState<DeferredQuestion[]>([]);
  const [leftTab, setLeftTab] = useState<'chat' | 'questions'>('chat');
  const [conversationId, setConversationId] = useState('quick-action-fixture');
  const [returnTarget, setReturnTarget] = useState<{ keep: LabQuestionKeep; request: number } | null>(null);
  const [returnNotice, setReturnNotice] = useState('');
  const conversationsRef = useRef<HTMLDivElement>(null);
  const annotated = new Set([...immediateQuestions.map(item => item.markerId), ...deferredQuestions.map(item => item.markerId)]);
  const [sendPreview, setSendPreview] = useState<string | null>(null);
  const [mainDraft, setMainDraft] = useState('');
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 8, top: 8, side: 'right' });
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [quickMemos, setQuickMemos] = useState<QuickMemoItem[]>([]);
  const [dictionaryResult, setDictionaryResult] = useState<DictionaryResult | null>(null);
  const [dictionarySearch] = useState(() => createDictionarySearch(quickDictionary, setDictionaryResult));
  useEffect(() => () => dictionarySearch.cancel(), [dictionarySearch]);
  const [variant, setVariant] = useState<UiVariant>('d2');
  const [panel, setPanel] = useState<OpenPanel>('none');
  const [position, setPosition] = useState<PalettePosition>({ left: 8, top: 8, placement: 'below' });
  const [markers, setMarkers] = useState<QuickMarker[]>([]), [message, setMessage] = useState('文章をドラッグ選択してください。');

  function place(range = rangeRef.current) {
    const fragments = editing ? rootRef.current?.querySelectorAll<HTMLElement>(`[data-quick-marker="${editing}"]`) : null;
    const element = fragments?.[panel === 'detail' ? 0 : fragments.length - 1];
    if (!element && !range) return;
    const bounds = element ? element.getBoundingClientRect() : range!.getBoundingClientRect();
    const lines = Array.from(element ? element.getClientRects() : range!.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
    const expanded = panel === 'detail';
    const rect = expanded ? bounds : lines.at(-1) ?? bounds;
    const width = Math.min(expandedWidth, window.innerWidth - 16);
    const size = expanded ? {width, height: paletteRef.current?.getBoundingClientRect().height || 320} : { width: Math.min(compactSize.width, window.innerWidth - 16), height: compactSize.height };
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    setPosition(expanded ? palettePosition(rect, viewport, size, 8, true) : endSignalPosition(rect, viewport, size));
  }
  function close(clearSelection = false) {
    setDraft(null); setEditing(null); setPanel('none'); setPreparation(null); rangeRef.current = null;
    if (clearSelection) window.getSelection()?.removeAllRanges();
  }
  function canAsk(item: QuickMarker) { return item.start.paragraph === item.end.paragraph && handoffTurns[item.start.paragraph - paragraphs.length] === 25; }
  function prepareAsk(mode: 'immediate' | 'deferred') {
    if (!marker || (mode === 'immediate' && !canAsk(marker))) return;
    const turnNumber = handoffTurns[marker.start.paragraph - paragraphs.length] ?? 1;
    setPreparation({ markerId: marker.marker_id, turnId: `fixture-turn-${turnNumber}`, turnNumber, sourceText: marker.selected_text, draftText: preparation?.draftText ?? '', mode });
  }
  function handoff() {
    if (!preparation) return;
    const { draftText, mode, ...reference } = preparation;
    if (!marker) return;
    if (mode === 'deferred') {
      setDeferredQuestions(current => [...current, {...reference, keepId: crypto.randomUUID(), question_draft: draftText, conversationId: 'quick-action-fixture', start: {...marker.start}, end: {...marker.end}, createdAt: new Date().toISOString(), sourceTurnText: marker.selected_text, markerStartOffset: 0, markerEndOffset: marker.selected_text.length}]);
      close(true);
      setMessage('後で質問としてLab内に保留しました。');
      return;
    }
    setImmediateQuestions(current => current.some(item => item.markerId === reference.markerId) ? current : [...current, {...reference, questionText: draftText}]);
    setSendPreview(null);
    close(true);
    chatInputRef.current?.focus();
    chatInputRef.current?.scrollIntoView?.({ block: 'center' });
  }
  function loadAskFixture() {
    setMarkers(current => [...current, ...handoffTurns.flatMap((turnNumber, index) => {
      const paragraph = paragraphs.length + index;
      return current.some(item => item.start.paragraph === paragraph) ? [] : [{ marker_id: `ask-fixture-${index}`, color: 'yellow' as const, start: { paragraph, offset: 0 }, end: { paragraph, offset: 8 }, selected_text: '月がきれいですね', memo: '', attention: '' }];
    })]);
  }
  function loadQuestionBoxFixture() {
    loadAskFixture();
    const seeds: LabQuestionKeep[] = [
      { keepId: 'box-a-extra', markerId: 'ask-fixture-1', conversationId: 'quick-action-fixture', turnId: 'fixture-turn-25', turnNumber: 25, sourceText: '月がきれいですね', question_draft: 'もう一つの観点', start:{paragraph:8,offset:0}, end:{paragraph:8,offset:8}, createdAt:'2026-09-27T23:59:00Z' },
      { keepId: 'box-c-conversation', markerId: 'missing-c', conversationId: 'question-box-c', turnId: 'box-c-turn-1', turnNumber: 1, sourceText: '比較条件を確認する', question_draft: '条件の違いを後で確認', start:{paragraph:0,offset:0}, end:{paragraph:0,offset:9}, createdAt:'2026-09-28T00:04:00Z', unresolved:true },
      { keepId: 'box-c', markerId: 'ask-fixture-0', conversationId: 'quick-action-fixture', turnId: 'fixture-turn-10', turnNumber: 10, sourceText: '月がきれいですね', question_draft: '元の説明を確認', start: {paragraph:7,offset:0}, end:{paragraph:7,offset:8}, createdAt:'2026-09-28T00:00:00Z' },
      { keepId: 'box-b', markerId: 'ask-fixture-2', conversationId: 'quick-action-fixture', turnId: 'fixture-turn-25', turnNumber: 25, sourceText: '月がきれいですね', question_draft: 'なぜこの方式なのか確認', start: {paragraph:9,offset:0}, end:{paragraph:9,offset:8}, createdAt:'2026-09-28T00:01:00Z', sourceTurnText: questionBoxHandoffSource, markerStartOffset: questionBoxHandoffMarkerStart, markerEndOffset: questionBoxHandoffMarkerStart + '月がきれいですね'.length },
      { keepId: 'box-d', markerId: 'box-marker-d', conversationId: 'question-box-b', turnId: 'box-b-turn-8', turnNumber: 8, sourceText: questionBoxHandoffPrerequisiteMarker, question_draft: 'なぜ一次精度になるのですか？', start:{paragraph:0,offset:0}, end:{paragraph:0,offset:questionBoxHandoffPrerequisiteMarker.length}, createdAt:'2026-09-28T00:02:00Z', sourceTurnText: questionBoxHandoffPrerequisiteSource, markerStartOffset: questionBoxHandoffPrerequisiteStart, markerEndOffset: questionBoxHandoffPrerequisiteStart + questionBoxHandoffPrerequisiteMarker.length },
      { keepId: 'box-unresolved', markerId: 'box-marker-unresolved', conversationId: 'question-box-b', turnId: 'box-b-turn-9', turnNumber: 9, sourceText: '元のMarker本文', question_draft: '', start:{paragraph:1,offset:0}, end:{paragraph:1,offset:7}, createdAt:'2026-09-28T00:03:00Z', unresolved:true },
      ...questionBoxExtraSamples.map(([sampleConversationId, turnNumber, sourceText, questionDraft], index) => ({
        keepId: `box-sample-${index + 1}`, markerId: `box-missing-${index + 1}`,
        conversationId: sampleConversationId, turnId: `${sampleConversationId}-turn-${turnNumber}`,
        turnNumber, sourceText, question_draft: questionDraft,
        start: {paragraph:index, offset:0}, end:{paragraph:index, offset:sourceText.length},
        createdAt: `2026-09-28T00:${String(index + 5).padStart(2, '0')}:00Z`, unresolved:true,
      })),
    ];
    // Seed historical examples below any Keeps already created by the user.
    setDeferredQuestions(current => [...seeds.filter(seed => !current.some(k => k.keepId === seed.keepId)), ...current]);
  }
  function chooseConversation(id: string) {
    close(true); setReturnTarget(null); setReturnNotice(''); setConversationId(id);
  }
  function returnToSource(keep: LabQuestionKeep) {
    close(true);
    setConversationId(keep.conversationId); setLeftTab('chat');
    setReturnTarget(current => ({keep, request: (current?.request ?? 0) + 1}));
  }
  useEffect(() => {
    if (!returnTarget || returnTarget.keep.conversationId !== conversationId) return;
    const keep = returnTarget.keep;
    const conversation = Array.from(conversationsRef.current?.querySelectorAll<HTMLElement>('[data-box-conversation]') ?? []).find(el => el.dataset.boxConversation === conversationId);
    const turns = Array.from(conversation?.querySelectorAll<HTMLElement>('[data-box-turn]') ?? []).filter(el => el.dataset.boxTurn === keep.turnId);
    if (!turns.length) { setReturnNotice('元Turnを確認できません'); return; }
    const stored = markers.find(m => m.marker_id === keep.markerId);
    const anchorMatches = conversationId === 'question-box-b'
      ? keep.markerId === 'box-marker-d' && keep.turnId === 'box-b-turn-8'
      : !!stored && stored.selected_text === keep.sourceText && stored.start.paragraph === keep.start.paragraph && stored.start.offset === keep.start.offset && stored.end.paragraph === keep.end.paragraph && stored.end.offset === keep.end.offset;
    const markerElement = !keep.unresolved && anchorMatches
      ? turns.flatMap(turn => Array.from(turn.querySelectorAll<HTMLElement>('[data-quick-marker]'))).find(el => el.dataset.quickMarker === keep.markerId)
      : undefined;
    const target = markerElement ?? turns[0];
    target.scrollIntoView?.({block:'center', behavior:'auto'});
    target.focus({preventScroll:true});
    target.classList.add(markerElement ? 'question-box-marker-pulse' : 'question-box-turn-pulse');
    setReturnNotice(markerElement ? `T${keep.turnNumber} の元Markerへ戻りました` : `T${keep.turnNumber} へ戻りました。Marker位置を確認できません`);
    const clear = () => target.classList.remove('question-box-marker-pulse', 'question-box-turn-pulse');
    const timer = window.setTimeout(clear, 1800);
    return () => { window.clearTimeout(timer); clear(); };
  }, [returnTarget, conversationId]);
  function selected() {
    const root = rootRef.current, selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const start = paragraphPoint(root, range.startContainer, range.startOffset);
    const end = paragraphPoint(root, range.endContainer, range.endOffset);
    const selectedText = range.toString();
    if (!start || !end || !selectedText.trim()) return;
    close();
    rangeRef.current = range.cloneRange();
    setDraft({ start, end, selectedText }); place(range);
    setMessage(markers.some(marker => overlaps({start,end}, marker))
      ? '既存Markerと重複しています。右▷からQuick Menuを開けます。'
      : `${selectedText.length}文字を選択中。色でMarker、右▷でQuick Menuを開きます。`);
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
  function addQuickMemo() {
    const text = draft?.selectedText ?? marker?.selected_text;
    if (!text?.trim()) return;
    setQuickMemos(current => [...current, { id: crypto.randomUUID(), text, turnId: sourceTurnId, createdAt: new Date().toISOString() }]);
    close(true);
    setMessage('Quick Memoへ追加しました。');
  }
  function lookupDictionary() {
    const text = draft?.selectedText ?? marker?.selected_text;
    if (text === undefined) return;
    close(true);
    void dictionarySearch.search(text);
    setMessage('Dictionaryを右Sidebarに表示します。');
  }
  function update(values: Partial<Pick<QuickMarker, 'color' | 'memo' | 'attention'>>) {
    setMarkers(current => current.map(item => item.marker_id === editing ? {...item,...values} : item));
  }
  useEffect(() => {
    if (!editing) return;
    const timer = window.setTimeout(() => place(), 0);
    return () => window.clearTimeout(timer);
  }, [editing, marker?.memo, marker?.attention, variant, panel, preparation]);
  useEffect(() => {
    if (!draft) return;
    const timer = window.setTimeout(() => place(), 0);
    return () => window.clearTimeout(timer);
  }, [draft, variant, panel, preparation]);
  useLayoutEffect(() => {
    if (panel !== 'quick' || !paletteRef.current || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    setMenuPosition(quickMenuPosition(paletteRef.current.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, { width: rect.width, height: rect.height }));
  }, [panel, position]);
  useEffect(() => {
    if (!draft && !editing) return;
    const outside = (event: PointerEvent) => { if (!paletteRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) close(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { close(); setMessage('パレットを閉じました。'); } };
    const reposition = () => place();
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', key);
    window.addEventListener('scroll', reposition, true); window.addEventListener('resize', reposition);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition); };
  }, [draft, editing, variant, panel, preparation]);

  return <div className={`quick-action-prototype quick-variant-${variant}`} aria-label="Marker Quick Action Prototype" data-ui-variant={variant}>
    <fieldset className="quick-variant-picker">
      <legend>UI Variant</legend>
      {variants.map(item => <label key={item.id}>
        <input type="radio" name="quick-ui-variant" value={item.id} checked={variant === item.id} onChange={() => setVariant(item.id)} />
        <span><strong>{item.title}</strong><small>{item.note}</small></span>
      </label>)}
    </fieldset>
    <p className="quick-action-guide">本文を選択し、色でMarker、右▷でQuick Menu。Quick Memoは断片を追加、Dictionaryは英単語1語の訳を右Sidebarに表示します。左▽は今すぐ質問・後で質問とMarker操作です。</p>
    <button type="button" onClick={loadAskFixture}>質問受け渡しfixtureを準備（T10 C / T25 A・B）</button>
    <p role="status">{message}</p>
    <button type="button" onClick={loadQuestionBoxFixture}>質問箱fixtureを準備（6会話・20件）</button>
    <div className="question-box-layout">
    <QuestionBoxSidebar tab={leftTab} onTab={setLeftTab} conversationId={conversationId} onConversation={chooseConversation} keeps={deferredQuestions} onReturn={returnToSource} notice={returnNotice} />
    <div ref={conversationsRef} className="question-box-content">
    <div data-box-conversation="quick-action-fixture" hidden={conversationId !== 'quick-action-fixture'}>
    <h3>Conversation A</h3>
    <div className="quick-reading-layout">
    <div className="quick-reading-main">
    <div className="quick-action-document" ref={rootRef} onMouseUp={selected} aria-label="試験用Assistant本文">
      <section data-box-turn="fixture-turn-1" tabIndex={-1}>{paragraphs.map((text, index) => <p key={index} data-quick-paragraph={index}>{renderParagraph(text, index, markers, open, annotated)}</p>)}</section>
      {handoffTurns.map((turnNumber, index) => <section key={index} data-box-turn={`fixture-turn-${turnNumber}`} tabIndex={-1}><h3>T{turnNumber} · Assistant · Marker {index === 0 ? 'C（過去）' : index === 1 ? 'A' : 'B'}</h3><p data-quick-paragraph={paragraphs.length + index}>{renderParagraph('月がきれいですね', paragraphs.length + index, markers, open, annotated)}</p></section>)}
    </div>
    <section className="ask-chat-fixture" aria-label="Lab Chat入力"><h3>Chat入力（Lab・送信なし）</h3>
      {immediateQuestions.length > 0 && <div className="ask-questions" aria-label="回答への再質問"><strong>回答への再質問</strong>
        {immediateQuestions.map(item => <div className="ask-question" key={item.markerId}>
          <span>T{item.turnNumber}</span> <q>{item.sourceText}</q>
          <input aria-label={`再質問 ${item.markerId}`} value={item.questionText} onChange={event => {setImmediateQuestions(current => current.map(q => q.markerId === item.markerId ? {...q, questionText: event.target.value} : q));setSendPreview(null);}} />
          <button type="button" aria-label={`再質問を削除 ${item.markerId}`} onClick={() => {setImmediateQuestions(current => current.filter(q => q.markerId !== item.markerId));setSendPreview(null);}}>×</button>
        </div>)}
      </div>}
      <label>チャット本文<textarea ref={chatInputRef} aria-label="Lab Chat draft" value={mainDraft} onChange={event => {setMainDraft(event.target.value);setSendPreview(null);}} /></label>
      <button type="button" disabled={!mainDraft.trim() && !immediateQuestions.length} onClick={() => setSendPreview([
        immediateQuestions.length ? '## 回答への再質問\n\n' + immediateQuestions.map(item => `・「${item.sourceText}」\n  ${item.questionText}`).join('\n\n') : '',
        mainDraft.trim() ? '## メッセージ\n\n' + mainDraft : ''
      ].filter(Boolean).join('\n\n'))}>送信Preview</button>
      <small>Lab検証用。AI送信・保存は行いません。</small>
      {sendPreview !== null && <pre aria-label="送信Preview結果">{sendPreview}</pre>}
    </section>
    {(draft || marker) && <div ref={paletteRef} role={panel === 'detail' ? 'dialog' : undefined} aria-label={panel === 'detail' ? 'Marker Detail Popup' : undefined}
      className={`quick-floating ${panel === 'detail' ? 'quick-floating-expanded' : 'quick-floating-compact'} quick-floating-${position.placement}`} style={{left:position.left,top:position.top}}>
      <SignalHeader selected={marker?.color} markerReady={!!marker} markerAllowed={!draft || !markers.some(item => overlaps(draft, item))} panel={panel}
        colorAction={marker ? color => update({color}) : create}
        openDetail={() => { if (marker) setPanel(current => current === 'detail' ? 'none' : 'detail'); }}
        openQuick={() => setPanel(current => current === 'quick' ? 'none' : 'quick')} />
      {panel === 'detail' && marker && <div className="quick-detail-body">
        <blockquote>{marker.selected_text}</blockquote>
        <div className="ask-choice" role="group" aria-label="質問のタイミング">
          <button type="button" disabled={!canAsk(marker)} aria-pressed={preparation?.mode === 'immediate'} onClick={() => prepareAsk('immediate')}>今すぐ質問</button>
          <button type="button" aria-pressed={preparation?.mode === 'deferred'} onClick={() => prepareAsk('deferred')}>後で質問</button>
        </div>
        {!canAsk(marker) && <small>今すぐ質問は直前の回答のみ利用できます。過去のMarkerは「後で質問」を使用します。</small>}
        {preparation && <div className="ask-preparation" aria-label="質問準備">
          <div>{[['質問', '質問です。 '], ['しかし…', 'ただ、疑問が残ります。 '], ['意見', '私の考えでは、']].map(([label, prefix]) => <button key={label} type="button" onClick={() => setPreparation(current => current ? {...current, draftText: current.draftText + prefix} : null)}>{label}</button>)}</div>
          <label>短い質問<input aria-label="短い質問" value={preparation.draftText} onChange={event => setPreparation({...preparation, draftText: event.target.value})} /></label>
          <button type="button" onClick={handoff}>確定</button>
        </div>}
        <details><summary>既存Markerメモ（試験用）</summary><label>参考メモ<AutoGrowTextarea label="参考メモ" rows={3} minHeight={72} maxHeight={176} value={marker.memo} update={memo => update({memo})}/></label>
        <label>Attention<AutoGrowTextarea label="Attention" rows={4} minHeight={94} maxHeight={202} value={marker.attention} update={attention => update({attention})}/></label></details>
        <button className="quick-delete-marker" type="button" onClick={() => {setMarkers(current => current.filter(item => item.marker_id !== editing)); setDeferredQuestions(current => current.filter(item => item.markerId !== editing)); close(true); setMessage('Markerを削除しました');}}>Markerを削除</button>
      </div>}
    </div>}
    {(draft || marker) && panel === 'quick' && <div ref={menuRef} role="group" aria-label="Quick Menu" className="quick-direction-menu" data-side={menuPosition.side}
      style={{left:menuPosition.left,top:menuPosition.top}}>
      {quickItems.map(item => <button key={item} type="button" onPointerDown={event => event.preventDefault()} onClick={item === 'Quick Memo' ? addQuickMemo : lookupDictionary}>{item}</button>)}
    </div>}
    <section className="quick-action-created" aria-label="作成済みPrototype Marker"><h3>作成済みMarker</h3>
      {markers.length === 0 ? <p>まだありません。</p> : <ol>{markers.map(marker => <li key={marker.marker_id}><span className={`quick-created-swatch quick-color-${marker.color}`} />{marker.color}: {marker.selected_text}</li>)}</ol>}
    </section>
    </div>
    <div className="quick-sidebar">
      {dictionaryResult && <DictionaryPanel result={dictionaryResult} />}
      <QuickMemoPanel items={quickMemos} />
    </div>
    </div>
    </div>
    {conversationId === 'question-box-b' && <section data-box-conversation="question-box-b" aria-label="Conversation B本文">
      <h3>Conversation B</h3>
      <article data-box-turn="box-b-turn-8" tabIndex={-1}><h4>T8 · Assistant</h4><p>別の会話でも同じ文章が登場します。</p>
        <mark tabIndex={-1} data-quick-marker="box-marker-d" data-question-info={annotated.has('box-marker-d') ? 'true' : undefined} className="quick-mark quick-mark-green">{questionBoxHandoffPrerequisiteMarker}</mark>
      </article>
      <article data-box-turn="box-b-turn-9" tabIndex={-1}><h4>T9 · Assistant</h4><p>Markerの原文を解決できないfixtureです。同じ文章「月がきれいですね」があっても自動で結び付けません。</p></article>
      <small>Conversation Bは元位置復帰専用のread-only fixtureです。</small>
    </section>}
    {conversationId === 'question-box-c' && <section data-box-conversation="question-box-c"><h3>Conversation C</h3><article data-box-turn="box-c-turn-1" tabIndex={-1}><h4>T1 · Assistant</h4><p>比較条件を確認する。元Marker位置が未解決の一覧試験用fixtureです。</p></article></section>}
    {(['question-box-d','question-box-e','question-box-f'] as const).map(sampleConversationId => conversationId === sampleConversationId && <section key={sampleConversationId} data-box-conversation={sampleConversationId}>
      <h3>Conversation {sampleConversationId.slice(-1).toUpperCase()}</h3>
      {questionBoxExtraSamples.filter(([id]) => id === sampleConversationId).map(([, turnNumber, sourceText]) => <article key={turnNumber} data-box-turn={`${sampleConversationId}-turn-${turnNumber}`} tabIndex={-1}><h4>T{turnNumber} · Assistant</h4><p>{sourceText}。元Marker位置が未解決の一覧試験用fixtureです。</p></article>)}
    </section>)}
    {conversationId === 'question-box-empty' && <section><h3>Conversation G（Keepなし）</h3><p>質問箱には表示されない会話の試験用fixtureです。</p></section>}
    </div>
    </div>
  </div>;
}
