import { Repository, InputError } from './storage/repository.ts';
import { LMStudioProvider, type GenerationDiagnostics } from './provider.ts';
import type { GenerationRun } from '../shared/contracts.ts';

type Active = { controller: AbortController; text: string; cancelled: boolean; done: Promise<void> };
export class GenerationService {
  private active = new Map<string, Active>();
  private repo: Repository;
  private currentProvider: LMStudioProvider;
  get provider() { return this.currentProvider; }
  constructor(repo: Repository, provider = new LMStudioProvider()) { this.repo = repo; this.currentProvider = provider; }
  replaceProvider(provider: LMStudioProvider) { this.currentProvider = provider; }
  async execute(run: GenerationRun, emit: (event: Record<string, unknown>) => void) {
    const state: Active = { controller: new AbortController(), text: '', cancelled: false, done: Promise.resolve() };
    const provider = this.currentProvider;
    this.active.set(run.run_id, state);
    state.done = this.perform(run, state, emit, provider);
    await state.done;
  }
  private async perform(run: GenerationRun, state: Active, emit: (event: Record<string, unknown>) => void, provider: LMStudioProvider) {
    const generationStarted = performance.now();
    let persistenceError: unknown;
    const diagnosticState: { value: GenerationDiagnostics | null } = { value: null };
    let terminalStatus: 'succeeded' | 'failed' | 'cancelled' | 'storage_error' = 'failed';
    let terminalMessage: string | null = null;
    const maxTokens = typeof run.request_snapshot.max_tokens === 'number' ? run.request_snapshot.max_tokens : null;
    const checkpoint = setInterval(() => {
      try { this.repo.checkpoint(run.conversation_id, run.run_id, state.text); }
      catch (error) { persistenceError = error; state.controller.abort(); }
    }, 500);
    const timeout = setTimeout(() => state.controller.abort(new Error('生成が10分でタイムアウトしました')), 600000);
    try {
      this.repo.startRun(run.conversation_id, run.run_id);
      emit({ type: 'running' });
      await provider.generate(run.request_snapshot, state.controller.signal, delta => {
        state.text += delta;
        if (state.text.length > 1_000_000) throw new Error('生成本文の上限を超えました');
        emit({ type: 'delta', text: delta });
      }, value => { diagnosticState.value = value; });
      if (state.controller.signal.aborted) throw state.controller.signal.reason;
      if (!state.text.trim()) {
        const diagnostics = diagnosticState.value;
        const nearLimit = diagnostics?.completion_tokens != null && maxTokens != null && diagnostics.completion_tokens >= maxTokens * 0.95;
        if (diagnostics?.finish_reason === 'length' && nearLimit && diagnostics.reasoning_chars > 0) {
          throw new Error('回答本文を生成する前に出力上限へ達した可能性があります');
        }
        throw new Error('本文のない応答です');
      }
      this.repo.finishRun(run.conversation_id, run.run_id, 'succeeded', state.text);
      terminalStatus = 'succeeded';
      emit({ type: 'terminal', outcome: 'succeeded' });
    } catch (error) {
      const outcome = state.cancelled && !persistenceError ? 'cancelled' : 'failed';
      const message = persistenceError ? '途中本文の保存に失敗しました' : (error as Error)?.message ?? '生成失敗';
      terminalStatus = outcome; terminalMessage = message;
      try {
        this.repo.finishRun(run.conversation_id, run.run_id, outcome, state.text, { code: persistenceError ? 'STORAGE_ERROR' : outcome === 'cancelled' ? 'USER_CANCELLED' : 'GENERATION_ERROR', message });
        emit({ type: 'terminal', outcome, message });
      } catch {
        terminalStatus = 'storage_error';
        emit({ type: 'storage_error', message: '終了状態を保存できませんでした。成功扱いにはしていません。再起動後に中断として整理します。' });
      }
    } finally {
      clearInterval(checkpoint); clearTimeout(timeout); this.active.delete(run.run_id);
      console.info('GENERATION_DIAGNOSTIC ' + JSON.stringify({ event: 'generation_terminal', run_id: run.run_id,
        model: run.model_id, effective_max_tokens: maxTokens, finish_reason: diagnosticState.value?.finish_reason ?? null,
        completion_tokens: diagnosticState.value?.completion_tokens ?? null, prompt_tokens: diagnosticState.value?.prompt_tokens ?? null,
        total_tokens: diagnosticState.value?.total_tokens ?? null, content_chars: diagnosticState.value?.content_chars ?? state.text.length,
        reasoning_chars: diagnosticState.value?.reasoning_chars ?? null,
        generation_duration_ms: diagnosticState.value?.duration_ms ?? Math.round(performance.now() - generationStarted),
        status: terminalStatus, error_message: terminalMessage }));
    }
  }
  async cancel(id: string, runId: string) {
    const run = this.repo.run(id, runId), state = this.active.get(runId);
    if (!state) {
      if (['preparing','running'].includes(run.outcome)) throw new InputError('生成処理に接続できません。再起動で整理してください', 409);
      return run;
    }
    state.cancelled = true; state.controller.abort(); await state.done;
    const saved = this.repo.run(id, runId);
    if (['preparing','running'].includes(saved.outcome)) throw new Error('停止状態を保存できません');
    return saved;
  }
  disconnect(runId: string) { this.active.get(runId)?.controller.abort(new Error('ブラウザ接続が切断されました')); }
}
