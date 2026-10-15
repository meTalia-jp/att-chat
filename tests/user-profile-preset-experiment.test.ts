import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUserProfileSystemMessage } from '../src/shared/user-profile-experiment.ts';
import {
  buildUserProfilePresetRequest,
  userProfilePresetConditions,
  userProfilePresetModels,
  userProfilePresetQuestions,
  userProfilePresetTexts,
} from '../src/laboratory/user-profile-preset-v03.ts';

test('2モデル x 4 Profile x 3問題の24条件を固定する', () => {
  assert.deepEqual(userProfilePresetModels,[
    'google/gemma-4-26b-a4b-qat',
    'qwen/qwen3.6-35b-a3b',
  ]);
  assert.deepEqual(Object.keys(userProfilePresetQuestions),['business','math','physics']);
  assert.deepEqual(userProfilePresetConditions.map(item=>item.profile),['off','beginner','practical','expert']);
  assert.equal(userProfilePresetModels.length * Object.keys(userProfilePresetQuestions).length * userProfilePresetConditions.length,24);
});

test('Profile本文と質問を条件間で変更せず現行Standard wrapperを使う', () => {
  for (const condition of userProfilePresetConditions) {
    if (condition.profile==='off') {
      assert.equal(condition.profile_text,null);
      assert.equal(condition.system_message,null);
      continue;
    }
    assert.equal(condition.profile_text,userProfilePresetTexts[condition.profile]);
    assert.equal(condition.system_message,buildUserProfileSystemMessage(userProfilePresetTexts[condition.profile]));
  }
  for (const question of Object.values(userProfilePresetQuestions)) assert.equal(question.trim(),question);
});

test('request snapshotはmodel・subject・profile・固定generation settingsを追跡できる', () => {
  const identities = new Set<string>();
  for (const model of userProfilePresetModels) {
    for (const subject of Object.keys(userProfilePresetQuestions) as Array<keyof typeof userProfilePresetQuestions>) {
      for (const condition of userProfilePresetConditions) {
        const request=buildUserProfilePresetRequest(model,subject,condition);
        identities.add(`${model}|${subject}|${condition.profile}`);
        assert.equal(request.model,model);
        assert.equal(request.temperature,0);
        assert.equal(request.max_tokens,4096);
        assert.equal(request.stream,true);
        assert.deepEqual(request.stream_options,{include_usage:true});
        assert.deepEqual(request.messages.at(-1),{role:'user',content:userProfilePresetQuestions[subject]});
        const systems=request.messages.filter(message=>message.role==='system');
        assert.equal(systems.length,condition.profile==='off'?0:1);
        if (condition.system_message) assert.equal(systems[0]?.content,condition.system_message);
      }
    }
  }
  assert.equal(identities.size,24);
});
