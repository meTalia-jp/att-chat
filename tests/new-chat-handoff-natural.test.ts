import test from 'node:test';
import assert from 'node:assert/strict';
import { allNaturalHandoffPreviews, naturalConversationFixture, naturalHandoffCases } from '../src/laboratory/new-chat-handoff-natural-experiment.ts';

test('自然会話fixtureは8 TurnのUser / Assistant往復と3 Markerを固定する',()=>{
  assert.equal(naturalConversationFixture.length,8);
  assert.deepEqual(naturalConversationFixture.map(turn=>turn.role),['User','Assistant','User','Assistant','User','Assistant','User','Assistant']);
  assert.deepEqual(naturalHandoffCases.map(item=>[item.caseId,item.targetTurn,item.marker]),[
    ['A',4,'量子化'],['B',8,'重ね合わせ'],['C',6,'上向きと下向き'],
  ]);
});

test('3 Case x 3条件は独立system + user requestとTurn境界を守る',()=>{
  const previews=allNaturalHandoffPreviews();
  assert.equal(previews.length,9);
  const expected:Record<string,string[][]>={
    A:[['T3','T4'],['T1','T2','T3','T4'],['T1','T2','T3','T4','T5']],
    B:[['T7','T8'],['T5','T6','T7','T8'],['T3','T4','T5','T6','T7','T8']],
    C:[['T5','T6'],['T3','T4','T5','T6'],['T1','T2','T3','T4','T5','T6','T7']],
  };
  for(const fixtureCase of ['A','B','C'])assert.deepEqual(previews.filter(item=>item.case_id===fixtureCase).map(item=>item.included_turn_numbers),expected[fixtureCase]);
  for(const preview of previews){
    assert.ok(Object.values(preview.automatic).every(Boolean),`${preview.case_id}/${preview.condition}`);
    assert.deepEqual(preview.request.messages.map(message=>message.role),['system','user']);
    assert.equal(preview.request.messages[1].content,preview.first_user_message);
    assert.doesNotMatch(preview.first_user_message,/offset|marker_id|conversation_id/i);
  }
});
