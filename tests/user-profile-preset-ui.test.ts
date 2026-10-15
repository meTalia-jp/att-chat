import test from 'node:test';
import assert from 'node:assert/strict';
import { userProfilePresetTexts } from '../src/laboratory/user-profile-preset-v03.ts';
import { practicalProfileTexts } from '../src/laboratory/user-profile-practical-v04.ts';
import {
  USER_PROFILE_PRESETS,
  USER_PROFILE_PRESET_OPTIONS,
  userProfilePresetText,
} from '../src/shared/user-profile-presets.ts';

test('Production Presetはv0.3 Beginner/Expertとv0.4 Revised Practicalを正本にする', () => {
  assert.equal(USER_PROFILE_PRESETS.beginner.text,userProfilePresetTexts.beginner);
  assert.equal(USER_PROFILE_PRESETS.practical.text,practicalProfileTexts.revised);
  assert.equal(USER_PROFILE_PRESETS.expert.text,userProfilePresetTexts.expert);
  assert.deepEqual(USER_PROFILE_PRESET_OPTIONS.map(item=>item.preset),[
    'off','beginner','practical','expert','custom',
  ]);
});

test('OFFは空、Presetは固定本文、Customは編集中本文を維持する', () => {
  assert.equal(userProfilePresetText('off','下書き'),'');
  assert.equal(userProfilePresetText('beginner','下書き'),USER_PROFILE_PRESETS.beginner.text);
  assert.equal(userProfilePresetText('practical','下書き'),USER_PROFILE_PRESETS.practical.text);
  assert.equal(userProfilePresetText('expert','下書き'),USER_PROFILE_PRESETS.expert.text);
  assert.equal(userProfilePresetText('custom','下書き'),'下書き');
});
