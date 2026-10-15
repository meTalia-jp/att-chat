import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUserProfileSystemMessage } from '../src/shared/user-profile-experiment.ts';
import {
  buildUserProfileStrengthMessage,
  buildUserProfileStrengthRequest,
  userProfileStrengthConditions,
  userProfileStrengthModels,
  userProfileStrengthProfiles,
  userProfileStrengthQuestion,
} from '../src/laboratory/user-profile-strength-v02.ts';

test('2モデル x OFF + 6条件を固定し質問とProfile本文を変えない', () => {
  assert.equal(userProfileStrengthModels.length,2);
  assert.equal(userProfileStrengthConditions.length,7);
  assert.deepEqual(userProfileStrengthConditions.map(item=>item.condition_id),[
    'OFF','beginner-weak','beginner-standard','beginner-strong','expert-weak','expert-standard','expert-strong',
  ]);
  for (const condition of userProfileStrengthConditions) {
    const request=buildUserProfileStrengthRequest(userProfileStrengthModels[0],condition);
    assert.equal(request.messages.at(-1)?.content,userProfileStrengthQuestion);
    assert.equal(request.temperature,0);assert.equal(request.max_tokens,4096);
    if (condition.audience==='off') assert.deepEqual(request.messages,[{role:'user',content:userProfileStrengthQuestion}]);
    else assert.equal(condition.profile_text,userProfileStrengthProfiles[condition.audience]);
  }
});

test('Weak / Standard / StrongはProfile本文を変えずwrapperだけを変える', () => {
  for (const audience of ['beginner','expert'] as const) {
    const profile=userProfileStrengthProfiles[audience];
    const weak=buildUserProfileStrengthMessage('weak',profile), standard=buildUserProfileStrengthMessage('standard',profile), strong=buildUserProfileStrengthMessage('strong',profile);
    assert.notEqual(weak,standard);assert.notEqual(standard,strong);assert.notEqual(weak,strong);
    for (const value of [weak,standard,strong]) { assert.match(value,/^USER PROFILE/);assert.equal(value.split(profile).length-1,1); }
    assert.equal(standard,buildUserProfileSystemMessage(profile));
    assert.match(weak,/必要に応じて/);assert.match(strong,/明確に反映/);
  }
});

test('request snapshotは送信するmodel・strength・system・固定質問を追跡できる', () => {
  for (const model of userProfileStrengthModels) for (const condition of userProfileStrengthConditions) {
    const request=buildUserProfileStrengthRequest(model,condition);
    assert.equal(request.model,model);
    assert.equal(request.messages.filter(message=>message.role==='system').length,condition.strength==='off'?0:1);
    if (condition.system_message) assert.equal(request.messages[0].content,condition.system_message);
  }
});
