export type ModelRequestMessage = { role: string; content: string };

export const experimentalSystemPromptMaxLength = 20_000;

export function normalizeExperimentalSystemPrompt(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > experimentalSystemPromptMaxLength || value.includes('\0')) {
    throw new Error('System Promptが長すぎる、または不正です');
  }
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  return normalized || null;
}

export function addExperimentalSystemPrompt<T extends ModelRequestMessage>(messages: readonly T[], prompt: string | null): Array<T | ModelRequestMessage> {
  if (!prompt) return [...messages];
  let insertionIndex = 0;
  while (messages[insertionIndex]?.role === 'system') insertionIndex += 1;
  return [
    ...messages.slice(0, insertionIndex),
    { role: 'system', content: prompt },
    ...messages.slice(insertionIndex),
  ];
}
