import { useEffect, useRef, useState } from 'react';

export function ConversationTitle({ title, disabled = false, onSave }: {
  title: string;
  disabled?: boolean;
  onSave: (title: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);
  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  function cancel() {
    if (saving) return;
    setDraft(title);
    setEditing(false);
  }

  if (!editing) return <h2 className="conversation-title">
    <button type="button" className="conversation-title-button" title="会話名を変更" disabled={disabled} onClick={() => setEditing(true)}>{title}</button>
    <button type="button" className="conversation-title-edit-button" aria-label="会話名を編集" title="会話名を編集" disabled={disabled} onClick={() => setEditing(true)}>✎</button>
  </h2>;

  const value = draft.trim();
  return <form className="conversation-title-edit" aria-label="会話名を編集" onSubmit={event => {
    event.preventDefault();
    if (!value || disabled || saving) return;
    setSaving(true);
    void onSave(value).then(saved => { if (saved) setEditing(false); }).finally(() => setSaving(false));
  }}>
    <input ref={input} aria-label="会話名" value={draft} maxLength={200} disabled={disabled || saving} onChange={event => setDraft(event.target.value)} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); cancel(); }
    }} />
    <button type="submit" disabled={disabled || saving || !value}>{saving ? '保存中…' : '保存'}</button>
    <button type="button" disabled={disabled || saving} onClick={cancel}>キャンセル</button>
  </form>;
}
