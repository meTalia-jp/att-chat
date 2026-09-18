import { randomUUID } from 'node:crypto';
import type { Repository } from '../server/storage/repository.ts';
import { RunFiles } from './single-text/run-files.ts';
import { SingleTextError } from './single-text/contracts.ts';
import type { SimpleRun } from './run-contracts.ts';
import { experiments, type ExperimentDefinition } from './catalog.ts';
import { provenance } from './provenance.ts';

// Session metadata only. SQLite remains the authority for conversations and generations.
export class SimpleSessions {
  private active: SimpleRun | null = null;
  private store: RunFiles<SimpleRun>;
  private repo: Repository;
  private baseUrl: string;
  private definitions: readonly ExperimentDefinition[];
  constructor(store: RunFiles<SimpleRun>, repo: Repository, baseUrl: string, definitions: readonly ExperimentDefinition[] = experiments) {
    this.definitions = definitions;
    this.store = store; this.repo = repo; this.baseUrl = baseUrl;
    for (const run of store.all()) if (run.status === 'running') {
      store.save({ ...this.link(run), status: 'interrupted', finished_at: new Date().toISOString() });
    }
  }
  current() { return this.active ? this.link(this.active) : null; }
  list() { return this.store.all().map(run => run.status === 'running' ? this.link(run) : run).sort((a,b) => b.started_at.localeCompare(a.started_at)); }
  private link(run: SimpleRun): SimpleRun {
    const generations = this.repo.listRuns(run.conversation_id).filter(r => !run.initial_generation_run_ids.includes(r.run_id));
    return { ...run, generation_run_ids: generations.map(r => r.run_id), models: [...new Set(generations.map(r => r.model_id).filter((m): m is string => m !== null))] };
  }
  start(conversationId: string, experimentId = 'simple-marker-chat') {
    if (this.active) throw new SingleTextError('BUSY', '実験セッション継続中です', 409);
    this.repo.getConversation(conversationId);
    if (this.repo.activeRun(conversationId)) throw new SingleTextError('BUSY', '生成中です', 409);
    const definition = this.definitions.find(e => e.id === experimentId);
    if (!definition?.runnable || definition.execution?.entry !== 'simple-marker-chat') throw new SingleTextError('INVALID_EXPERIMENT', '未登録のSimple Experimentです');
    const run: SimpleRun = {
      schema_version: 1, run_id: randomUUID(), experiment_id: definition.id, experiment_version: definition.version,
      marker_events: [],
      started_at: new Date().toISOString(), finished_at: null, status: 'running', validation_status: 'not_run',
      conversation_id: conversationId, generation_run_ids: [], initial_generation_run_ids: this.repo.listRuns(conversationId).map(r => r.run_id),
      provider: 'lm_studio', provider_base_url: this.baseUrl, models: [],
      experiment_snapshot: structuredClone(definition), ...provenance(),
    };
    this.store.save(run); this.active = run; return structuredClone(run);
  }
  checkpoint() { if (this.active) { const run = this.link(this.active); this.store.save(run); this.active = run; } }
  markerEvent(runId: string, operation: 'created' | 'edited' | 'deleted', highlightId: string) {
    if (!this.active || this.active.run_id !== runId) throw new Error('Marker session changed');
    // Retain a failed write in memory so Results/end can retry; never copy marker text.
    this.active = { ...this.active, marker_events: [...(this.active.marker_events ?? []), {operation, highlight_id:highlightId, timestamp:new Date().toISOString()}] };
    this.checkpoint();
  }
  finish(id: string, status: 'completed' | 'interrupted' = 'completed') {
    if (!this.active || this.active.run_id !== id) throw new SingleTextError('NOT_ACTIVE', '実験セッションが一致しません', 409);
    if (status === 'completed' && this.repo.activeRun(this.active.conversation_id)) throw new SingleTextError('BUSY', '生成中は終了できません', 409);
    const run = { ...this.link(this.active), status, finished_at: new Date().toISOString() };
    this.store.save(run); this.active = null; return run;
  }
  shutdown() { if (this.active) this.finish(this.active.run_id, 'interrupted'); }
}
