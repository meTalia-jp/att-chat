import { GenerationService } from './generation.ts';
import { LMStudioProvider } from './provider.ts';
import type { SettingsStore } from './settings.ts';
import {
  lmStudioSimpleBaseUrl,
  type AppliedModelConnection,
  type AppliedModelConnectionResult,
  type ModelConnectionMode,
} from '../shared/model-connection.ts';

/** Session-only owner for the LM Studio connection used by future runs. */
export class LMStudioConnectionRuntime {
  private mode: ModelConnectionMode;
  private readonly generation: GenerationService;
  private readonly settings?: SettingsStore;
  private pending: Promise<unknown> = Promise.resolve();
  constructor(generation: GenerationService, settings?: SettingsStore) {
    this.generation = generation;
    this.settings = settings;
    this.mode = settings?.get().settings.model.connection_mode ?? (generation.provider.baseUrl === lmStudioSimpleBaseUrl ? 'lm_studio_simple' : 'lm_studio_advanced');
  }

  current(): AppliedModelConnection {
    return { mode:this.mode, applied_base_url:this.generation.provider.baseUrl };
  }

  async models() {
    return this.generation.provider.models();
  }

  async checkAndApply(mode: ModelConnectionMode, baseUrl?: unknown): Promise<AppliedModelConnectionResult> {
    const operation = this.pending.then(() => this.apply(mode, baseUrl));
    this.pending = operation.catch(() => undefined);
    return operation;
  }

  private async apply(mode: ModelConnectionMode, baseUrl?: unknown): Promise<AppliedModelConnectionResult> {
    const candidateUrl = mode === 'lm_studio_simple' ? lmStudioSimpleBaseUrl : baseUrl;
    if (typeof candidateUrl !== 'string' || !candidateUrl.trim()) throw new Error('Base URLを入力してください');
    const candidate = new LMStudioProvider(candidateUrl.trim());
    const models = await candidate.models();
    if (this.settings) await this.settings.update({ model:{ connection_mode:mode, lm_studio_base_url:candidate.baseUrl } });
    this.generation.replaceProvider(candidate);
    this.mode = mode;
    return { ...this.current(), models };
  }
}
