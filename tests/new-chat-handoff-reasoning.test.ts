import test from 'node:test';
import assert from 'node:assert/strict';
import { allReasoningContinuityPreviews, reasoningContinuityCases, reasoningContinuityFixture } from '../src/laboratory/new-chat-handoff-reasoning-experiment.ts';

test('User reasoning fixtureは指定された口語8 Turnと4 Markerを保持する',()=>{
  assert.equal(reasoningContinuityFixture.length,8);
  assert.equal(reasoningContinuityFixture[0].text,'対向する光の相対速度は一見、光速×2倍のように思えるが、光速度以上の速度はないので、相対速度も光速でOK？？');
  assert.equal(reasoningContinuityFixture[6].text,'物理の世界の人は数式で会話しているのかも。');
  assert.deepEqual(reasoningContinuityCases.map(item=>[item.caseId,item.targetTurn,item.marker]),[
    ['A',2,'毎秒2cで縮みます'],['B',4,'波でも粒子でもない'],['C',6,'日常語だけでは表現しにくい'],['D',8,'数式は'],
  ]);
});

test('4 Case x 3条件はTurn端をclampし独立system + user requestを作る',()=>{
  const previews=allReasoningContinuityPreviews();assert.equal(previews.length,12);
  const expected:Record<string,string[][]>={
    A:[['T1','T2'],['T1','T2'],['T1','T2','T3']],
    B:[['T3','T4'],['T1','T2','T3','T4'],['T1','T2','T3','T4','T5']],
    C:[['T5','T6'],['T3','T4','T5','T6'],['T1','T2','T3','T4','T5','T6','T7']],
    D:[['T7','T8'],['T5','T6','T7','T8'],['T3','T4','T5','T6','T7','T8']],
  };
  for(const caseId of ['A','B','C','D'])assert.deepEqual(previews.filter(item=>item.case_id===caseId).map(item=>item.included_turn_numbers),expected[caseId]);
  for(const preview of previews){assert.ok(Object.values(preview.automatic).every(Boolean),`${preview.case_id}/${preview.condition}`);assert.deepEqual(preview.request.messages.map(message=>message.role),['system','user']);assert.equal(preview.request.messages[1].content,preview.first_user_message);assert.doesNotMatch(preview.first_user_message,/offset|marker_id|conversation_id/i);}
});
