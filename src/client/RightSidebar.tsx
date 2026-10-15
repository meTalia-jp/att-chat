import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { QuickMemoDocument } from '../shared/quick-memo.ts';
import { api } from './api.ts';
import { quickDictionaryService, type QuickDictionaryResult, type QuickDictionaryService } from './quick-dictionary.ts';

export interface QuickMemoService {
  load(): Promise<QuickMemoDocument>;
  append(text: string): Promise<QuickMemoDocument>;
}

const productionQuickMemoService: QuickMemoService = {
  load: () => api<QuickMemoDocument>('/api/quick-memo'),
  append: text => api<QuickMemoDocument>('/api/quick-memo', { text }),
};

const dictionaryMessages: Record<Exclude<QuickDictionaryResult['status'], 'found'>, string> = {
  loading: '辞書を読み込んでいます…',
  'not-found': '見つかりませんでした',
  invalid: '英単語を1語選択してください',
  'missing-asset': '辞書データが未配置です。',
  unavailable: '辞書を読み込めませんでした',
};

export type RightSidebarController = {
  openDictionary: (text: string) => Promise<void>;
  addMemo: (text: string) => Promise<void>;
};

export const RightSidebar = forwardRef<RightSidebarController, {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExplicitOpenChange?: (open: boolean) => void;
  onMiniMapHost: (host: HTMLDivElement | null) => void;
  service?: QuickDictionaryService;
  memoService?: QuickMemoService;
}>(function RightSidebar({ open, onOpenChange, onExplicitOpenChange = onOpenChange, onMiniMapHost, service = quickDictionaryService, memoService = productionQuickMemoService }, ref) {
  const [tab, setTab] = useState<'dictionary' | 'memo'>('dictionary');
  const [input, setInput] = useState('');
  const [result, setResult] = useState<QuickDictionaryResult | null>(null);
  const [memoDocument, setMemoDocument] = useState<QuickMemoDocument>({ markdown:'', items:[] });
  const [memoError, setMemoError] = useState('');
  const request = useRef(0);
  useEffect(() => () => { request.current += 1; }, []);
  useEffect(() => {
    let disposed = false;
    void memoService.load().then(value => { if (!disposed) { setMemoDocument(value); setMemoError(''); } }).catch(() => { if (!disposed) setMemoError('Quickメモを読み込めませんでした'); });
    return () => { disposed = true; };
  }, [memoService]);
  async function searchText(value: string) {
    const current = ++request.current;
    const normalized = value.trim();
    setTab('dictionary');
    setResult({ word: normalized.toLowerCase(), meaning: '', source: 'EJDict-hand', status: 'loading' });
    const next = await service.lookup(normalized);
    if (current === request.current) setResult(next);
    return next;
  }
  useImperativeHandle(ref, () => ({
    async openDictionary(text: string) {
      setInput(text); setTab('dictionary'); onOpenChange(true);
      const result = await searchText(text);
      if (result.status === 'invalid' || result.status === 'missing-asset' || result.status === 'unavailable') throw new Error(dictionaryMessages[result.status]);
    },
    async addMemo(text: string) {
      setTab('memo'); onOpenChange(true); setMemoError('');
      try { setMemoDocument(await memoService.append(text)); setInput(''); }
      catch (error) { setMemoError(error instanceof Error ? error.message : 'Quickメモを保存できませんでした'); throw error; }
    },
  }), [onOpenChange, service, memoService]);
  async function addMemo() {
    const text = input.trim();
    if (!text) return;
    setMemoError('');
    try { setMemoDocument(await memoService.append(text)); setInput(''); }
    catch (error) { setMemoError(error instanceof Error ? error.message : 'Quickメモを保存できませんでした'); }
  }
  return <aside className={`right-sidebar${open ? '' : ' right-sidebar-collapsed'}`} aria-label="右Sidebar">
    <button type="button" className="right-sidebar-toggle" aria-expanded={open} aria-label={open ? '右Sidebarを閉じる' : '右Sidebarを開く'} onClick={() => onExplicitOpenChange(!open)}>{open ? '›' : '‹'}</button>
    <div className="right-sidebar-content" hidden={!open}>
      <section className="quick-tools" aria-label="クイックツール">
        <div role="tablist" aria-label="クイックツール切替"><button type="button" role="tab" aria-selected={tab === 'dictionary'} onClick={() => setTab('dictionary')}>Quick辞書</button><button type="button" role="tab" aria-selected={tab === 'memo'} onClick={() => setTab('memo')}>Quickメモ</button></div>
        <div className="quick-tool-input"><input aria-label="クイックツール入力" value={input} placeholder="英単語またはメモを入力" onChange={event => setInput(event.target.value)} /><button type="button" onClick={() => tab === 'dictionary' ? void searchText(input) : void addMemo()} disabled={!input.trim()}>{tab === 'dictionary' ? '検索' : '追加'}</button></div>
        <div className="quick-tool-body" role="tabpanel" hidden={tab !== 'dictionary'}>
          {!result ? <p className="quick-tool-empty">ASCII英単語1語を検索します。</p> : result.status === 'found' ? <><strong>{result.word}</strong><p>{result.meaning}</p></> : <><p>{dictionaryMessages[result.status]}</p>{result.status === 'missing-asset' && <><code>public/dictionaries/ejdict-hand/ejdict.json</code><p><a href="https://kujirahand.com/web-tools/EJDictFreeDL.php" target="_blank" rel="noreferrer">取得元を確認</a></p></>}</>}
          <small>出典: <a href="https://github.com/kujirahand/EJDict" target="_blank" rel="noreferrer">EJDict-hand</a></small>
        </div>
        <div className="quick-tool-body quick-memo-body" role="tabpanel" hidden={tab !== 'memo'}>{memoError && <p className="quick-tool-error" role="alert">{memoError}</p>}{memoDocument.items.length ? <ul>{memoDocument.items.map((text,index) => <li key={`${index}:${text}`}>{text}</li>)}</ul> : <p className="quick-tool-empty">選択した断片をMarkdown箇条書きとして保存します。</p>}</div>
      </section>
      <section className="right-minimap-shell" aria-label="Turn miniMAP"><div ref={onMiniMapHost} className="right-minimap-host" /></section>
    </div>
  </aside>;
});
