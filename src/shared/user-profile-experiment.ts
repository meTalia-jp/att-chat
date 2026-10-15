import type { ModelRequestMessage } from './system-prompt-experiment.ts';

export const experimentalUserProfileMaxLength = 20_000;

const userProfileGuidance = `以下は回答相手についての参考情報です。
回答を作る前に一度確認し、難易度、説明量、専門用語の使い方を調整する際の参考にしてください。

ただし、
- 現在の質問内容を優先してください。
- ユーザーの明示的な指示を優先してください。
- プロフィールだけを根拠に過度な推測をしないでください。
- 必要以上に初心者向け・専門家向けへ寄せすぎないでください。`;

export function normalizeExperimentalUserProfile(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > experimentalUserProfileMaxLength || value.includes('\0')) {
    throw new Error('User Profileが長すぎる、または不正です');
  }
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  return normalized || null;
}

export function buildUserProfileSystemMessage(profile: string): string {
  return `USER PROFILE\n\n${buildUserProfileSystemBody(profile)}`;
}

export function buildUserProfileSystemBody(profile: string): string {
  return `${userProfileGuidance}\n\n[User Profile]\n${profile}`;
}

export function addUserProfileSystemMessage<T extends ModelRequestMessage>(messages: readonly T[], profile: string | null): Array<T | ModelRequestMessage> {
  if (!profile) return [...messages];
  let insertionIndex = 0;
  while (messages[insertionIndex]?.role === 'system') insertionIndex += 1;
  return [
    ...messages.slice(0, insertionIndex),
    { role:'system', content:buildUserProfileSystemMessage(profile) },
    ...messages.slice(insertionIndex),
  ];
}
