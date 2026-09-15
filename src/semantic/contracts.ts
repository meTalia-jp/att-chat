export type EmbeddingPurpose = 'query' | 'document';
export type Locality = 'in_process_local' | 'loopback' | 'external';

/** Immutable identity; operational metadata and credentials do not belong here. */
export type EmbeddingSpaceSpec = {
  space_spec_version: 1;
  provider: string;
  model: string;
  model_revision: string;
  tokenizer: string;
  quantization_artifact: string;
  dimensions: number;
  pooling: string;
  normalization: string;
  prefixes: { query: string; document: string };
  preprocessing: string;
  long_text_policy: 'reject';
  input_token_limit: number;
};
export type EmbeddingModelInfo = {
  space_id: string;
  fingerprint: string;
  provider_id: string;
  model_id: string;
  revision: string;
  dimensions: number;
  input_token_limit: number;
  locality: Locality;
};
export type EmbeddingErrorCode = 'INPUT_TOO_LONG' | 'MODEL_UNAVAILABLE' | 'PROVIDER_ERROR' | 'CANCELLED' | 'INVALID_VECTOR' | 'SPACE_MISMATCH' | 'TRUNCATION_FORBIDDEN';
export type EmbeddingFailure = { ok: false; error: { code: EmbeddingErrorCode; retryable: boolean } };
export type EmbeddingResult = EmbeddingFailure | {
  ok: true;
  space_id: string;
  vector: Float32Array;
  input_tokens: number;
  truncated: false;
};
export interface EmbeddingProvider {
  getModelInfo(): Promise<EmbeddingModelInfo>;
  embed(text: string, options: { purpose: EmbeddingPurpose; signal?: AbortSignal }): Promise<EmbeddingResult>;
  dispose(): Promise<void>;
}
