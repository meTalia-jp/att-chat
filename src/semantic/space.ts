import { createHash } from 'node:crypto';
import type { EmbeddingSpaceSpec } from './contracts.ts';

/** Only JSON plain objects, dense arrays and finite primitives are accepted. */
export function canonicalSerialize(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw new Error('Invalid canonical array');
    return '[' + Array.from(value, canonicalSerialize).join(',') + ']';
  }
  if (typeof value === 'object' && value && Object.getPrototypeOf(value) === Object.prototype) {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalSerialize((value as Record<string, unknown>)[key])).join(',') + '}';
  }
  throw new Error('Unsupported canonical value');
}

export function identifySpace(spec: EmbeddingSpaceSpec) {
  const { space_spec_version, provider, model, model_revision, tokenizer, quantization_artifact, dimensions, pooling, normalization, preprocessing, long_text_policy, input_token_limit } = spec;
  if (space_spec_version !== 1 || long_text_policy !== 'reject' || !Number.isSafeInteger(dimensions) || dimensions <= 0 || !Number.isSafeInteger(input_token_limit) || input_token_limit <= 0) throw new Error('Invalid embedding space');
  for (const value of [provider, model, model_revision, tokenizer, quantization_artifact, pooling, normalization, preprocessing]) if (typeof value !== 'string' || !value.trim()) throw new Error('Missing embedding specification');
  if (typeof spec.prefixes?.query !== 'string' || typeof spec.prefixes?.document !== 'string') throw new Error('Missing purpose prefixes');
  // Explicit projection excludes display names, timestamps, API keys and unknown fields.
  const identity = { space_spec_version, provider, model, model_revision, tokenizer, quantization_artifact, dimensions, pooling, normalization, prefixes: { query: spec.prefixes.query, document: spec.prefixes.document }, preprocessing, long_text_policy, input_token_limit };
  const fingerprint = createHash('sha256').update(canonicalSerialize(identity), 'utf8').digest('hex');
  return { fingerprint, space_id: `embedding-space-v1:${fingerprint}` };
}
