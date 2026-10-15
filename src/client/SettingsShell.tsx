import { useEffect, useState, type ReactNode } from 'react';
import { experimentalSystemPromptMaxLength } from '../shared/system-prompt-experiment.ts';
import { SYSTEM_PROFILE_PRESET_OPTIONS, systemProfilePresetText, type SystemProfilePreset } from '../shared/system-profile-presets.ts';
import { experimentalUserProfileMaxLength } from '../shared/user-profile-experiment.ts';
import { USER_PROFILE_PRESET_OPTIONS, userProfilePresetText, type UserProfilePreset } from '../shared/user-profile-presets.ts';

export type SettingsSection = 'general' | 'model' | 'ui' | 'marker' | 'storage' | 'electron' | 'system-prompt' | 'developer';
export type DeveloperVisibility = { markerManagement: boolean; runDetails: boolean; storageTools: boolean };
export type StartupPreferences = { screen: 'start' | 'last'; reuseModel: boolean };
export type SendKeyMode = 'safe' | 'enter';
export type SystemPromptPreferences = { enabled: boolean; preset: SystemProfilePreset; text: string };
export type UserProfilePreferences = { enabled: boolean; preset: UserProfilePreset; text: string };

const sections: Array<[SettingsSection, string]> = [
  ['general', '一般'], ['model', 'モデル'], ['ui', 'UI'], ['marker', 'Marker'],
  ['storage', '保存'], ['electron', 'Electron'], ['system-prompt', 'System Prompt'], ['developer', 'Developer / Experimental'],
];

export function SettingsShell({ saving = false, open, section, onSection, onClose, developer, onDeveloper, onModelHost, startup = { screen:'start', reuseModel:true }, onStartup = () => {}, sendKeyMode = 'safe', onSendKeyMode = () => {}, systemPrompt = { enabled:false, preset:'off', text:'' }, onSystemPrompt = () => {}, userProfile = { enabled:false, preset:'off', text:'' }, onUserProfile = () => {} }: {
  saving?: boolean;
  open: boolean;
  section: SettingsSection;
  onSection: (section: SettingsSection) => void;
  onClose: () => void;
  developer: DeveloperVisibility;
  onDeveloper: (value: DeveloperVisibility) => void;
  onModelHost: (host: HTMLDivElement | null) => void;
  startup?: StartupPreferences;
  onStartup?: (value: StartupPreferences) => void;
  sendKeyMode?: SendKeyMode;
  onSendKeyMode?: (value: SendKeyMode) => void;
  systemPrompt?: SystemPromptPreferences;
  onSystemPrompt?: (value: SystemPromptPreferences) => void | Promise<void>;
  userProfile?: UserProfilePreferences;
  onUserProfile?: (value: UserProfilePreferences) => void | Promise<void>;
}) {
  const [promptPreset, setPromptPreset] = useState<SystemProfilePreset>(systemPrompt.preset ?? (systemPrompt.enabled ? 'custom' : 'off'));
  const [promptText, setPromptText] = useState(systemPrompt.text);
  const [promptApplied, setPromptApplied] = useState(false);
  const [profilePreset, setProfilePreset] = useState<UserProfilePreset>(userProfile.preset ?? (userProfile.enabled ? 'custom' : 'off'));
  const [profileText, setProfileText] = useState(userProfile.text);
  const [profileApplied, setProfileApplied] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [applying, setApplying] = useState(false);
  async function applyProfile(kind: 'system' | 'user') {
    if (applying || saving) return;
    setApplying(true); setApplyError('');
    try {
      if (kind === 'system') { setPromptApplied(false); await onSystemPrompt({enabled:promptPreset !== 'off',preset:promptPreset,text:promptPreset === 'off' ? '' : promptText}); setPromptApplied(true); }
      else { setProfileApplied(false); await onUserProfile({enabled:profilePreset !== 'off',preset:profilePreset,text:profilePreset === 'off' ? '' : profileText}); setProfileApplied(true); }
    } catch (error) { setApplyError(`設定は未保存です: ${(error as Error).message}`); }
    finally { setApplying(false); }
  }
  function selectSystemProfilePreset(preset: SystemProfilePreset) {
    setPromptPreset(preset);
    setPromptText(current => systemProfilePresetText(preset,current));
    setPromptApplied(false);
  }
  function selectProfilePreset(preset: UserProfilePreset) {
    setProfilePreset(preset);
    setProfileText(current => userProfilePresetText(preset,current));
    setProfileApplied(false);
  }
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open, onClose]);
  if (!open) return null;
  let content: ReactNode;
  if (section === 'model') content = <><h2>モデル</h2><p>通常画面で使うLM Studioモデルと接続状態を管理します。</p><div ref={onModelHost} aria-label="モデル設定" /></>;
  else if (section === 'developer') content = <><h2>Developer / Experimental</h2><p>開発確認用の表示です。通常利用時はOFFです。</p><label><input type="checkbox" checked={developer.markerManagement} onChange={event => onDeveloper({ ...developer, markerManagement: event.target.checked })} />Marker管理を表示</label><label><input type="checkbox" checked={developer.runDetails} onChange={event => onDeveloper({ ...developer, runDetails: event.target.checked })} />Run詳細を表示</label><label><input type="checkbox" checked={developer.storageTools} onChange={event => onDeveloper({ ...developer, storageTools: event.target.checked })} />保存確認用操作を表示</label><p><small>Context PreviewとHandoff Previewは該当する質問準備中だけComposerに表示されます。</small></p></>;
  else if (section === 'ui') content = <><h2>UI</h2><p>左 = チャット / 質問箱、中央 = 会話、右 = クイックツール / miniMAP。</p><fieldset className="startup-settings"><legend>送信キー</legend><label><input type="radio" name="send-key-mode" checked={sendKeyMode === 'safe'} onChange={() => onSendKeyMode('safe')} />Enterで改行 / Ctrl+Enterで送信</label><label><input type="radio" name="send-key-mode" checked={sendKeyMode === 'enter'} onChange={() => onSendKeyMode('enter')} />Enterで送信 / Shift+Enterで改行</label><small>この設定は保存され、次回起動時に復元します。macOSではCtrl+Enterに加えてCmd+Enterでも送信できます。</small></fieldset></>;
  else if (section === 'marker') content = <><h2>Marker</h2><p>Marker色と操作の詳細設定は今後ここへ整理します。</p></>;
  else if (section === 'storage') content = <><h2>保存</h2><p>保存先とDB情報の表示領域です。今回、保存設定は変更しません。</p></>;
  else if (section === 'electron') content = <><h2>Electron</h2><p>Electron runtime情報とデスクトップ固有設定の表示領域です。</p></>;
  else if (section === 'system-prompt') content = <section className="system-prompt-settings">
    <h2>System Prompt</h2><p className="experimental-label">Experimental</p>
    <section className="experimental-setting-block system-profile-settings" aria-label="System Profile設定">
      <div className="user-profile-heading"><h3>System Profile</h3><span className="experimental-label">Experimental</span></div>
      <p>回答で何を重視するかを調整します。</p>
      <fieldset className="profile-presets system-profile-presets"><legend>回答方針</legend>{SYSTEM_PROFILE_PRESET_OPTIONS.map(option => <label key={option.preset}>
        <input type="radio" name="system-profile-preset" value={option.preset} checked={promptPreset === option.preset} onChange={() => selectSystemProfilePreset(option.preset)} />
        <span><strong>{option.label}</strong><small>{option.description}</small>{option.detail && <small>{option.detail}</small>}{option.audience && <small className="profile-audience">想定ユーザー: {option.audience.join(' / ')}</small>}</span>
      </label>)}</fieldset>
      <label className="system-profile-text">モデル用System Prompt<textarea aria-label="モデル用System Prompt" rows={8} maxLength={experimentalSystemPromptMaxLength} disabled={promptPreset === 'off'} value={promptText} onChange={event => { setPromptText(event.target.value); setPromptPreset('custom'); setPromptApplied(false); }} /></label>
      <button type="button" disabled={saving || applying} onClick={() => void applyProfile('system')}>System Profileを適用</button>
      {promptApplied && <small role="status">System Profileを生成設定へ適用しました。</small>}
      <p><small>実験機能です。LM Studio側にもSystem Promptが設定されている場合、両方の指示がモデルへ影響する可能性があります。</small></p>
    </section>
    <hr />
    <section className="experimental-setting-block user-profile-settings" aria-label="User Profile設定">
      <div className="user-profile-heading"><h3>User Profile</h3><span className="experimental-label">Experimental</span></div>
      <p>User Profileは、回答の方向・粒度・用途を調整するための参考情報です。正確性を保証するものではありません。</p>
      <fieldset className="profile-presets user-profile-presets"><legend>Profile</legend>{USER_PROFILE_PRESET_OPTIONS.map(option => <label key={option.preset}>
        <input type="radio" name="user-profile-preset" value={option.preset} checked={profilePreset === option.preset} onChange={() => selectProfilePreset(option.preset)} />
        <span><strong>{option.label}</strong><small>{option.description}</small></span>
      </label>)}</fieldset>
      <label className="user-profile-text">ユーザープロフィール<textarea aria-label="ユーザープロフィール" rows={7} maxLength={experimentalUserProfileMaxLength} disabled={profilePreset === 'off'} placeholder={'例:\n・Pythonは初心者\n・数学は高校程度\n・専門用語は短い説明があれば使ってよい\n・結論を先に知りたい'} value={profileText} onChange={event => { setProfileText(event.target.value); setProfilePreset('custom'); setProfileApplied(false); }} /></label>
      <button type="button" disabled={saving || applying} onClick={() => void applyProfile('user')}>User Profileを適用</button>
      {profileApplied && <small role="status">User Profileを生成設定へ適用しました。</small>}
      <p><small>現在の質問や明示的な指示を優先し、プロフィールだけから過度に推測しないための補助Contextとして送信します。</small></p>
      <aside className="user-profile-experiment-notes" aria-label="User Profile実験メモ"><strong>実験メモ</strong><span>Preset Comparison v0.3</span><code>docs/user-profile-preset-comparison-v03.md</code><span>Practical Refinement v0.4</span><code>docs/user-profile-practical-refinement-v04.md</code></aside>
    </section>
  </section>;
  else content = <><h2>一般</h2><fieldset className="startup-settings"><legend>起動時</legend><label><input type="radio" name="startup-screen" checked={startup.screen === 'start'} onChange={() => onStartup({ ...startup, screen:'start' })} />スタート画面を表示</label><label><input type="radio" name="startup-screen" checked={startup.screen === 'last'} onChange={() => onStartup({ ...startup, screen:'last' })} />最後の会話を開く</label></fieldset><fieldset className="startup-settings"><legend>モデル</legend><label><input type="checkbox" checked={startup.reuseModel} onChange={event => onStartup({ ...startup, reuseModel:event.target.checked })} />前回のモデルを自動選択</label><small>利用不可ならモデル選択画面で確認します。設定は次回起動時にも使用します。</small></fieldset></>;
  return <div className="settings-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="settings-shell" role="dialog" aria-modal="true" aria-label="設定">
      <header><h1>設定</h1><button type="button" aria-label="設定を閉じる" onClick={onClose}>×</button></header>
      <div className="settings-layout"><nav aria-label="設定セクション">{sections.map(([id, label]) => <button type="button" key={id} aria-current={section === id ? 'page' : undefined} onClick={() => onSection(id)}>{label}</button>)}</nav><div className="settings-content">{applyError && <p role="alert">{applyError}</p>}<fieldset disabled={saving || applying} style={{border:0,padding:0,margin:0,minWidth:0}}>{content}</fieldset></div></div>
    </section>
  </div>;
}
