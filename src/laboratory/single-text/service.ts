import { randomUUID } from 'node:crypto';
import { provenance } from '../provenance.ts';
import { LMStudioProvider } from '../../server/provider.ts';
import { experiment, SingleTextError, type ExperimentRun, type RunEvent } from './contracts.ts';
import { RunFiles } from './run-files.ts';

type Active = { run: ExperimentRun; controller: AbortController; reason: 'cancelled' | 'interrupted' | 'failed'; code: string; message: string; done?: Promise<void> };
export class SingleTextService {
  readonly provider: Pick<LMStudioProvider, 'models' | 'generate' | 'baseUrl'>;
  private active: Active | null = null;
  private requests = new Set<string>();
  private closing = false;
  constructor(privateStore: RunFiles, provider: Pick<LMStudioProvider, 'models' | 'generate' | 'baseUrl'> = new LMStudioProvider(),
    options: { timeoutMs?: number; checkpointMs?: number; provenance?: () => { source_commit: string | null; dirty_state: boolean | null } } = {}) {
    this.store = privateStore; this.provider = provider; this.options = options;
    for (const run of this.store.all()) {
      this.requests.add(run.request_id);
      if (run.status === 'running') this.store.save({ ...run, status: 'interrupted', finished_at: new Date().toISOString(),
        error: { code: 'RESTART_INTERRUPTED', message: '前回の実行が終了していません。自動再送は行いません。' } });
    }
  }
  private store: RunFiles;
  private options: { timeoutMs?: number; checkpointMs?: number; provenance?: () => { source_commit: string | null; dirty_state: boolean | null } };
  private provenance() {
    if (this.options.provenance) return this.options.provenance();
    return provenance();
  }
  reserve(input: Record<string, unknown>) {
    if (this.closing || this.active) throw new SingleTextError('BUSY', '実行中です。停止または完了後に再実行してください', 409);
    const { text, model, request_id } = input;
    if (Object.keys(input).some(key => !['text','model','request_id'].includes(key)) ||
      typeof text !== 'string' || !text.trim() || text.length > 100000 ||
      typeof model !== 'string' || !model.trim() || model.length > 300 ||
      typeof request_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(request_id)) throw new SingleTextError('INVALID_INPUT', '入力・モデル・request IDを確認してください');
    if (this.requests.has(request_id)) throw new SingleTextError('DUPLICATE_REQUEST', 'この送信は記録済みです。再読込で確認してください', 409);
    const settings = { max_tokens: 2048, temperature: 0.7, stream: true as const };
    const run: ExperimentRun = {
      schema_version: 1, run_id: randomUUID(), request_id, experiment_id: experiment.id, experiment_version: experiment.version,
      started_at: new Date().toISOString(), finished_at: null, status: 'running', validation_status: 'not_run',
      provider: 'lm_studio', provider_base_url: this.provider.baseUrl, model, generation_settings: settings,
      input_snapshot: text, output_snapshot: null, partial_output: '', error: null, ...this.provenance(),
      experiment_snapshot: structuredClone(experiment),
      request_body: { model, messages: [{ role: 'user', content: text }], ...settings },
    };
    try { this.store.save(run); } catch { throw new SingleTextError('STORAGE_ERROR', '開始記録を保存できないため生成しません', 500); }
    this.requests.add(request_id);
    this.active = { run, controller: new AbortController(), reason: 'failed', code: 'PROVIDER_ERROR', message: '生成に失敗しました' };
    return structuredClone(run);
  }
  execute(id: string, emit: (event: RunEvent) => void) {
    const state = this.active;
    if (!state || state.run.run_id !== id || state.done) throw new SingleTextError('NOT_ACTIVE', '実行開始できません', 409);
    state.done = this.perform(state, emit); return state.done;
  }
  private async perform(state: Active, emit: (event: RunEvent) => void) {
    const notify = (event: RunEvent) => { try { emit(event); } catch { this.abort(state, 'failed', 'DISCONNECTED', '画面との接続が切れました'); } };
    const timer = setTimeout(() => this.abort(state, 'failed', 'TIMEOUT', '生成がタイムアウトしました'), this.options.timeoutMs ?? 600000);
    const checkpoint = setInterval(() => {
      if (state.controller.signal.aborted) return;
      try { this.store.save(state.run); }
      catch { this.abort(state, 'failed', 'STORAGE_ERROR', '途中本文を保存できませんでした'); }
    }, this.options.checkpointMs ?? 500);
    let onAbort: () => void = () => {};
    try {
      notify({ type: 'started', run_id: state.run.run_id });
      state.controller.signal.throwIfAborted();
      const cancelled = new Promise<never>((_, reject) => {
        onAbort = () => reject(new Error(state.message));
        state.controller.signal.addEventListener('abort', onAbort, { once: true });
      });
      await Promise.race([cancelled, this.provider.generate(structuredClone(state.run.request_body), state.controller.signal, delta => {
        if (state.controller.signal.aborted) return;
        if (state.run.partial_output.length + delta.length > 1000000) throw new Error('生成出力が上限を超えました');
        state.run.partial_output += delta; notify({ type: 'delta', text: delta });
      })]);
      state.controller.signal.throwIfAborted();
      if (!state.run.partial_output.trim()) throw new Error('本文のない応答です');
      state.run.status = 'completed'; state.run.output_snapshot = state.run.partial_output;
    } catch (error) {
      state.run.status = state.controller.signal.aborted ? state.reason : 'failed';
      state.run.error = { code: state.controller.signal.aborted ? state.code : 'PROVIDER_ERROR',
        message: state.controller.signal.aborted ? state.message : (error instanceof Error ? error.message : '生成失敗') };
    } finally {
      clearTimeout(timer); clearInterval(checkpoint);
      state.controller.signal.removeEventListener('abort', onAbort);
      // Ignore any callback from a misbehaving provider after finalization.
      state.controller.abort();
      state.run.finished_at = new Date().toISOString();
      try { this.store.save(state.run); notify({ type: 'terminal', run: structuredClone(state.run) }); }
      catch { notify({ type: 'storage_error', run_id: state.run.run_id, partial_output: state.run.partial_output,
        message: '終了記録を保存できませんでした。完了扱いにせず、再起動後に中断として整理します。' }); }
      this.active = null;
    }
  }
  private abort(state: Active, reason: Active['reason'], code: string, message: string) {
    if (state.controller.signal.aborted) return;
    state.reason = reason; state.code = code; state.message = message; state.controller.abort();
  }
  async stop(id: string) {
    const state = this.active;
    if (!state || state.run.run_id !== id) return this.store.read(id);
    this.abort(state, 'cancelled', 'USER_CANCELLED', '利用者が停止しました');
    if (!state.done) state.done = this.perform(state, () => {});
    await state.done;
    const saved = this.store.read(id);
    if (saved.status === 'running') throw new SingleTextError('STORAGE_ERROR', '停止結果を保存できませんでした', 500);
    return saved;
  }
  disconnect(id: string) { if (this.active?.run.run_id === id) this.abort(this.active, 'failed', 'DISCONNECTED', '画面との接続が切れました'); }
  read(id: string) { return this.store.read(id); }
  latest() { return this.store.all().sort((a,b) => b.started_at.localeCompare(a.started_at))[0] ?? null; }
  async shutdown() {
    this.closing = true; const state = this.active;
    if (state) {
      this.abort(state, 'interrupted', 'SHUTDOWN', 'サーバー終了により中断しました');
      if (!state.done) state.done = this.perform(state, () => {});
      await state.done;
    }
  }
}
