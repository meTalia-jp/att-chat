import { useEffect, useLayoutEffect, useRef } from 'react';

export type QuickMemoItem = {
  id: string;
  text: string;
  turnId?: string;
  createdAt?: string;
};

export function QuickMemoPanel({ items }: { items: readonly QuickMemoItem[] }) {
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  function fitViewport() {
    const panel = panelRef.current;
    if (panel) panel.style.setProperty('--quick-memo-available-height', `${Math.max(140, window.innerHeight - Math.max(16, panel.getBoundingClientRect().top) - 16)}px`);
  }
  useLayoutEffect(fitViewport);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [items.length]);
  useEffect(() => {
    window.addEventListener('scroll', fitViewport, true);
    window.addEventListener('resize', fitViewport);
    return () => {
      window.removeEventListener('scroll', fitViewport, true);
      window.removeEventListener('resize', fitViewport);
    };
  }, []);

  return <aside ref={panelRef} className="quick-memo-panel" aria-label="Quick Memo">
    <header><h3>Quick Memo</h3><span>{items.length}件</span></header>
    <p className="quick-memo-hint">あとで見る断片。再読み込みで消えます。</p>
    <div ref={listRef} className="quick-memo-scroll" tabIndex={0} role="region" aria-label="Quick Memo項目">
      {items.length === 0 ? <p className="quick-memo-empty">本文を選択 → 右▷ → Quick Memoで追加</p>
        : <ul>{items.map(item => <li key={item.id}>{item.text}</li>)}</ul>}
    </div>
  </aside>;
}
