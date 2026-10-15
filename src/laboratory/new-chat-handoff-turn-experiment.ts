import { buildNewChatHandoffRequest, newChatHandoffExperimentSources } from './new-chat-handoff.ts';

export type TurnHandoffCondition = 'Minimal' | 'Standard' | 'Wide';
export type TurnHandoffFixtureTurn = { turnNumber: number; role: 'User' | 'Assistant'; text: string };

const source = newChatHandoffExperimentSources[0];
if (!source.sourceTurnText) throw new Error('Case 1 Target Turn is missing');

export const turnHandoffFixture: readonly TurnHandoffFixtureTurn[] = [
  { turnNumber: 20, role: 'User', text: '直接的な告白と、遠回しに気持ちを伝える表現の違いを知りたいです。' },
  { turnNumber: 21, role: 'Assistant', text: '遠回しな表現では、字面の意味だけでなく、共有された状況や文化的な連想が解釈を支えます。' },
  { turnNumber: 22, role: 'User', text: '日本語では景色について話しながら、相手への気持ちを含ませることがありますか。' },
  { turnNumber: 23, role: 'Assistant', text: 'あります。ただし決まった一文が常に告白になるわけではなく、話者、相手、場面、言い方を合わせて判断します。' },
  { turnNumber: 24, role: 'User', text: '文学的な連想を持つ「月がきれいですね」という表現を例に、その仕組みを説明してください。' },
  { turnNumber: 25, role: 'Assistant', text: source.sourceTurnText },
  { turnNumber: 26, role: 'User', text: '文字どおりの感想として使われる場合との区別も必要ですね。' },
] as const;

export const turnHandoffConditions = [
  { condition: 'Minimal', before: 1, after: 0 },
  { condition: 'Standard', before: 3, after: 0 },
  { condition: 'Wide', before: 5, after: 1 },
] as const;

const targetTurnNumber = 25;
const oversizedTargetLimit = 12_000;

function countOccurrences(text: string, needle: string) {
  if (!needle) return 0;
  let count = 0, offset = 0;
  while ((offset = text.indexOf(needle, offset)) >= 0) { count += 1; offset += needle.length; }
  return count;
}

export function buildTurnHandoffPreview(condition: TurnHandoffCondition) {
  const definition = turnHandoffConditions.find(item => item.condition === condition);
  if (!definition) throw new Error('Unknown Turn handoff condition');
  const targetIndex = turnHandoffFixture.findIndex(turn => turn.turnNumber === targetTurnNumber);
  const target = turnHandoffFixture[targetIndex];
  if (!target || target.text.length > oversizedTargetLimit) throw new Error('oversized_target_turn');
  const included = turnHandoffFixture.slice(
    Math.max(0, targetIndex - definition.before),
    Math.min(turnHandoffFixture.length, targetIndex + definition.after + 1),
  );
  const context = included.map(turn => `[T${turn.turnNumber} / ${turn.role}${turn.turnNumber === targetTurnNumber ? ' / Target' : ''}]\n${turn.text}`).join('\n\n');
  const firstUserMessage = `## 前の会話からの参考文脈\n\n${context}\n\n## 質問対象\n\n${source.markerSourceText}\n\n## 質問\n\n${source.questionDraft}`;
  const request = buildNewChatHandoffRequest(firstUserMessage);
  const includedNumbers = included.map(turn => turn.turnNumber);
  const expectedNumbers = condition === 'Minimal' ? [24,25] : condition === 'Standard' ? [22,23,24,25] : [20,21,22,23,24,25,26];
  return {
    experiment: 'new-chat-handoff-turn-stability-v0.3',
    condition,
    source_conversation: source.conversationTitle,
    source_conversation_id: source.conversationId,
    target_turn: `T${targetTurnNumber}`,
    included_turn_numbers: includedNumbers.map(value => `T${value}`),
    included_turn_count: included.length,
    input_chars: firstUserMessage.length,
    marker_source_text: source.markerSourceText,
    question: source.questionDraft,
    first_user_message: firstUserMessage,
    request,
    automatic: {
      system_user_only: request.messages.length === 2 && request.messages[0].role === 'system' && request.messages[1].role === 'user',
      old_history_not_sent_as_messages: request.messages.length === 2,
      turn_order_preserved: includedNumbers.every((value,index,array) => index === 0 || array[index - 1] < value),
      target_turn_included_exactly_once: countOccurrences(firstUserMessage, `[T${targetTurnNumber} / Assistant / Target]`) === 1 && countOccurrences(context,target.text) === 1,
      marker_included: firstUserMessage.includes(source.markerSourceText),
      question_included: firstUserMessage.includes(source.questionDraft),
      condition_mapping: JSON.stringify(includedNumbers) === JSON.stringify(expectedNumbers),
      no_automatic_retry: true,
      fixed_max_tokens: request.max_tokens === 2048,
      fixed_model: request.model === 'google/gemma-4-12b-qat',
      no_production_db_write: true,
    },
    human_review: 'pending' as const,
  };
}

export function allTurnHandoffPreviews() {
  return turnHandoffConditions.map(item => buildTurnHandoffPreview(item.condition));
}
