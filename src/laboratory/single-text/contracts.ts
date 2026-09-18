import type { RunMetadata } from '../run-contracts.ts';
import { experiments, type ExperimentDefinition } from '../catalog.ts';
export type { RunStatus, ValidationStatus } from '../run-contracts.ts';
export const experiment = experiments.find(e => e.id === 'single-text-generation')!;
export type ExperimentRun = RunMetadata & {
  request_id: string;
  provider: 'lm_studio';
  provider_base_url: string;
  model: string;
  generation_settings: { max_tokens: number; temperature: number; stream: true };
  input_snapshot: string;
  output_snapshot: string | null;
  partial_output: string;
  error: { code: string; message: string } | null;
  experiment_snapshot: ExperimentDefinition | Pick<ExperimentDefinition, 'schema_version' | 'id' | 'version' | 'title' | 'purpose' | 'acceptance'>;
  request_body: Record<string, unknown>;
};
export type RunEvent =
  | { type: 'started'; run_id: string }
  | { type: 'delta'; text: string }
  | { type: 'terminal'; run: ExperimentRun }
  | { type: 'storage_error'; run_id: string; message: string; partial_output: string };
export class SingleTextError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) { super(message); this.code = code; this.status = status; }
}
