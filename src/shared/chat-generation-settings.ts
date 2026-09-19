export type ChatThinkingPresetId = 'off' | 'low' | 'medium' | 'high';

export type ChatThinkingPreset = {
  id: ChatThinkingPresetId;
  label: string;
  maxTokens: number;
  provisional: true;
  thinkingControl: 'not_applied';
};

export type ChatGenerationDefaults = {
  maxTokens: number;
};

/** Core Chat only. Experiment-specific generation settings remain independent. */
export const chatGenerationDefaults: Readonly<ChatGenerationDefaults> = {
  maxTokens: 4096,
};

/**
 * Candidate UI presets. Only maxTokens is defined; model-specific thinking
 * controls are deliberately not sent until their compatibility is known.
 */
export const chatThinkingPresets: Readonly<Record<ChatThinkingPresetId, ChatThinkingPreset>> = {
  off: { id: 'off', label: 'OFF', maxTokens: 2048, provisional: true, thinkingControl: 'not_applied' },
  low: { id: 'low', label: 'Low', maxTokens: 4096, provisional: true, thinkingControl: 'not_applied' },
  medium: { id: 'medium', label: 'Medium', maxTokens: 8192, provisional: true, thinkingControl: 'not_applied' },
  high: { id: 'high', label: 'High', maxTokens: 16384, provisional: true, thinkingControl: 'not_applied' },
};
