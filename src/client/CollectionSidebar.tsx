import { useEffect, useRef, useState } from 'react';
import type { Conversation } from '../shared/contracts.ts';
import { groupConversations, type CollectionResult } from '../shared/collections.ts';
import { apiRequest } from './api.ts';

function NameEditor({ initial = '', disabled, save, cancel }: { initial?: string; disabled: boolean; save: (name: string) => void; cancel: () => void }) {
  const [value, setValue] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  return <form className="collection-name-editor" onSubmit={event => { event.preventDefault(); if (!disabled && value.trim()) save(value.trim()); }}>
    <input ref={input} aria-label="コレクション名" value={value} maxLength={200} disabled={disabled} onChange={event => setValue(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && !disabled) { event.preventDefault(); cancel(); } }} />
    <button disabled={disabled || !value.trim()}>保存</button><button type="button" disabled={disabled} onClick={cancel}>取消</button>
  </form>;
}

export function CollectionSidebar({ conversations, currentId, result, disabled = false, onChange, onOpen }: {
  conversations: readonly Conversation[]; currentId?: string; result: CollectionResult; disabled?: boolean;
  onChange: (result: CollectionResult) => void; onOpen: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const locked = useRef(false);
  const busy = disabled || saving, editDisabled = busy || !result.writable;
  const { groups, unclassified } = groupConversations(conversations, result.data);
  const selectedCollection = currentId && Object.hasOwn(result.data.membership, currentId) ? result.data.membership[currentId] : undefined;
  useEffect(() => { if (selectedCollection) setExpanded(previous => new Set([...previous, selectedCollection])); }, [currentId, selectedCollection]);
  async function mutate(path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', data: unknown = {}) {
    if (locked.current || editDisabled) return;
    locked.current = true; setSaving(true); setError('');
    try {
      const next = await apiRequest<CollectionResult>(path, method, data);
      onChange(next); setEditor(null); setMenu(null); setMoving(null); setDeleting(null);
    } catch (reason) { setError(`${(reason as Error).message} 入力は保持しています。保存結果が不明な場合は再読込してください。`); }
    finally { locked.current = false; setSaving(false); }
  }
  const row = (conversation: Conversation, collectionId?: string) => <li key={conversation.conversation_id}>
    <div className="collection-row"><button className="collection-title" title={conversation.title} disabled={busy} aria-current={currentId === conversation.conversation_id ? 'true' : undefined} onClick={() => onOpen(conversation.conversation_id)}>{conversation.title}</button>
      <button type="button" className="collection-more" aria-label={`${conversation.title}の操作`} aria-expanded={menu === `conversation:${conversation.conversation_id}`} disabled={editDisabled} onClick={() => { setMenu(menu === `conversation:${conversation.conversation_id}` ? null : `conversation:${conversation.conversation_id}`); setMoving(null); }}>⋯</button></div>
    {menu === `conversation:${conversation.conversation_id}` && <div className="collection-actions">
      <button disabled={editDisabled || !result.data.collections.length} onClick={() => setMoving(conversation.conversation_id)}>コレクションへ移動</button>
      {moving === conversation.conversation_id && <label>移動先<select aria-label="移動先コレクション" value="" disabled={editDisabled} onChange={event => { if (event.target.value) void mutate(`/api/collections/${event.target.value}/conversations/${conversation.conversation_id}`, 'PUT'); }}><option value="">選択してください</option>{result.data.collections.filter(c => c.id !== collectionId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
      {collectionId && <button disabled={editDisabled} onClick={() => void mutate(`/api/collections/${collectionId}/conversations/${conversation.conversation_id}`, 'DELETE')}>コレクションから外す</button>}
    </div>}
  </li>;
  return <div className="collection-browser">
    {result.warnings.map(warning => <p role="status" className="collection-warning" key={warning}>{warning}</p>)}
    {error && <p role="alert" className="collection-warning">{error}</p>}
    <h3>未分類</h3><ul aria-label="未分類の会話">{unclassified.map(c => row(c))}</ul>
    <div className="collection-section-heading"><h3>コレクション</h3><button aria-label="コレクションを作成" disabled={editDisabled} onClick={() => { setEditor('new'); setMenu(null); }}>＋</button></div>
    {editor === 'new' && <NameEditor disabled={editDisabled} save={name => void mutate('/api/collections', 'POST', { name })} cancel={() => setEditor(null)} />}
    <ul aria-label="コレクション一覧">{result.data.collections.map(collection => <li key={collection.id}>
      <div className="collection-row"><button className="collection-title" title={collection.name} aria-expanded={expanded.has(collection.id)} onClick={() => setExpanded(previous => { const next = new Set(previous); if (next.has(collection.id)) next.delete(collection.id); else next.add(collection.id); return next; })}>{expanded.has(collection.id) ? '▾' : '▸'} {collection.name}</button>
        <button className="collection-more" aria-label={`${collection.name}のコレクション操作`} aria-expanded={menu === `collection:${collection.id}`} disabled={editDisabled} onClick={() => setMenu(menu === `collection:${collection.id}` ? null : `collection:${collection.id}`)}>⋯</button></div>
      {menu === `collection:${collection.id}` && <div className="collection-actions"><button disabled={editDisabled} onClick={() => { setEditor(collection.id); setMenu(null); }}>名前変更</button><button disabled={editDisabled} onClick={() => { setDeleting(collection.id); setMenu(null); }}>コレクションを削除</button></div>}
      {editor === collection.id && <NameEditor key={collection.id} initial={collection.name} disabled={editDisabled} save={name => void mutate(`/api/collections/${collection.id}`, 'PATCH', { name })} cancel={() => setEditor(null)} />}
      {deleting === collection.id && <div role="group" aria-label="コレクション削除の確認" className="collection-actions"><p>コレクションを削除します。<br />会話は削除されず、未分類に戻ります。</p><button disabled={editDisabled} onClick={() => void mutate(`/api/collections/${collection.id}`, 'DELETE')}>削除する</button><button disabled={busy} onClick={() => setDeleting(null)}>取消</button></div>}
      {expanded.has(collection.id) && <ul aria-label={`${collection.name}の会話`}>{groups.get(collection.id)!.map(c => row(c, collection.id))}</ul>}
    </li>)}</ul>
  </div>;
}
