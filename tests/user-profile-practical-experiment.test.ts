import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUserProfileSystemMessage } from '../src/shared/user-profile-experiment.ts';
import { userProfilePresetTexts } from '../src/laboratory/user-profile-preset-v03.ts';
import {
  buildPracticalProfileRequest,
  practicalProfileConditions,
  practicalProfileModels,
  practicalProfileQuestions,
  practicalProfileTexts,
} from '../src/laboratory/user-profile-practical-v04.ts';

test('2モデル x 2問題 x 2 Practical本文の8条件を固定する', () => {
  assert.deepEqual(practicalProfileModels,[
    'google/gemma-4-26b-a4b-qat',
    'qwen/qwen3.6-35b-a3b',
  ]);
  assert.deepEqual(Object.keys(practicalProfileQuestions),['business','physics']);
  assert.deepEqual(practicalProfileConditions.map(item=>item.practical_variant),['current','revised']);
  assert.equal(practicalProfileModels.length * Object.keys(practicalProfileQuestions).length * practicalProfileConditions.length,8);
});

test('Currentはv0.3本文と一致しRevisedだけを比較対象にする', () => {
  assert.equal(practicalProfileTexts.current,userProfilePresetTexts.practical);
  assert.equal(practicalProfileTexts.revised,`この分野について基礎知識があります。
基本用語の説明は最小限で構いません。

理論は、実際の判断や利用に必要な範囲に留めてください。
具体的な利用場面、判断基準、注意点、実装・運用上の制約を優先してください。

必要な専門用語は使用して構いませんが、
理論的な深掘りより、実務でどう使うかを優先してください。`);
  for (const condition of practicalProfileConditions) {
    assert.equal(condition.profile_text,practicalProfileTexts[condition.practical_variant]);
    assert.equal(condition.system_message,buildUserProfileSystemMessage(condition.profile_text));
  }
});

test('request snapshotは本文以外のmodel・question・generation settingsを固定する', () => {
  const identities = new Set<string>();
  for (const model of practicalProfileModels) {
    for (const subject of Object.keys(practicalProfileQuestions) as Array<keyof typeof practicalProfileQuestions>) {
      for (const condition of practicalProfileConditions) {
        const request=buildPracticalProfileRequest(model,subject,condition);
        identities.add(`${model}|${subject}|${condition.practical_variant}`);
        assert.equal(request.model,model);
        assert.equal(request.temperature,0);
        assert.equal(request.max_tokens,4096);
        assert.equal(request.stream,true);
        assert.deepEqual(request.stream_options,{include_usage:true});
        assert.deepEqual(request.messages,[
          {role:'system',content:condition.system_message},
          {role:'user',content:practicalProfileQuestions[subject]},
        ]);
      }
    }
  }
  assert.equal(identities.size,8);
});
