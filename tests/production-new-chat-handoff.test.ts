import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { openDatabase } from '../src/server/storage/database.ts';
import { Repository } from '../src/server/storage/repository.ts';
import { GenerationService } from '../src/server/generation.ts';
import { LMStudioProvider } from '../src/server/provider.ts';
import { createAppServer } from '../src/server/http.ts';
import type { ProductionHandoffLevel } from '../src/shared/production-new-chat-handoff.ts';

function seed() {
  const db = openDatabase(':memory:');
  const repo = new Repository(db);
  const conversationId = repo.createConversation('引継ぎ元').conversation_id;
  for (let index = 1; index <= 4; index += 1) {
    const user = repo.addUserTurn(conversationId, `User ${index} の理解`);
    repo.addMockRun(conversationId, user.turn_id, index === 4 ? 'Target全文: 固有マーカーを説明する回答' : `Assistant ${index} の説明`);
  }
  const target = repo.listTurns(conversationId).at(-1)!;
  const markerText = '固有マーカー';
  const start = target.content.indexOf(markerText);
  const highlight = repo.createHighlight(conversationId, {
    turn_id: target.turn_id,
    start_offset: start,
    end_offset: start + markerText.length,
    source_text: markerText,
    target_text: markerText,
    color: 'blue',
    note: '',
  });
  const keep = repo.questionKeeps.create(conversationId, {
    highlight_id: highlight.highlight_id,
    question_draft: 'これは何ですか？',
    memo: '保持対象',
  });
  return { db, repo, conversationId, target, markerText, highlight, keep };
}

test('Turn-based Handoff Previewはlevel別範囲・順序・roleを返し、Conversationを作らない', () => {
  const fixture = seed();
  try {
    const beforeConversations = fixture.repo.listConversations();
    const beforeDetail = fixture.repo.detail(fixture.conversationId);
    const expectedCounts: Record<ProductionHandoffLevel, number> = { none: 0, minimal: 2, standard: 4, wide: 6 };
    for (const level of ['none', 'minimal', 'standard', 'wide'] as const) {
      const preview = fixture.repo.previewNewChatHandoff(fixture.conversationId, fixture.keep.keep_id, 'これは何ですか？', level);
      assert.equal(preview.handoff_level, level);
      assert.equal(preview.included_turns.length, expectedCounts[level]);
      assert.deepEqual(preview.included_turn_ids, preview.included_turns.map(turn => turn.turn_id));
      assert(preview.included_turns.every((turn, index, turns) => index === 0 || turns[index - 1].turn_number < turn.turn_number));
      if (level === 'none') {
        assert(!preview.first_user_message.includes('前の会話からの参考文脈'));
      } else {
        assert.equal(preview.included_turn_ids.at(-1), fixture.target.turn_id);
        assert.match(preview.first_user_message, /\[T7 \/ User\]/);
        assert.match(preview.first_user_message, /\[T8 \/ Assistant \/ Target\]/);
        assert.equal(preview.first_user_message.split(fixture.target.content).length - 1, 1);
      }
      assert.match(preview.first_user_message, /## 質問対象\n\n固有マーカー/);
      assert.match(preview.first_user_message, /## 質問\n\nこれは何ですか？/);
    }
    assert.deepEqual(fixture.repo.listConversations(), beforeConversations);
    assert.deepEqual(fixture.repo.detail(fixture.conversationId), beforeDetail);
    assert.deepEqual(fixture.repo.questionKeeps.get(fixture.conversationId, fixture.keep.keep_id), fixture.keep);
  } finally { fixture.db.close(); }
});

test('Conversation先頭では前Turnをclampし、未来Turnを含めない', () => {
  const fixture = seed();
  try {
    const firstAssistant = fixture.repo.listTurns(fixture.conversationId)[1];
    const markerText = 'Assistant';
    const highlight = fixture.repo.createHighlight(fixture.conversationId, {
      turn_id: firstAssistant.turn_id,
      start_offset: 0,
      end_offset: markerText.length,
      source_text: markerText,
      target_text: markerText,
      color: 'green',
      note: '',
    });
    const keep = fixture.repo.questionKeeps.create(fixture.conversationId, { highlight_id: highlight.highlight_id, question_draft: '先頭付近', memo: '' });
    const preview = fixture.repo.previewNewChatHandoff(fixture.conversationId, keep.keep_id, '先頭付近', 'wide');
    assert.deepEqual(preview.included_turns.map(turn => turn.turn_number), [1, 2]);
    assert.equal(preview.included_turn_ids.at(-1), firstAssistant.turn_id);
    assert(!preview.first_user_message.includes('User 2 の理解'));
  } finally { fixture.db.close(); }
});

test('装飾境界Markerは表示用target_textとmodel用source_textを分離しsnapshotへ両方残す', () => {
  const fixture = seed();
  try {
    const user = fixture.repo.addUserTurn(fixture.conversationId, '装飾境界を確認する');
    fixture.repo.addMockRun(fixture.conversationId, user.turn_id, '説明では **干渉**は重要です。');
    const target = fixture.repo.listTurns(fixture.conversationId).at(-1)!;
    const sourceText = '干渉**は';
    const targetText = '干渉は';
    const start = target.content.indexOf('干渉');
    const highlight = fixture.repo.createHighlight(fixture.conversationId, {
      turn_id: target.turn_id,
      start_offset: start,
      end_offset: start + sourceText.length,
      source_text: sourceText,
      target_text: targetText,
      color: 'yellow',
      note: '',
    });
    const keep = fixture.repo.questionKeeps.create(fixture.conversationId, {
      highlight_id: highlight.highlight_id,
      question_draft: 'なぜ重要ですか？',
      memo: '',
    });
    const preview = fixture.repo.previewNewChatHandoff(fixture.conversationId, keep.keep_id, 'なぜ重要ですか？', 'standard');
    assert.equal(preview.marker_source_text, sourceText);
    assert.equal(preview.marker_target_text, targetText);
    assert.match(preview.first_user_message, /## 質問対象\n\n干渉\*\*は/);
    assert.match(preview.display_first_user_message, /## 質問対象\n\n干渉は/);
    assert.equal(preview.display_first_user_message.split('## 質問対象\n\n')[1].split('\n\n## 質問')[0], targetText);

    const run = fixture.repo.prepareChat(fixture.conversationId, 'なぜ重要ですか？', 'test-model', crypto.randomUUID(), keep.keep_id, true, 'standard');
    const messages = run.request_snapshot.messages as Array<{ role: string; content: string }>;
    assert.match(messages[1].content, /## 質問対象\n\n干渉\*\*は/);
    assert.equal(run.reference_snapshot?.source_text, sourceText);
    assert.equal(run.reference_snapshot?.target_text, targetText);
  } finally { fixture.db.close(); }
});

test('引継ぎしない・少なめ・標準・多めを2-message本番requestへ固定する', () => {
  const expectedCounts: Record<ProductionHandoffLevel, number> = { none: 0, minimal: 2, standard: 4, wide: 6 };
  for (const level of ['none', 'minimal', 'standard', 'wide'] as const) {
    const fixture = seed();
    try {
      const run = fixture.repo.prepareChat(fixture.conversationId, '条件確認', 'test-model', crypto.randomUUID(), fixture.keep.keep_id, true, level);
      const messages = run.request_snapshot.messages as Array<{ role: string; content: string }>;
      assert.deepEqual(messages.map(message => message.role), ['system', 'user']);
      assert.equal(messages.length, 2);
      assert.equal(run.reference_snapshot?.handoff_level, level);
      assert.equal(run.reference_snapshot?.included_turn_ids?.length, expectedCounts[level]);
      assert.equal(messages[1].content.split(fixture.target.content).length - 1, level === 'none' ? 0 : 1);
      assert(!messages[1].content.includes('User 1 の理解'));
      if (level === 'none') assert(!messages[1].content.includes('前の会話からの参考文脈'));
    } finally { fixture.db.close(); }
  }
});

async function withProvider(mode: 'success' | 'failure', callback: (fixture: ReturnType<typeof seed> & { service: GenerationService; requests: any[] }) => Promise<void>) {
  const fixture = seed();
  const requests: any[] = [];
  const upstream = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));
    if (mode === 'failure') { response.writeHead(503); response.end('provider unavailable'); return; }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: '引継ぎ回答' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const service = new GenerationService(fixture.repo, new LMStudioProvider(`http://127.0.0.1:${(upstream.address() as { port: number }).port}/v1`));
  try { await callback({ ...fixture, service, requests }); }
  finally {
    upstream.closeAllConnections();
    await new Promise<void>(resolve => upstream.close(() => resolve()));
    fixture.db.close();
  }
}

test('明示送信で初めてConversationを作り、system+userだけを送って回答・参照を保存しKeepを維持する', async () => withProvider('success', async fixture => {
  const beforeKeep = fixture.repo.questionKeeps.get(fixture.conversationId, fixture.keep.keep_id);
  const run = fixture.repo.prepareChat(fixture.conversationId, '編集した質問', 'test-model', crypto.randomUUID(), fixture.keep.keep_id, true, 'standard');
  assert.equal(fixture.repo.listConversations().length, 2);
  assert.notEqual(run.conversation_id, fixture.conversationId);
  assert.equal(run.context_strategy, 'turn_based_handoff');
  const messages = run.request_snapshot.messages as Array<{ role: string; content: string }>;
  assert.deepEqual(messages.map(message => message.role), ['system', 'user']);
  assert.equal(messages.length, 2);
  assert.equal(run.reference_snapshot?.source_conversation_id, fixture.conversationId);
  assert.equal(run.reference_snapshot?.source_turn_id, fixture.target.turn_id);
  assert.equal(run.reference_snapshot?.source_highlight_id, fixture.highlight.highlight_id);
  assert.equal(run.reference_snapshot?.source_text, fixture.markerText);
  assert.equal(run.reference_snapshot?.handoff_level, 'standard');
  assert.deepEqual(run.reference_snapshot?.included_turn_ids, fixture.repo.listTurns(fixture.conversationId).slice(-4).map(turn => turn.turn_id));
  const preparedTurns = fixture.repo.listTurns(run.conversation_id);
  assert.equal(preparedTurns[0].content, messages[1].content);
  assert.deepEqual(preparedTurns.map(turn => [turn.role, turn.status]), [['user', 'completed'], ['assistant', 'generating']]);
  assert.deepEqual(fixture.repo.questionKeeps.get(fixture.conversationId, fixture.keep.keep_id), beforeKeep);

  await fixture.service.execute(run, () => {});
  assert.deepEqual(fixture.requests, [run.request_snapshot]);
  assert.equal(fixture.repo.run(run.conversation_id, run.run_id).outcome, 'succeeded');
  const completedTurns = fixture.repo.listTurns(run.conversation_id);
  assert.equal(completedTurns[1].status, 'completed');
  assert.equal(completedTurns[1].content, '引継ぎ回答');
  assert.deepEqual(fixture.repo.questionKeeps.get(fixture.conversationId, fixture.keep.keep_id), beforeKeep);
}));

test('モデル失敗時も作成済みConversationとUser Turnを保持し、自動retryせずKeepを維持する', async () => withProvider('failure', async fixture => {
  const beforeKeep = fixture.repo.questionKeeps.get(fixture.conversationId, fixture.keep.keep_id);
  const run = fixture.repo.prepareChat(fixture.conversationId, '失敗確認', 'test-model', crypto.randomUUID(), fixture.keep.keep_id, true, 'minimal');
  await fixture.service.execute(run, () => {});
  assert.equal(fixture.requests.length, 1);
  assert.equal(fixture.repo.listConversations().length, 2);
  const detail = fixture.repo.detail(run.conversation_id);
  assert.equal(detail.turns[0].role, 'user');
  assert.equal(detail.turns[0].status, 'completed');
  assert.equal(detail.turns[1].role, 'assistant');
  assert.equal(detail.turns[1].status, 'failed');
  assert.equal(detail.runs[0].outcome, 'failed');
  assert.deepEqual(fixture.repo.questionKeeps.get(fixture.conversationId, fixture.keep.keep_id), beforeKeep);
}));

test('HTTP Previewは非書込みで、handoff-newだけがConversationを作る', async () => withProvider('success', async fixture => {
  const app = createAppServer(fixture.repo, 'dist', fixture.service);
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  const base = `http://127.0.0.1:${(app.address() as { port: number }).port}`;
  try {
    const preview = await fetch(`${base}/api/conversations/${fixture.conversationId}/question-keeps/${fixture.keep.keep_id}/handoff-preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_question: 'API質問', handoff_level: 'standard' }),
    });
    assert.equal(preview.status, 200);
    assert.equal(fixture.repo.listConversations().length, 1);
    const send = await fetch(`${base}/api/conversations/${fixture.conversationId}/question-keeps/${fixture.keep.keep_id}/handoff-new`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_question: 'API質問', handoff_level: 'standard', model: 'test-model', request_id: crypto.randomUUID() }),
    });
    assert.equal(send.status, 201);
    const events = (await send.text()).trim().split('\n').map(line => JSON.parse(line));
    assert.equal(events[0].type, 'prepared');
    assert.equal(events.at(-1).outcome, 'succeeded');
    assert.equal(fixture.repo.listConversations().length, 2);
  } finally {
    app.closeAllConnections();
    await new Promise<void>(resolve => app.close(() => resolve()));
  }
}));
