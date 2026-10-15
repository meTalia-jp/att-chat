import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/server/storage/database.ts';
import { Repository } from '../src/server/storage/repository.ts';
import { GenerationService } from '../src/server/generation.ts';
import { LMStudioProvider, type GenerationDiagnostics } from '../src/server/provider.ts';
import { immediateAskSystemPrompt } from '../src/shared/production-immediate-ask.ts';
import { keepContextSystemPrompt } from '../src/shared/production-keep-context.ts';
import { productionHandoffSystemPrompt } from '../src/shared/production-new-chat-handoff.ts';
import { addExperimentalSystemPrompt, normalizeExperimentalSystemPrompt } from '../src/shared/system-prompt-experiment.ts';
import { SYSTEM_PROFILE_PRESETS, SYSTEM_PROFILE_PRESET_OPTIONS } from '../src/shared/system-profile-presets.ts';
import { addUserProfileSystemMessage, buildUserProfileSystemMessage, normalizeExperimentalUserProfile } from '../src/shared/user-profile-experiment.ts';
import { canonicalizeSystemMessages } from '../src/shared/system-message-canonicalization.ts';
import { expertQuestionPrefix, expertQuestionIntent, applyMarkerQuestionPrefix } from '../src/shared/marker-question-prefix.ts';

const experiment = 'すべての回答の先頭に必ず「SYSTEM-TEST」と書いてください。';
const profile = '対象分野についてほとんど知識がありません。\n専門用語は初出時に短く説明してください。';

test('Production System Profile定義はv0.6本文と一致しStandardを含まない', async () => {
  const { systemProfileTexts } = await import('../src/laboratory/system-profile-comparison-v06.ts');
  assert.deepEqual(SYSTEM_PROFILE_PRESET_OPTIONS.map(option => option.preset), ['off','concise','thinking_support','non_accommodating','custom']);
  assert.equal(SYSTEM_PROFILE_PRESETS.concise.text, systemProfileTexts.concise);
  assert.equal(SYSTEM_PROFILE_PRESETS.thinking_support.text, systemProfileTexts.thinking_support);
  assert.equal(SYSTEM_PROFILE_PRESETS.non_accommodating.text, systemProfileTexts.non_accommodating);
  assert.equal(SYSTEM_PROFILE_PRESET_OPTIONS.some(option => option.preset === ('standard' as never)), false);
});

test('全Production生成経路が各System Profile本文を正確にrequest snapshotへ保存する', () => {
  for (const preset of ['concise','thinking_support','non_accommodating'] as const) {
    const systemProfile = SYSTEM_PROFILE_PRESETS[preset].text;
    const normal = normalFixture();
    try {
      const run = normal.repo.prepareChat(normal.conversationId, '質問', 'model', crypto.randomUUID(), undefined, false, undefined, undefined, systemProfile);
      assert.equal((run.request_snapshot.messages as Array<{role:string;content:string}>)[0].content, systemProfile);
    } finally { normal.db.close(); }

    for (const kind of ['immediate','keep','handoff'] as const) {
      const fixture = markerFixture();
      try {
        let run;
        if (kind === 'immediate') {
          run = fixture.repo.prepareImmediateAsk(fixture.conversationId, '', [{ highlight_id:fixture.highlight.highlight_id, prefix:'質問', question_text:'何ですか？' }], 'model', crypto.randomUUID(), systemProfile);
        } else {
          const keep = fixture.repo.questionKeeps.create(fixture.conversationId, { highlight_id:fixture.highlight.highlight_id, question_draft:'何ですか？' });
          const handoff = kind === 'handoff';
          run = fixture.repo.prepareChat(fixture.conversationId, '何ですか？', 'model', crypto.randomUUID(), keep.keep_id, handoff, handoff ? 'standard' : undefined, handoff ? undefined : 'standard', systemProfile);
        }
        const messages = run.request_snapshot.messages as Array<{role:string;content:string}>;
        assert.deepEqual(messages.map(message => message.role), ['system','user']);
        const context = kind === 'immediate' ? immediateAskSystemPrompt : kind === 'handoff' ? productionHandoffSystemPrompt : keepContextSystemPrompt;
        assertSystemOrder(messages[0].content, context, systemProfile);
      } finally { fixture.db.close(); }
    }
  }
});

function normalFixture() {
  const db = openDatabase(':memory:');
  const repo = new Repository(db);
  const conversationId = repo.createConversation('System Prompt').conversation_id;
  return { db, repo, conversationId };
}

function markerFixture() {
  const fixture = normalFixture();
  const user = fixture.repo.addUserTurn(fixture.conversationId, 'Markerを作る');
  const assistant = fixture.repo.addMockRun(fixture.conversationId, user.turn_id, 'SystemPromptMarker を説明します。').assistant;
  const target = 'SystemPromptMarker';
  const start = assistant.content.indexOf(target);
  const highlight = fixture.repo.createHighlight(fixture.conversationId, {
    turn_id: assistant.turn_id,
    start_offset: start,
    end_offset: start + target.length,
    source_text: target,
    target_text: target,
    color: 'yellow',
    note: '',
  });
  return { ...fixture, assistant, highlight };
}

test('System Prompt OFFと空文字は通常Chatの既存requestを変えない', () => {
  for (const prompt of [undefined, '', '   \n']) {
    const fixture = normalFixture();
    try {
      const run = fixture.repo.prepareChat(fixture.conversationId, '質問', 'model', crypto.randomUUID(), undefined, false, undefined, undefined, prompt);
      assert.deepEqual(run.request_snapshot.messages, [{ role:'user', content:'質問' }]);
    } finally { fixture.db.close(); }
  }
});

test('System Prompt ONは通常Chatの先頭へ追加されrequest snapshotへ保存される', () => {
  const fixture = normalFixture();
  try {
    const run = fixture.repo.prepareChat(fixture.conversationId, '質問', 'model', crypto.randomUUID(), undefined, false, undefined, undefined, experiment);
    assert.deepEqual(run.request_snapshot.messages, [
      { role:'system', content:experiment },
      { role:'user', content:'質問' },
    ]);
  } finally { fixture.db.close(); }
});

test('Immediate Askは既存system contextを維持して実験Promptを追加する', () => {
  const fixture = markerFixture();
  try {
    const run = fixture.repo.prepareImmediateAsk(fixture.conversationId, '', [{ highlight_id:fixture.highlight.highlight_id, prefix:'質問', question_text:'何ですか？' }], 'model', crypto.randomUUID(), experiment);
    const messages = run.request_snapshot.messages as Array<{role:string;content:string}>;
    assert.deepEqual(messages.map(message => message.role), ['system','user']);
    assertSystemOrder(messages[0].content, immediateAskSystemPrompt, experiment);
    assert.match(messages[1].content, /SystemPromptMarker/);
  } finally { fixture.db.close(); }
});

test('Keep Contextも既存system contextを置換せず実験Promptを追加する', () => {
  const fixture = markerFixture();
  try {
    const keep = fixture.repo.questionKeeps.create(fixture.conversationId, { highlight_id:fixture.highlight.highlight_id, question_draft:'何ですか？' });
    const run = fixture.repo.prepareChat(fixture.conversationId, '何ですか？', 'model', crypto.randomUUID(), keep.keep_id, false, undefined, 'standard', experiment);
    const messages = run.request_snapshot.messages as Array<{role:string;content:string}>;
    assert.deepEqual(messages.map(message => message.role), ['system','user']);
    assertSystemOrder(messages[0].content, keepContextSystemPrompt, experiment);
  } finally { fixture.db.close(); }
});

test('Prompt正規化とsystem message挿入位置を固定する', () => {
  assert.equal(normalizeExperimentalSystemPrompt('  A\r\nB  '), 'A\nB');
  assert.equal(normalizeExperimentalSystemPrompt('  '), null);
  assert.throws(() => normalizeExperimentalSystemPrompt(42), /不正/);
  const messages = addExperimentalSystemPrompt([
    { role:'system', content:'既存1' },
    { role:'system', content:'既存2' },
    { role:'user', content:'質問' },
  ], experiment);
  assert.deepEqual(messages.map(message => message.content), ['既存1','既存2',experiment,'質問']);
});

test('User Profile OFFと空文字は通常Chatの既存requestを変えない', () => {
  for (const value of [undefined, '', '   \n']) {
    const fixture = normalFixture();
    try {
      const run = fixture.repo.prepareChat(fixture.conversationId, '質問', 'model', crypto.randomUUID(), undefined, false, undefined, undefined, undefined, value);
      assert.deepEqual(run.request_snapshot.messages, [{ role:'user', content:'質問' }]);
    } finally { fixture.db.close(); }
  }
});

test('User Profile ONはwrapper付きsystem messageとして通常Chatへ追加される', () => {
  const fixture = normalFixture();
  try {
    const run = fixture.repo.prepareChat(fixture.conversationId, '質問', 'model', crypto.randomUUID(), undefined, false, undefined, undefined, undefined, profile);
    const messages = run.request_snapshot.messages as Array<{role:string;content:string}>;
    assert.deepEqual(messages.map(message => message.role), ['system','user']);
    assert.equal(messages[0].content, buildUserProfileSystemMessage(profile));
    assert.match(messages[0].content, /現在の質問内容を優先/);
    assert.match(messages[0].content, /過度な推測をしない/);
  } finally { fixture.db.close(); }
});

test('System PromptとUser Profileを同時に使っても独立した順序を維持する', () => {
  const fixture = normalFixture();
  try {
    const run = fixture.repo.prepareChat(fixture.conversationId, '質問', 'model', crypto.randomUUID(), undefined, false, undefined, undefined, experiment, profile);
    const messages = run.request_snapshot.messages as Array<{role:string;content:string}>;
    assert.deepEqual(messages.map(message => message.role), ['system','user']);
    assert.match(messages[0].content, /^# SYSTEM PROFILE\n/);
    assertSystemOrder(messages[0].content, experiment, profile);
  } finally { fixture.db.close(); }
});

test('Immediate Askは既存context、System Prompt、User Profileの順序を維持する', () => {
  const fixture = markerFixture();
  try {
    const run = fixture.repo.prepareImmediateAsk(fixture.conversationId, '', [{ highlight_id:fixture.highlight.highlight_id, prefix:'質問', question_text:'何ですか？' }], 'model', crypto.randomUUID(), experiment, profile);
    const messages = run.request_snapshot.messages as Array<{role:string;content:string}>;
    assert.deepEqual(messages.map(message => message.role), ['system','user']);
    assert.match(messages[0].content, /^# ATT-CHAT CONTEXT\n/);
    assertSystemOrder(messages[0].content, immediateAskSystemPrompt, experiment, profile);
  } finally { fixture.db.close(); }
});

test('Keep ContextとNew Chat HandoffにもUser Profileを追加し既存contextを維持する', () => {
  for (const newConversation of [false, true]) {
    const fixture = markerFixture();
    try {
      const keep = fixture.repo.questionKeeps.create(fixture.conversationId, { highlight_id:fixture.highlight.highlight_id, question_draft:'何ですか？' });
      const run = fixture.repo.prepareChat(fixture.conversationId, '何ですか？', 'model', crypto.randomUUID(), keep.keep_id, newConversation, newConversation ? 'standard' : undefined, newConversation ? undefined : 'standard', experiment, profile);
      const messages = run.request_snapshot.messages as Array<{role:string;content:string}>;
      assert.deepEqual(messages.map(message => message.role), ['system','user']);
      assertSystemOrder(messages[0].content, newConversation ? productionHandoffSystemPrompt : keepContextSystemPrompt, experiment, profile);
    } finally { fixture.db.close(); }
  }
});

test('User Profile正規化と既存system群の後への挿入を固定する', () => {
  assert.equal(normalizeExperimentalUserProfile('  A\r\nB  '), 'A\nB');
  assert.equal(normalizeExperimentalUserProfile('  '), null);
  assert.throws(() => normalizeExperimentalUserProfile(42), /不正/);
  const messages = addUserProfileSystemMessage([
    { role:'system', content:'既存Context' },
    { role:'system', content:'Model System Prompt' },
    { role:'user', content:'質問' },
  ], profile);
  assert.deepEqual(messages.map(message => message.content), ['既存Context','Model System Prompt',buildUserProfileSystemMessage(profile),'質問']);
});

function assertSystemOrder(content: string, ...parts: string[]) {
  let cursor = -1;
  for (const part of parts) {
    const next = content.indexOf(part);
    assert.ok(next > cursor, `system section order: ${part.slice(0, 30)}`);
    cursor = next;
  }
}

test('canonical systemは0件を作らず、1件を保持し、複数件を元順序で1件化する', () => {
  assert.deepEqual(canonicalizeSystemMessages([{ role:'user', content:'質問' }]), [{ role:'user', content:'質問' }]);
  assert.deepEqual(canonicalizeSystemMessages([
    { role:'system', content:'唯一のsystem' },
    { role:'user', content:'質問' },
  ]), [
    { role:'system', content:'唯一のsystem' },
    { role:'user', content:'質問' },
  ]);
  const multiple = canonicalizeSystemMessages([
    { role:'system', content:'内部A' },
    { role:'system', content:'内部B' },
    { role:'user', content:'質問' },
  ]);
  assert.deepEqual(multiple.map(message => message.role), ['system','user']);
  assert.equal(multiple[0].content, '内部A\n\n内部B');
});

test('canonical systemはContext、System Profile、User Profileを見出し付きで順序維持する', () => {
  const messages = canonicalizeSystemMessages([
    { role:'system', content:'内部Context' },
    { role:'user', content:'質問' },
  ], { systemProfile:experiment, userProfile:profile });
  assert.deepEqual(messages.map(message => message.role), ['system','user']);
  assert.match(messages[0].content, /^# ATT-CHAT CONTEXT\n/);
  assert.match(messages[0].content, /# SYSTEM PROFILE\n/);
  assert.match(messages[0].content, /# USER PROFILE\n/);
  assert.equal((messages[0].content.match(/USER PROFILE/g) ?? []).length, 1);
  assertSystemOrder(messages[0].content, '内部Context', experiment, profile);
});

class CapturingProvider extends LMStudioProvider {
  requests: Record<string, unknown>[] = [];
  override async generate(snapshot: Record<string, unknown>, _signal: AbortSignal, onText: (text: string) => void,
    onDiagnostics?: (diagnostics: GenerationDiagnostics) => void) {
    this.requests.push(structuredClone(snapshot));
    onText('回答');
    onDiagnostics?.({ finish_reason:'stop', completion_tokens:1, prompt_tokens:1, total_tokens:2,
      content_chars:2, reasoning_chars:0, duration_ms:1, terminal_chunk_received:true });
  }
}

test('全Production経路でcanonical snapshotとProvider requestが一致する', async () => {
  for (const kind of ['normal','immediate','keep','handoff'] as const) {
    const fixture = kind === 'normal' ? normalFixture() : markerFixture();
    try {
      let run;
      if (kind === 'normal') {
        run = fixture.repo.prepareChat(fixture.conversationId, '質問', 'model', crypto.randomUUID(), undefined, false, undefined, undefined, experiment, profile);
      } else if (kind === 'immediate') {
        const marked = fixture as ReturnType<typeof markerFixture>;
        run = marked.repo.prepareImmediateAsk(marked.conversationId, '', [{ highlight_id:marked.highlight.highlight_id, prefix:'質問', question_text:'何ですか？' }], 'model', crypto.randomUUID(), experiment, profile);
      } else {
        const marked = fixture as ReturnType<typeof markerFixture>;
        const keep = marked.repo.questionKeeps.create(marked.conversationId, { highlight_id:marked.highlight.highlight_id, question_draft:'何ですか？' });
        const handoff = kind === 'handoff';
        run = marked.repo.prepareChat(marked.conversationId, '何ですか？', 'model', crypto.randomUUID(), keep.keep_id, handoff,
          handoff ? 'standard' : undefined, handoff ? undefined : 'standard', experiment, profile);
      }
      const messages = run.request_snapshot.messages as Array<{role:string;content:string}>;
      assert.equal(messages.filter(message => message.role === 'system').length, 1);
      const provider = new CapturingProvider();
      await new GenerationService(fixture.repo, provider).execute(run, () => {});
      assert.deepEqual(provider.requests, [run.request_snapshot]);
    } finally { fixture.db.close(); }
  }
});

test('素人Marker質問は全質問経路で同じintentを既存canonical contextへ統合する', async () => {
  for (const kind of ['immediate','keep','handoff','quote'] as const) for (const profiles of [false,true]) {
    const fixture=markerFixture();
    try {
      const schema=fixture.db.prepare('SELECT sql FROM sqlite_master ORDER BY name').all();
      const question=expertQuestionPrefix+'その前提は成立しますか？';
      let run;
      if(kind==='immediate') run=fixture.repo.prepareImmediateAsk(fixture.conversationId,'', [{highlight_id:fixture.highlight.highlight_id,prefix:'質問',question_text:question}], 'model',crypto.randomUUID(),profiles?experiment:undefined,profiles?profile:undefined);
      else {
        const keep=fixture.repo.questionKeeps.create(fixture.conversationId,{highlight_id:fixture.highlight.highlight_id,question_draft:question});
        const saved=fixture.repo.questionKeeps.get(fixture.conversationId,keep.keep_id);
        assert.equal(saved.question_draft,question);
        run=fixture.repo.prepareChat(fixture.conversationId,saved.question_draft,'model',crypto.randomUUID(),keep.keep_id,kind!=='keep',kind==='handoff'?'standard':undefined,kind==='keep'?'standard':undefined,profiles?experiment:undefined,profiles?profile:undefined);
      }
      const messages=run.request_snapshot.messages as Array<{role:string;content:string}>;
      assert.deepEqual(messages.map(m=>m.role),['system','user']);
      assert.equal(messages[0].content.split(expertQuestionIntent).length-1,1);
      assert.ok(messages[1].content.includes(question));
      assert.equal(messages[1].content.includes(expertQuestionIntent),false,'internal intent is not user text');
      if(profiles)assertSystemOrder(messages[0].content,expertQuestionIntent,experiment,profile);
      assert.deepEqual(fixture.db.prepare('SELECT sql FROM sqlite_master ORDER BY name').all(),schema);
      const provider=new CapturingProvider();await new GenerationService(fixture.repo,provider).execute(run,()=>{});
      assert.deepEqual(provider.requests,[run.request_snapshot]);
      assert.equal(fixture.repo.listTurns(run.conversation_id).find(t=>t.turn_id===run.user_turn_id)!.content.includes(expertQuestionIntent),false);
    } finally {fixture.db.close();}
  }
});

test('既存prefix・未選択・通常Chat・引用中の文言は素人intentを追加しない', () => {
  for(const [prefix,text] of [['質問','質問です。 '],['しかし…','ただ、疑問が残ります。 '],['意見','私の考えでは、']] as const){
    assert.equal(applyMarkerQuestionPrefix('本文',prefix),'本文'+text);
    const fixture=markerFixture();
    try {
      const run=fixture.repo.prepareImmediateAsk(fixture.conversationId,expertQuestionPrefix,[{highlight_id:fixture.highlight.highlight_id,prefix,question_text:text+'確認'}],'model',crypto.randomUUID());
      assert.equal((run.request_snapshot.messages as Array<{content:string}>)[0].content,immediateAskSystemPrompt,'ordinary draft does not trigger intent');
    } finally {fixture.db.close();}
  }
  for(const text of ['確認', '「'+expertQuestionPrefix+'」という言葉', '引用中: '+expertQuestionPrefix]) {
    const fixture=markerFixture();
    try {
      const keep=fixture.repo.questionKeeps.create(fixture.conversationId,{highlight_id:fixture.highlight.highlight_id,question_draft:expertQuestionPrefix});
      const run=fixture.repo.prepareChat(fixture.conversationId,text,'model',crypto.randomUUID(),keep.keep_id,false,undefined,'standard');
      assert.equal((run.request_snapshot.messages as Array<{content:string}>)[0].content,keepContextSystemPrompt,'removed prefix in the current draft must not use the saved prefix');
    }finally{fixture.db.close();}
  }
  const normal=normalFixture();try {
    const run=normal.repo.prepareChat(normal.conversationId,expertQuestionPrefix+'通常会話','model',crypto.randomUUID());
    assert.deepEqual(run.request_snapshot.messages,[{role:'user',content:expertQuestionPrefix+'通常会話'}]);
  }finally{normal.db.close();}
  const base=[{role:'system',content:'元のcontext'},{role:'user',content:'引用: '+expertQuestionPrefix}];
  assert.deepEqual(canonicalizeSystemMessages(base,{markerQuestions:['未選択の質問']}),base);
  const mixed=canonicalizeSystemMessages(base,{markerQuestions:[expertQuestionPrefix+'A','普通の質問',expertQuestionPrefix+'B']});
  assert.equal(mixed.filter(m=>m.role==='system').length,1);
  assert.equal(mixed[0].content.split(expertQuestionIntent).length-1,1);
  assert.equal(mixed[1].content,base[1].content);
  assert.equal(applyMarkerQuestionPrefix(expertQuestionPrefix+'本文','しかし…'),'本文ただ、疑問が残ります。 ');
});
