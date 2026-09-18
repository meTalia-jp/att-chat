import type { ExperimentDefinition } from './catalog.ts';

export type ExperimentStatus = 'IDEA' | 'DRAFT' | 'TESTING' | 'PARTIAL' | 'ADOPTED' | 'REJECTED' | 'PAUSED' | 'SUPERSEDED';
export type RunStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export type ValidationStatus = 'not_run' | 'passed' | 'failed';
export type RunMetadata = {
  schema_version: 1; run_id: string; experiment_id: string; experiment_version: string;
  started_at: string; finished_at: string | null; status: RunStatus; validation_status: ValidationStatus;
  source_commit: string | null; dirty_state: boolean | null; experiment_snapshot: object;
};
export type SimpleRun = RunMetadata & {
  experiment_id: string; experiment_snapshot: Omit<ExperimentDefinition, 'schema_version' | 'derived_from' | 'procedure' | 'acceptance'> & Partial<Pick<ExperimentDefinition, 'schema_version' | 'derived_from' | 'procedure' | 'acceptance'>>;
  marker_events?: { operation: 'created' | 'edited' | 'deleted'; highlight_id: string; timestamp: string }[];
  conversation_id: string; generation_run_ids: string[];
  initial_generation_run_ids: string[];
  provider: 'lm_studio'; provider_base_url: string; models: string[];
};
