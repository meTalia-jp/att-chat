import type { ImmediateAskPrefix } from './production-immediate-ask.ts';

export const expertQuestionPrefix = '素人質問で恐縮ですが……';
export const expertQuestionIntent = `「${expertQuestionPrefix}」で始まるMarker質問の「素人」は初心者を意味せず、専門家からの根本的・批判的な質問として扱ってください。`;
export const markerQuestionPrefixes = [
  ['質問', '質問です。 '],
  ['しかし…', 'ただ、疑問が残ります。 '],
  ['意見', '私の考えでは、'],
  ['素人', expertQuestionPrefix],
] as const;
export type MarkerQuestionPrefix = typeof markerQuestionPrefixes[number][0];

// Question Box persists only the question text. Use the same visible leading
// template in both routes, without adding a persisted prefix or intent field.
export function hasExpertQuestionPrefix(question: string) {
  return question.trimStart().startsWith(expertQuestionPrefix);
}
export function applyMarkerQuestionPrefix(question: string, prefix: MarkerQuestionPrefix) {
  const plain = hasExpertQuestionPrefix(question) ? question.trimStart().slice(expertQuestionPrefix.length) : question;
  return prefix === '素人' ? expertQuestionPrefix + plain : plain + markerQuestionPrefixes.find(([label]) => label === prefix)![1];
}
export function storedMarkerQuestionPrefix(prefix: MarkerQuestionPrefix): ImmediateAskPrefix {
  return prefix === '素人' ? '質問' : prefix;
}
