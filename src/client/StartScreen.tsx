import type { Conversation } from '../shared/contracts.ts';
import { SYSTEM_PROFILE_PRESET_OPTIONS, type SystemProfilePreset } from '../shared/system-profile-presets.ts';
import { USER_PROFILE_PRESET_OPTIONS, type UserProfilePreset } from '../shared/user-profile-presets.ts';
import { modelConnectionLabels, type ModelConnectionStatus } from '../shared/model-connection.ts';

function profileLabel<T extends string>(options: ReadonlyArray<{ preset: T; label: string }>, preset: T) {
  return options.find(option => option.preset === preset)?.label ?? 'カスタム';
}

export function StartScreen({ conversations, model, connection, systemProfile, userProfile, disabled, onNewChat, onOpenConversation, onOpenModelSettings, onOpenSettings }: {
  conversations: readonly Conversation[];
  model: string;
  connection: ModelConnectionStatus;
  systemProfile: SystemProfilePreset;
  userProfile: UserProfilePreset;
  disabled?: boolean;
  onNewChat: () => void;
  onOpenConversation: (conversationId: string) => void;
  onOpenModelSettings: () => void;
  onOpenSettings: () => void;
}) {
  const recent = [...conversations].sort((left, right) => right.updated_at.localeCompare(left.updated_at)).slice(0, 5);
  const latest = recent[0];
  return <main className="start-screen" aria-label="Att-Chat スタート画面">
    <header><p className="start-screen-kicker">会話ワークスペース</p><h1>Att-Chat</h1><p>モデルと現在のプロファイルを確認して、会話を始めます。</p></header>
    <div className="start-screen-grid">
      <section className="start-card start-model" aria-label="スタート画面のモデル">
        <header><h2>モデル</h2><span className={`connection-state connection-${connection}`}>{modelConnectionLabels[connection]}</span></header>
        <strong>{model || 'モデル未選択'}</strong>
        {connection === 'unavailable' && <p>前回モデルは現在利用できません。</p>}
        <button type="button" disabled={disabled} onClick={onOpenModelSettings}>{model ? 'モデル変更' : 'モデルを選択'}</button>
      </section>
      <section className="start-card start-profiles" aria-label="現在のプロファイル">
        <h2>現在のプロファイル</h2>
        <dl><dt>System Profile</dt><dd>{profileLabel(SYSTEM_PROFILE_PRESET_OPTIONS, systemProfile)}</dd><dt>User Profile</dt><dd>{profileLabel(USER_PROFILE_PRESET_OPTIONS, userProfile)}</dd></dl>
        <p>変更は「設定」から行えます。</p>
      </section>
      <section className="start-card start-actions" aria-label="会話を開始">
        <h2>開始</h2>
        <button type="button" className="primary" disabled={disabled} onClick={onNewChat}>新規チャット</button>
        <button type="button" disabled={disabled || !latest} onClick={() => latest && onOpenConversation(latest.conversation_id)}>最後の会話を開く</button>
        {!latest && <p>保存済みの会話はありません。</p>}
      </section>
      <section className="start-card start-recents" aria-label="最近の会話">
        <h2>最近の会話</h2>
        {recent.length ? <ul>{recent.map(item => <li key={item.conversation_id}><button type="button" disabled={disabled} onClick={() => onOpenConversation(item.conversation_id)}><span>{item.title}</span><small>{item.updated_at.slice(0, 10)}</small></button></li>)}</ul> : <p>最近の会話はまだありません。</p>}
      </section>
    </div>
    <footer><button type="button" disabled={disabled} onClick={onOpenSettings}>設定</button><small>適用したProfile設定は次回起動時にも復元します。</small></footer>
  </main>;
}
