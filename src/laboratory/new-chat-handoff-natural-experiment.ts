import { buildNewChatHandoffRequest } from './new-chat-handoff.ts';
import type { TurnHandoffCondition, TurnHandoffFixtureTurn } from './new-chat-handoff-turn-experiment.ts';

export const naturalConversationFixture: readonly TurnHandoffFixtureTurn[] = [
  { turnNumber: 1, role: 'User', text: '量子力学、LLMモデル、量子コンピュータで「量子」や似た言葉が出てきます。そもそも同じ意味なのでしょうか。' },
  { turnNumber: 2, role: 'Assistant', text: '共通する核は、連続的に見える量を飛び飛びの単位や有限個の値として扱うことです。時計の針で例えるなら、どこでも止まれる針ではなく、決められた目盛りだけに止まる時計です。ただし物理では許される値が系の法則から決まり、工学では計算しやすい段階へ人為的に丸めます。似た言葉でも原因と目的は異なります。' },
  { turnNumber: 3, role: 'User', text: 'LLMモデルでは、重みを4ビットや8ビットにする話を聞きます。時計の目盛りを粗くするのと同じですか。' },
  { turnNumber: 4, role: 'Assistant', text: 'LLMでは多数の重みを、表現できる値が少ない4ビットや8ビットへ近似します。この工学的な処理を量子化と呼び、容量や計算量を減らす代わりに丸め誤差が生じます。量子力学でエネルギー準位などが離散的になる現象とは仕組みが違います。また量子コンピュータは、重みを低ビット化する装置ではなく、量子力学に従う状態を計算資源として使います。' },
  { turnNumber: 5, role: 'User', text: '量子コンピュータでは、電子スピンの二つの測定結果を0と1に対応させると聞きました。普通のデジタルビットと同じですか。' },
  { turnNumber: 6, role: 'Assistant', text: 'ある測定軸に沿った電子スピンでは、上向きと下向きという二つの結果を得られ、それぞれを|0⟩と|1⟩へ対応させられます。ただし量子ビットは測定前に、二つの基底状態へ確率振幅を持つ一つの状態を取れます。古典的な0と1が二つ隠れているわけではありません。量子ビットは電子以外にも、超伝導回路、イオン、光子などで実装できます。' },
  { turnNumber: 7, role: 'User', text: '0か1を測定すると一つしか得られないのに、そのような状態を使うと、なぜ計算に有利になるのですか。' },
  { turnNumber: 8, role: 'Assistant', text: '重ね合わせだけで答えを全部取り出せるわけではありません。量子アルゴリズムは確率振幅を干渉させ、望ましい結果へつながる振幅を強め、不要な結果の振幅を打ち消すように操作します。そのため特定の問題では必要な計算回数を減らせますが、あらゆる計算が速くなるわけではありません。単純な大量並列計算という説明だけでは、測定時に一つの結果しか得られない点を説明できません。' },
] as const;

export const naturalHandoffCases = [
  { caseId: 'A', targetTurn: 4, marker: '量子化', question: 'これはLLMの量子化と同じ意味ですか？' },
  { caseId: 'B', targetTurn: 8, marker: '重ね合わせ', question: 'これがあると、なぜ計算に有利になるのですか？' },
  { caseId: 'C', targetTurn: 6, marker: '上向きと下向き', question: 'これはそのまま0と1という意味ですか？' },
] as const;

const conditions = [
  { condition: 'Minimal', before: 1, after: 0 },
  { condition: 'Standard', before: 3, after: 0 },
  { condition: 'Wide', before: 5, after: 1 },
] as const;

function occurrences(text: string, needle: string) {
  let count=0,offset=0;
  while((offset=text.indexOf(needle,offset))>=0){count+=1;offset+=needle.length;}
  return count;
}

export function buildNaturalHandoffPreview(caseId: typeof naturalHandoffCases[number]['caseId'], condition: TurnHandoffCondition) {
  const fixtureCase=naturalHandoffCases.find(item=>item.caseId===caseId);
  const definition=conditions.find(item=>item.condition===condition);
  if(!fixtureCase||!definition)throw new Error('Unknown natural handoff fixture');
  const targetIndex=naturalConversationFixture.findIndex(turn=>turn.turnNumber===fixtureCase.targetTurn);
  const target=naturalConversationFixture[targetIndex];
  if(!target)throw new Error('Missing Target Turn');
  if(occurrences(target.text,fixtureCase.marker)!==1)throw new Error('Marker must be unique inside Target Turn');
  const included=naturalConversationFixture.slice(Math.max(0,targetIndex-definition.before),Math.min(naturalConversationFixture.length,targetIndex+definition.after+1));
  const context=included.map(turn=>`[T${turn.turnNumber} / ${turn.role}${turn.turnNumber===fixtureCase.targetTurn?' / Target':''}]\n${turn.text}`).join('\n\n');
  const firstUserMessage=`## 前の会話からの参考文脈\n\n${context}\n\n## 質問対象\n\n${fixtureCase.marker}\n\n## 質問\n\n${fixtureCase.question}`;
  const request=buildNewChatHandoffRequest(firstUserMessage);
  const includedNumbers=included.map(turn=>turn.turnNumber);
  return {
    experiment:'new-chat-handoff-natural-v0.4',case_id:caseId,condition,
    source_conversation:'Quantum natural conversation fixture',target_turn:`T${fixtureCase.targetTurn}`,
    included_turn_numbers:includedNumbers.map(value=>`T${value}`),included_turn_count:included.length,
    input_chars:firstUserMessage.length,marker_source_text:fixtureCase.marker,question:fixtureCase.question,
    first_user_message:firstUserMessage,request,
    automatic:{
      system_user_only:request.messages.length===2&&request.messages[0].role==='system'&&request.messages[1].role==='user',
      old_history_not_sent_as_messages:request.messages.length===2,
      turn_order_preserved:includedNumbers.every((value,index,array)=>index===0||array[index-1]<value),
      target_turn_included_exactly_once:occurrences(firstUserMessage,`[T${fixtureCase.targetTurn} / ${target.role} / Target]`)===1&&occurrences(context,target.text)===1,
      marker_unique_in_target:occurrences(target.text,fixtureCase.marker)===1,
      marker_included:firstUserMessage.includes(fixtureCase.marker),question_included:firstUserMessage.includes(fixtureCase.question),
      fixed_settings:request.model==='google/gemma-4-12b-qat'&&request.temperature===0&&request.max_tokens===2048,
      no_automatic_retry:true,no_production_db_write:true,
    },human_review:'pending' as const,
  };
}

export function allNaturalHandoffPreviews(){
  return naturalHandoffCases.flatMap(fixtureCase=>conditions.map(item=>buildNaturalHandoffPreview(fixtureCase.caseId,item.condition)));
}
