export const lmStudioSimpleBaseUrl = 'http://127.0.0.1:1234/v1';

export type ModelConnectionMode = 'lm_studio_simple' | 'lm_studio_advanced';
export type ModelConnectionChoice = ModelConnectionMode | 'openai';
export type ModelConnectionStatus = 'checking' | 'available' | 'unavailable' | 'unselected';

export const modelConnectionLabels: Readonly<Record<ModelConnectionStatus, string>> = {
  checking: '確認中',
  available: '● 利用可能',
  unavailable: '× 接続不可',
  unselected: '● 接続可能・モデル未選択',
};

export type AppliedModelConnection = {
  mode: ModelConnectionMode;
  applied_base_url: string;
};

export type AppliedModelConnectionResult = AppliedModelConnection & {
  models: string[];
};
