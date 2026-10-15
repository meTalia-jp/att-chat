import { lmStudioSimpleBaseUrl } from './model-connection.ts';
import { SYSTEM_PROFILE_PRESET_OPTIONS, systemProfilePresetText, type SystemProfilePreset } from './system-profile-presets.ts';
import { USER_PROFILE_PRESET_OPTIONS, userProfilePresetText, type UserProfilePreset } from './user-profile-presets.ts';

export type ProfileSetting<P extends string> = { preset: P; custom_text?: string };
export interface Settings {
  version: 1;
  general: { startup_screen: 'start' | 'last'; reuse_model: boolean };
  model: { connection_mode: 'lm_studio_simple' | 'lm_studio_advanced'; lm_studio_base_url: string; selected_model: string | null };
  ui: { send_key_mode: 'safe' | 'enter'; right_sidebar_open: boolean; minimap_mode: 'detail' | 'overview' };
  profiles: { system: ProfileSetting<SystemProfilePreset>; user: ProfileSetting<UserProfilePreset> };
}
export type SettingsPatch = { general?: Partial<Settings['general']>; model?: Partial<Settings['model']>; ui?: Partial<Settings['ui']>; profiles?: Partial<Settings['profiles']> };
export type SettingsResult = { settings: Settings; warnings: string[] };
export const settingsMaxBytes = 262144;
export function defaultSettings(): Settings {
  return { version: 1, general: { startup_screen:'start', reuse_model:true }, model: { connection_mode:'lm_studio_simple', lm_studio_base_url:lmStudioSimpleBaseUrl, selected_model:null }, ui: { send_key_mode:'safe', right_sidebar_open:true, minimap_mode:'detail' }, profiles: { system:{preset:'off'}, user:{preset:'off'} } };
}
export function restoredProfiles(settings: Settings) {
  return {
    system: { enabled:settings.profiles.system.preset !== 'off', preset:settings.profiles.system.preset, text:systemProfilePresetText(settings.profiles.system.preset, settings.profiles.system.custom_text) },
    user: { enabled:settings.profiles.user.preset !== 'off', preset:settings.profiles.user.preset, text:userProfilePresetText(settings.profiles.user.preset, settings.profiles.user.custom_text) },
  };
}
export function savedProfile<P extends string>(value: { preset:P; text:string }): ProfileSetting<P> {
  return value.preset === 'custom' ? { preset:value.preset, custom_text:value.text } : { preset:value.preset };
}
export function restoreSelectedModel(settings: Settings, models: readonly string[]) {
  const saved = settings.model.selected_model;
  if (!settings.general.reuse_model || !saved) return { model:'', warning:'' };
  return models.includes(saved) ? { model:saved, warning:'' } : { model:'', warning:`保存されたモデル「${saved}」は現在利用できません。モデルを選択してください。` };
}
export const systemPresetIds = SYSTEM_PROFILE_PRESET_OPTIONS.map(item => item.preset);
export const userPresetIds = USER_PROFILE_PRESET_OPTIONS.map(item => item.preset);
