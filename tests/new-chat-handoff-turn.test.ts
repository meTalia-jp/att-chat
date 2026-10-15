import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { allTurnHandoffPreviews, buildTurnHandoffPreview, turnHandoffFixture } from '../src/laboratory/new-chat-handoff-turn-experiment.ts';

test('Turn-based HandoffはMinimal / Standard / Wideを元順序で構築する', () => {
  const previews=allTurnHandoffPreviews();
  assert.deepEqual(previews.map(item=>item.included_turn_numbers),[
    ['T24','T25'], ['T22','T23','T24','T25'], ['T20','T21','T22','T23','T24','T25','T26'],
  ]);
  for(const preview of previews){
    assert.ok(Object.values(preview.automatic).every(Boolean),`${preview.condition}: ${JSON.stringify(preview.automatic)}`);
    assert.deepEqual(preview.request.messages.map(message=>message.role),['system','user']);
    assert.equal(preview.request.max_tokens,2048);
    assert.equal(preview.request.temperature,0);
    assert.equal(preview.request.model,'google/gemma-4-12b-qat');
    assert.equal(preview.request.messages[1].content,preview.first_user_message);
  }
});

test('Target Turn全文は各request内に一度だけ入り、内部IDやoffsetを送らない', () => {
  const target=turnHandoffFixture.find(turn=>turn.turnNumber===25)!;
  for(const condition of ['Minimal','Standard','Wide'] as const){
    const preview=buildTurnHandoffPreview(condition), body=preview.first_user_message;
    assert.equal(body.split(target.text).length-1,1);
    assert.match(body,/\[T25 \/ Assistant \/ Target\]/);
    assert.doesNotMatch(body,/quick-action-fixture|ask-fixture-2|offset/i);
  }
});

test('既存OFF失敗Runは比較基準として残り、Turn runnerは上書きしない', () => {
  const existing=JSON.parse(readFileSync('docs/laboratory/new-chat-handoff-v02-data/case-1-OFF.json','utf8'));
  const runner=readFileSync('src/laboratory/new-chat-handoff-turn-run.ts','utf8');
  assert.equal(existing.finish_reason ?? existing.diagnostics?.finish_reason,'length');
  assert.equal(existing.response.length,0);
  assert.equal(existing.diagnostics.reasoning_chars,8028);
  assert.doesNotMatch(runner,/new-chat-handoff-v02-data/);
});
