import { useEffect, useMemo, useRef, useState } from 'react';
import type { GlobalQuestionKeep } from '../shared/question-keep.ts';
import { api } from './api.ts';
import { markerExcerpt } from './marker-list.ts';

export function GlobalQuestionBox({ reloadToken, disabled, onReturn, onAsk }: {
  reloadToken: number;
  disabled: boolean;
  onReturn: (item: GlobalQuestionKeep) => void | Promise<void>;
  onAsk: (item: GlobalQuestionKeep, newConversation: boolean) => void | Promise<void>;
}) {
  const [items, setItems] = useState<GlobalQuestionKeep[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [menuKeepId, setMenuKeepId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    let disposed = false;
    setLoading(true); setError(''); setMenuKeepId(null);
    void api<GlobalQuestionKeep[]>('/api/question-box').then(value => {
      if (disposed) return;
      setItems(value);
      setExpanded(new Set(value.length ? [value[0].conversation.conversation_id] : []));
    }).catch(reason => { if (!disposed) setError((reason as Error).message); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [reloadToken]);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && !root.current?.contains(target)) setMenuKeepId(null);
      else if ((event.target as Element | null)?.closest?.('[data-global-question-actions]') === null) setMenuKeepId(null);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuKeepId(null); };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, []);

  const groups = useMemo(() => {
    const result: Array<{ conversation: GlobalQuestionKeep['conversation']; items: GlobalQuestionKeep[] }> = [];
    const indexes = new Map<string, number>();
    for (const item of items) {
      let index = indexes.get(item.conversation.conversation_id);
      if (index === undefined) {
        index = result.length; indexes.set(item.conversation.conversation_id, index);
        result.push({ conversation: item.conversation, items: [] });
      }
      result[index].items.push(item);
    }
    return result;
  }, [items]);

  function toggleGroup(conversationId: string) {
    setMenuKeepId(null);
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(conversationId)) next.delete(conversationId); else next.add(conversationId);
      return next;
    });
  }

  return <section ref={root} className="global-question-box" aria-label="質問箱">
    <header><div><h2>質問箱</h2><small>疑問が生まれた場所</small></div><button type="button" disabled={disabled || !groups.length} onClick={() => { setExpanded(new Set()); setMenuKeepId(null); }}>すべて閉じる</button></header>
    {loading && <p role="status">質問箱を読み込んでいます…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && !groups.length && <p>保存されたQuestion Keepはありません。</p>}
    {groups.map(group => {
      const isOpen = expanded.has(group.conversation.conversation_id);
      return <section className="global-question-group" key={group.conversation.conversation_id}>
        <button type="button" className="global-question-group-toggle" aria-expanded={isOpen} disabled={disabled} onClick={() => toggleGroup(group.conversation.conversation_id)}><span>{isOpen ? '▼' : '▶'} {group.conversation.title}</span><small>{group.items.length}件</small></button>
        {isOpen && <ul>{group.items.map(item => {
          const excerpt = markerExcerpt(item.highlight.target_text).text;
          const canAsk = item.keep.status !== 'dismissed' && item.highlight.status === 'resolved';
          return <li key={item.keep.keep_id}>
            <div className="global-question-item-heading"><strong>T{item.source_turn.sequence_no + 1}</strong><span><button type="button" className="global-question-return" disabled={disabled} onClick={() => void onReturn(item)}>元へ戻る</button><span className="global-question-actions" data-global-question-actions><button type="button" className="global-question-more" aria-label={`T${item.source_turn.sequence_no + 1}のその他の操作`} aria-expanded={menuKeepId === item.keep.keep_id} disabled={disabled} onClick={() => setMenuKeepId(current => current === item.keep.keep_id ? null : item.keep.keep_id)}>…</button>{menuKeepId === item.keep.keep_id && <span role="menu"><button type="button" role="menuitem" disabled={!canAsk} onClick={() => { setMenuKeepId(null); void onAsk(item, false); }}>質問する</button><button type="button" role="menuitem" disabled={!canAsk} onClick={() => { setMenuKeepId(null); void onAsk(item, true); }}>新規チャット</button></span>}</span></span></div>
            <blockquote title="Marker target_text">「{excerpt}」</blockquote>
            {item.keep.question_draft && <p>{item.keep.question_draft}</p>}
            {item.keep.memo && <small className="global-question-memo">メモ: {item.keep.memo}</small>}
            <small className="global-question-state">{item.keep.status}{item.highlight.status === 'unresolved' ? ` · Marker位置未解決${item.highlight.reason ? `（${item.highlight.reason}）` : ''}` : ''}</small>
          </li>;
        })}</ul>}
      </section>;
    })}
  </section>;
}
