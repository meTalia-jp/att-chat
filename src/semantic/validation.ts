import type { EmbeddingFailure, EmbeddingModelInfo, EmbeddingResult } from './contracts.ts';

export function failure(code: EmbeddingFailure['error']['code'], retryable = false): EmbeddingFailure {
  return { ok: false, error: { code, retryable } };
}

/** Future EmbeddingService boundary: validate untrusted provider output before use. */
export function validateEmbedding(result: unknown, expected: EmbeddingModelInfo): EmbeddingResult {
  if (!result || typeof result !== 'object') return failure('PROVIDER_ERROR');
  const r = result as Record<string, unknown>;
  if (r.ok === false) {
    const e = r.error as Record<string, unknown> | undefined;
    if (!e || !['INPUT_TOO_LONG','MODEL_UNAVAILABLE','PROVIDER_ERROR','CANCELLED','INVALID_VECTOR','SPACE_MISMATCH','TRUNCATION_FORBIDDEN'].includes(String(e.code)) || typeof e.retryable !== 'boolean') return failure('PROVIDER_ERROR');
    return failure(e.code as EmbeddingFailure['error']['code'], e.retryable);
  }
  if (r.ok !== true) return failure('PROVIDER_ERROR');
  if (r.space_id !== expected.space_id) return failure('SPACE_MISMATCH');
  if (r.truncated !== false) return failure('TRUNCATION_FORBIDDEN');
  if (!Number.isSafeInteger(r.input_tokens) || (r.input_tokens as number) < 0) return failure('PROVIDER_ERROR');
  if ((r.input_tokens as number) > expected.input_token_limit) return failure('INPUT_TOO_LONG');
  if (!Number.isSafeInteger(expected.dimensions) || expected.dimensions <= 0 || !(r.vector instanceof Float32Array) || r.vector.length !== expected.dimensions) return failure('INVALID_VECTOR');
  let nonzero = false;
  for (const value of r.vector) { if (!Number.isFinite(value)) return failure('INVALID_VECTOR'); if (value !== 0) nonzero = true; }
  if (!nonzero) return failure('INVALID_VECTOR');
  return { ok: true, space_id: expected.space_id, vector: r.vector.slice(), input_tokens: r.input_tokens as number, truncated: false };
}
