import { access, mkdir, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { LMStudioProvider } from '../server/provider.ts';
import { allTurnHandoffPreviews } from './new-chat-handoff-turn-experiment.ts';
import { newChatHandoffGeneration } from './new-chat-handoff.ts';

const output = resolve(process.argv[2] ?? 'docs/laboratory/new-chat-handoff-turn-v03-data');
const execute = process.argv.includes('--execute');
const previews = allTurnHandoffPreviews();
await mkdir(output, { recursive: true });
if (execute) for (const preview of previews) {
  const path = resolve(output, `${preview.condition}.json`);
  if (await access(path).then(() => true, () => false)) throw new Error(`Existing result: ${path}. Use a new directory; nothing sent.`);
}
await writeFile(resolve(output, 'preview.json'), JSON.stringify({ previews }, null, 2) + '\n');
console.log(`Preview: OFF reference + ${previews.length} Turn-based independent new chats${execute ? '' : ' (no requests sent)'}`);

if (execute) {
  const provider = new LMStudioProvider();
  const available = await provider.models();
  if (!available.includes(newChatHandoffGeneration.model)) throw new Error(`Fixed model unavailable: ${newChatHandoffGeneration.model}; available=${available.join(', ')}`);
  for (const preview of previews) {
    let answer = '', diagnostics: Record<string, unknown> | null = null, error: string | null = null;
    const startedAtMs = Date.now(), started_at = new Date(startedAtMs).toISOString();
    console.log(`START ${preview.condition} turns=${preview.included_turn_numbers.join(',')} input=${preview.input_chars}`);
    try {
      await provider.generate(preview.request, AbortSignal.timeout(240_000), delta => { answer += delta; }, value => { diagnostics = value as Record<string, unknown>; });
      if (!answer.trim()) throw new Error('Empty answer');
    } catch (cause) { error = String(cause instanceof Error ? cause.message : cause); }
    const completedAtMs = Date.now();
    const terminal = diagnostics as unknown as Record<string, unknown> | null;
    const result = {
      ...preview,
      temporary_conversation_id: randomUUID(),
      request_sha256: createHash('sha256').update(JSON.stringify(preview.request)).digest('hex'),
      model: preview.request.model,
      temperature: preview.request.temperature,
      max_tokens: preview.request.max_tokens,
      started_at,
      completed_at: new Date(completedAtMs).toISOString(),
      elapsed_ms: completedAtMs - startedAtMs,
      finish_reason: terminal?.finish_reason ?? null,
      answer_chars: answer.length,
      reasoning_chars: terminal?.reasoning_chars ?? null,
      response: answer,
      diagnostics,
      error,
      human_review: 'pending',
    };
    await writeFile(resolve(output, `${preview.condition}.json`), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(`END ${preview.condition} finish=${String(result.finish_reason)} answer=${answer.length} reasoning=${String(result.reasoning_chars)} elapsed=${result.elapsed_ms} error=${error}`);
    if (preview.condition === 'Minimal' && result.finish_reason === 'length' && answer.length === 0) throw new Error('Minimal repeated length + empty answer; stopped as specified; no automatic retry');
    if (preview.condition === 'Minimal' && error) throw new Error('Minimal failed; result saved; no automatic retry');
  }
}
