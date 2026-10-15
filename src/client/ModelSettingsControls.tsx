import {
  lmStudioSimpleBaseUrl,
  modelConnectionLabels,
  type ModelConnectionChoice,
  type ModelConnectionMode,
  type ModelConnectionStatus,
} from '../shared/model-connection.ts';

export function ModelSettingsControls({
  models,
  model,
  busy,
  error,
  connectionMode = 'lm_studio_simple',
  appliedMode = 'lm_studio_simple',
  draftBaseUrl = lmStudioSimpleBaseUrl,
  appliedBaseUrl = lmStudioSimpleBaseUrl,
  connectionStatus = 'unselected',
  onConnectionModeChange = () => {},
  onDraftBaseUrlChange = () => {},
  onCheckConnection = () => {},
  onModelChange,
  onRefresh,
}: {
  models: readonly string[];
  model: string;
  busy: boolean;
  error?: string;
  connectionMode?: ModelConnectionChoice;
  appliedMode?: ModelConnectionMode;
  draftBaseUrl?: string;
  appliedBaseUrl?: string;
  connectionStatus?: ModelConnectionStatus;
  onConnectionModeChange?: (mode: ModelConnectionChoice) => void;
  onDraftBaseUrlChange?: (url: string) => void;
  onCheckConnection?: () => void | Promise<void>;
  onModelChange: (model: string) => void;
  onRefresh: () => void;
}) {
  const openAi = connectionMode === 'openai';
  return <div className="model-settings-controls">
    <label>接続方式<select aria-label="接続方式" value={connectionMode} disabled={busy} onChange={event => onConnectionModeChange(event.target.value as ModelConnectionChoice)}>
      <option value="lm_studio_simple">LM Studio 簡単設定</option>
      <option value="lm_studio_advanced">LM Studio 詳細設定</option>
      <option value="openai" disabled>OpenAI API（未対応）</option>
    </select></label>
    <p className={`model-connection-state connection-${connectionStatus}`}><strong>接続状態</strong> {modelConnectionLabels[connectionStatus]}</p>
    {connectionMode === 'lm_studio_advanced' && <section className="model-advanced-settings" aria-label="LM Studio 詳細設定">
      <label>Base URL<input aria-label="LM Studio Base URL" value={draftBaseUrl} disabled={busy} spellCheck={false} onChange={event => onDraftBaseUrlChange(event.target.value)} /></label>
      <button type="button" disabled={busy || !draftBaseUrl.trim()} onClick={() => void onCheckConnection()}>接続確認</button>
      <small>適用中: {appliedMode === 'lm_studio_simple' ? 'LM Studio 簡単設定' : appliedBaseUrl}</small>
    </section>}
    {openAi ? <section className="model-unsupported" aria-label="OpenAI API 未対応"><strong>OpenAI API</strong><p>未対応</p><small>APIキーを安全に保存・管理する仕組みを導入するまで利用できません。</small></section> : <>
      <button type="button" disabled={busy} onClick={onRefresh}>モデル一覧更新</button>
      <label>モデル<select aria-label="モデル" value={model} disabled={busy} onChange={event => onModelChange(event.target.value)}><option value="">モデルを選択</option>{models.map(item => <option key={item}>{item}</option>)}</select></label>
      {error && <p role="alert">{error}</p>}
      {!error && !models.length && <p>Serverには接続できましたが、利用可能なモデルがありません。</p>}
    </>}
  </div>;
}
