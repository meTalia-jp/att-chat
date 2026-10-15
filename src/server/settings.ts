import { readFile, stat } from 'node:fs/promises';
import { writeFileAtomically as writeSettingsAtomically } from './atomic-file.ts';
export { writeFileAtomically as writeSettingsAtomically } from './atomic-file.ts';
import { defaultSettings, settingsMaxBytes, systemPresetIds, userPresetIds, type Settings, type SettingsResult } from '../shared/settings.ts';
import { normalizeLMStudioBaseUrl } from './provider.ts';
import { lmStudioSimpleBaseUrl } from '../shared/model-connection.ts';

type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('設定はobjectで指定してください');
  return value as ObjectValue;
}
function keys(value: ObjectValue, allowed: string[], strict: boolean) {
  if (strict && Object.keys(value).some(key => !allowed.includes(key))) throw new Error('未対応の設定項目です');
}
function choice<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error('設定の選択値が不正です');
  return value as T;
}
function boolean(value: unknown) { if (typeof value !== 'boolean') throw new Error('設定はbooleanで指定してください'); return value; }
function text(value: unknown, max: number, empty = false) {
  if (typeof value !== 'string' || value.length > max || value.includes('\0') || (!empty && !value.trim())) throw new Error('設定文字列が空、長すぎる、または不正です');
  return value.replace(/\r\n?/g, '\n').trim();
}
function profile<P extends string>(value: unknown, allowed: readonly P[], strict: boolean) {
  const data = object(value); keys(data, ['preset','custom_text'], strict);
  const preset = choice(data.preset, allowed);
  if (preset === 'custom') return { preset, custom_text:text(data.custom_text, 20000, true) };
  if ('custom_text' in data) throw new Error('Custom以外に本文は保存できません');
  return { preset };
}

/** File loads recover by setting unit; writes reject the entire invalid patch. */
export function validateSettings(value: unknown, base = defaultSettings(), strict = true): SettingsResult {
  const input = object(value), settings = structuredClone(base), warnings: string[] = [];
  if (Buffer.byteLength(JSON.stringify(input)) > settingsMaxBytes) throw new Error('設定のサイズ上限を超えています');
  keys(input, ['version','general','model','ui','profiles'], strict);
  if ('version' in input && input.version !== 1) throw new Error('未対応のsettings versionです');
  const unit = (name: string, action: () => void) => { try { action(); } catch (error) { if (strict) throw error; warnings.push(`${name}を既定値に戻しました`); } };
  for (const section of ['general','ui'] as const) if (section in input) unit(section, () => {
    const data = object(input[section]); keys(data, Object.keys(settings[section]), strict);
    for (const key of Object.keys(settings[section])) if (key in data) unit(`${section}.${key}`, () => {
      switch (key) {
        case 'startup_screen': settings.general.startup_screen = choice(data[key], ['start','last']); break;
        case 'reuse_model': settings.general.reuse_model = boolean(data[key]); break;
        case 'send_key_mode': settings.ui.send_key_mode = choice(data[key], ['safe','enter']); break;
        case 'right_sidebar_open': settings.ui.right_sidebar_open = boolean(data[key]); break;
        case 'minimap_mode': settings.ui.minimap_mode = choice(data[key], ['detail','overview']); break;
      }
    });
  });
  if ('model' in input) unit('model', () => {
    const data = object(input.model); keys(data, Object.keys(settings.model), strict);
    if ('connection_mode' in data || 'lm_studio_base_url' in data) unit('model.connection', () => {
      const mode = choice('connection_mode' in data ? data.connection_mode : settings.model.connection_mode, ['lm_studio_simple','lm_studio_advanced']);
      const url = normalizeLMStudioBaseUrl(text('lm_studio_base_url' in data ? data.lm_studio_base_url : settings.model.lm_studio_base_url, 2048));
      if (mode === 'lm_studio_simple' && url !== lmStudioSimpleBaseUrl) throw new Error('簡単設定のURLが不正です');
      settings.model.connection_mode = mode; settings.model.lm_studio_base_url = url;
    });
    if ('selected_model' in data) unit('model.selected_model', () => { settings.model.selected_model = data.selected_model === null ? null : text(data.selected_model, 300); });
  });
  if ('profiles' in input) unit('profiles', () => {
    const data = object(input.profiles); keys(data, ['system','user'], strict);
    if ('system' in data) unit('profiles.system', () => { settings.profiles.system = profile(data.system, systemPresetIds, strict); });
    if ('user' in data) unit('profiles.user', () => { settings.profiles.user = profile(data.user, userPresetIds, strict); });
  });
  return { settings, warnings };
}

export class SettingsStore {
  readonly path: string;
  private value = defaultSettings();
  private warnings: string[] = [];
  private pending: Promise<unknown> = Promise.resolve();
  private saveFailed = false;
  private writeBlocked = false;
  private writer: typeof writeSettingsAtomically;
  constructor(path: string, writer = writeSettingsAtomically) { this.path = path; this.writer = writer; }
  async load(): Promise<SettingsResult> {
    await this.pending;
    this.value = defaultSettings(); this.warnings = []; this.writeBlocked = false;
    try {
      if ((await stat(this.path)).size > settingsMaxBytes) throw new Error('設定のサイズ上限を超えています');
      const input = object(JSON.parse(await readFile(this.path, 'utf8')));
      if (input.version !== 1) throw new Error('未対応のsettings versionです');
      const result = validateSettings(input, defaultSettings(), false);
      this.value = result.settings; this.warnings = result.warnings;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.writeBlocked = true;
        this.warnings = ['設定を読み込めないため既定値で起動しました。元ファイルを保全しています。設定ファイルを確認してください。'];
      }
    }
    return this.get();
  }
  get(): SettingsResult { return structuredClone({ settings:this.value, warnings:this.warnings }); }
  async flush() { await this.pending; if (this.saveFailed) throw new Error('Settings save failed'); }
  validate(patch: unknown) { return validateSettings(patch, this.value).settings; }
  update(patch: unknown): Promise<SettingsResult> {
    const captured = structuredClone(patch);
    const operation = this.pending.then(async () => {
      if (this.writeBlocked) throw new Error('元の設定ファイルを保全するため保存できません。ファイルを確認して再起動してください。');
      const next = this.validate(captured);
      try { await this.writer(this.path, JSON.stringify(next, null, 2) + '\n'); }
      catch (error) { this.saveFailed = true; throw error; }
      this.value = next; this.warnings = [];
      return this.get();
    });
    this.pending = operation.catch(() => undefined);
    return operation;
  }
}
