import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSystemProfileRequest,
  systemProfileConditions,
  systemProfileMatrix,
  systemProfileModels,
  systemProfileQuestions,
  systemProfileTexts,
} from '../src/laboratory/system-profile-comparison-v06.ts';

test('2モデル x 3問題 x 5 System Profileの30条件を固定する', () => {
  assert.deepEqual(systemProfileModels,[
    'google/gemma-4-26b-a4b-qat',
    'qwen/qwen3.6-35b-a3b',
  ]);
  assert.deepEqual(Object.keys(systemProfileQuestions),['explanation','judgment','design']);
  assert.deepEqual(systemProfileConditions.map(item => item.system_profile),[
    'off','standard','concise','thinking_support','non_accommodating',
  ]);
  assert.equal(systemProfileMatrix().length,30);
  assert.equal(new Set(systemProfileMatrix().map(item =>
    `${item.model}|${item.subject}|${item.condition.system_profile}`)).size,30);
});

test('System Profile本文はUser Profileの役割を混ぜず指定本文を保持する', () => {
  assert.equal(systemProfileTexts.standard,`現在の質問内容を優先し、必要な情報を適切な詳しさで回答してください。

特定の回答スタイルを過度に優先せず、
質問の内容と文脈に応じて自然に回答してください。`);
  assert.match(systemProfileTexts.concise,/まず重要な結論や要点/);
  assert.match(systemProfileTexts.thinking_support,/ユーザーがその先を考えられる材料/);
  assert.match(systemProfileTexts.non_accommodating,/反対すること自体を目的にはしない/);
  for (const text of Object.values(systemProfileTexts)) {
    assert.doesNotMatch(text,/初心者|専門家|専門用語を使わ|難易度/);
  }
});

test('OFFではsystemなし、他条件はsystem + userだけを実送信snapshotにする', () => {
  for (const item of systemProfileMatrix()) {
    const request=buildSystemProfileRequest(item.model,item.subject,item.condition);
    assert.equal(request.model,item.model);
    assert.equal(request.temperature,0);
    assert.equal(request.max_tokens,4096);
    assert.equal(request.stream,true);
    assert.deepEqual(request.stream_options,{include_usage:true});
    if (item.condition.system_profile === 'off') {
      assert.deepEqual(request.messages,[
        {role:'user',content:systemProfileQuestions[item.subject]},
      ]);
    } else {
      assert.deepEqual(request.messages,[
        {role:'system',content:item.condition.system_message},
        {role:'user',content:systemProfileQuestions[item.subject]},
      ]);
    }
  }
});

test('全条件でUser ProfileはOFFとして実験metadataに固定できる', () => {
  for (const item of systemProfileMatrix()) {
    assert.equal(item.condition.system_profile_text,item.condition.system_message);
    assert.notEqual(item.condition.system_profile,'custom');
  }
});
