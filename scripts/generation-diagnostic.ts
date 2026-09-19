import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type Observation = {
  model: string;
  max_tokens: number;
  repeat: number;
  started_at: string;
  elapsed_ms: number;
  status: 'succeeded' | 'failed';
  content_chars: number;
  reasoning_chars: number;
  finish_reason: string | null;
  completion_tokens: number | null;
  prompt_tokens: number | null;
  total_tokens: number | null;
  chunk_count: number;
  content_chunk_count: number;
  reasoning_chunk_count: number;
  terminal_chunk: unknown;
  observed_chunk_keys: string[];
  observed_delta_keys: string[];
  error: string | null;
};

const model = process.env.DIAG_MODEL ?? 'qwen/qwen3.6-35b-a3b';
const input = process.env.DIAG_INPUT ?? 'アメリカの中間選挙について教えて';
const baseUrl = (process.env.LM_STUDIO_BASE_URL ?? 'http://127.0.0.1:1234/v1').replace(/\/$/, '');
const limits = (process.env.DIAG_LIMITS ?? '2048,4096,8192').split(',').map(Number);
const repeats = Number(process.env.DIAG_REPEATS ?? '2');
const output = resolve(process.env.DIAG_OUTPUT ?? '.cache/generation-diagnostic.json');
const requestFile = process.env.DIAG_REQUEST_FILE;
const requestTemplate = requestFile ? JSON.parse(await readFile(resolve(requestFile), 'utf8')) as Record<string, unknown> : null;
const messages = requestTemplate?.messages ?? [{ role: 'user', content: input }];

if (!limits.every(value => Number.isInteger(value) && value > 0) || !Number.isInteger(repeats) || repeats < 1) {
  throw new Error('DIAG_LIMITS / DIAG_REPEATS が不正です');
}

function terminalSummary(chunk: Record<string, unknown>) {
  const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
  return {
    keys: Object.keys(chunk).sort(),
    choices: choices.map(value => {
      const choice = value as Record<string, unknown>;
      const delta = choice.delta && typeof choice.delta === 'object' ? choice.delta as Record<string, unknown> : {};
      return { index: choice.index, finish_reason: choice.finish_reason ?? null, delta_keys: Object.keys(delta).sort() };
    }),
    usage: chunk.usage ?? null,
  };
}

async function run(maxTokens: number, repeat: number): Promise<Observation> {
  const startedAt = new Date().toISOString(), started = performance.now();
  let content = '', reasoning = '', finishReason: string | null = null, usage: Record<string, unknown> | null = null;
  let chunkCount = 0, contentChunkCount = 0, reasoningChunkCount = 0, terminalChunk: unknown = null;
  const chunkKeys = new Set<string>(), deltaKeys = new Set<string>();
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(900_000),
      body: JSON.stringify({ ...requestTemplate, model, messages, stream: true, max_tokens: maxTokens,
        stream_options: { include_usage: true } }),
    });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = '', doneEvent = false;
    while (true) {
      const read = await reader.read();
      if (read.done) break;
      buffer += decoder.decode(read.value, { stream: true });
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const event = buffer.slice(0, match.index); buffer = buffer.slice(match.index + match[0].length);
        const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!data) continue;
        if (data === '[DONE]') { doneEvent = true; continue; }
        const chunk = JSON.parse(data) as Record<string, unknown>; chunkCount++;
        Object.keys(chunk).forEach(key => chunkKeys.add(key));
        if (chunk.usage && typeof chunk.usage === 'object') usage = chunk.usage as Record<string, unknown>;
        const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
        const choice = choices.find(value => (value as { index?: unknown }).index === 0) as Record<string, unknown> | undefined;
        if (!choice) continue;
        const delta = choice.delta && typeof choice.delta === 'object' ? choice.delta as Record<string, unknown> : {};
        Object.keys(delta).forEach(key => deltaKeys.add(key));
        if (typeof delta.content === 'string') { content += delta.content; if (delta.content) contentChunkCount++; }
        const reasoningPart = typeof delta.reasoning_content === 'string' ? delta.reasoning_content
          : typeof delta.reasoning === 'string' ? delta.reasoning : '';
        if (reasoningPart) { reasoning += reasoningPart; reasoningChunkCount++; }
        if (choice.finish_reason != null) { finishReason = String(choice.finish_reason); terminalChunk = terminalSummary(chunk); }
      }
    }
    if (!doneEvent) throw new Error('[DONE] を受信していません');
    return observation('succeeded', null);
  } catch (error) { return observation('failed', error instanceof Error ? error.message : String(error)); }

  function observation(status: Observation['status'], error: string | null): Observation {
    const number = (key: string) => typeof usage?.[key] === 'number' ? usage[key] as number : null;
    return { model, max_tokens: maxTokens, repeat, started_at: startedAt, elapsed_ms: Math.round(performance.now() - started),
      status, content_chars: content.length, reasoning_chars: reasoning.length, finish_reason: finishReason,
      completion_tokens: number('completion_tokens'), prompt_tokens: number('prompt_tokens'), total_tokens: number('total_tokens'),
      chunk_count: chunkCount, content_chunk_count: contentChunkCount, reasoning_chunk_count: reasoningChunkCount,
      terminal_chunk: terminalChunk, observed_chunk_keys: [...chunkKeys].sort(), observed_delta_keys: [...deltaKeys].sort(), error };
  }
}

const observations: Observation[] = [];
for (const limit of limits) for (let repeat = 1; repeat <= repeats; repeat++) {
  const result = await run(limit, repeat); observations.push(result);
  console.log(JSON.stringify(result));
}
await writeFile(output, JSON.stringify({ schema_version: 1, created_at: new Date().toISOString(), base_url: baseUrl,
  conditions: { model, input: requestTemplate ? '(request snapshot; content omitted from diagnostic result)' : input,
    conversation: requestTemplate ? `request snapshot (${Array.isArray(messages) ? messages.length : 'unknown'} messages)` : 'isolated single user message',
    temperature: requestTemplate?.temperature ?? 'provider default', stream: true }, observations }, null, 2));
console.log(`saved: ${output}`);
