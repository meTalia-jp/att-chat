import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase, migrate } from '../src/server/storage/database.ts';
import { Repository } from '../src/server/storage/repository.ts';

function fixture(fn: (db: DatabaseSync, repo: Repository) => void) { const db = openDatabase(':memory:'); try { fn(db, new Repository(db)); } finally { db.close(); } }
export function tempArea() {
  const dir = mkdtempSync(join(tmpdir(), 'attchat-1a-'));
  return { dir, path: join(dir, 'test.sqlite'), clean: () => { const target = resolve(dir); if (!target.startsWith(resolve(tmpdir()) + sep + 'attchat-1a-')) throw new Error('Unsafe test cleanup path'); rmSync(target, { recursive: true, force: true }); } };

}

test('Conversation作成・一覧・取得、空タイトル拒否', () => fixture((db, repo) => {
  const c = repo.createConversation('保存テスト'); assert.equal(repo.getConversation(c.conversation_id).title, '保存テスト'); assert.equal(repo.listConversations().length, 1); assert.throws(() => repo.createConversation(' '));
}));
test('Turn保存、LF正規化、sequence_no順序、絵文字保持', () => fixture((db, repo) => {
  const c = repo.createConversation('c'); const a = repo.addUserTurn(c.conversation_id, '一行\r\n😀e\u0301\r末尾'); const b = repo.addUserTurn(c.conversation_id, '二番目');
  assert.equal(a.content, '一行\n😀e\u0301\n末尾'); assert.equal(a.sequence_no, 0); assert.equal(b.sequence_no, 1); assert.deepEqual(repo.listTurns(c.conversation_id).map(t => t.turn_id), [a.turn_id, b.turn_id]);
}));
test('SQLでもsequence_noの重複を拒否', () => fixture((db, repo) => {
  const c = repo.createConversation('c'); repo.addUserTurn(c.conversation_id, 'first');
  assert.throws(() => db.prepare("INSERT INTO turns SELECT 'another-id', conversation_id, sequence_no, role, content, status, created_at, finalized_at FROM turns").run(), /UNIQUE/);
  assert.equal(repo.listTurns(c.conversation_id).length, 1);
}));
test('completedの本文・状態・ID・順序はSQL直接更新でも拒否', () => fixture((db, repo) => {
  const c = repo.createConversation('c'), t = repo.addUserTurn(c.conversation_id, '原文');
  for (const sql of ["content='改変'", "status='generating', finalized_at=NULL", "turn_id='new'", 'sequence_no=10']) assert.throws(() => db.exec(`UPDATE turns SET ${sql}`), /immutable/);
  assert.equal(repo.getTurn(c.conversation_id, t.turn_id).content, '原文');
}));
test('複数会話の分離・存在しない会話への追加拒否', () => fixture((db, repo) => {
  const a = repo.createConversation('a'), b = repo.createConversation('b'); const t = repo.addUserTurn(a.conversation_id, 'a-only');
  assert.equal(repo.listTurns(b.conversation_id).length, 0); assert.throws(() => repo.addMockRun(b.conversation_id, t.turn_id, 'wrong')); assert.throws(() => repo.addUserTurn('missing', 'no')); assert.equal(repo.listRuns(a.conversation_id).length, 0);
}));
test('GenerationRun最小項目・snapshot・仮回答を一括保存', () => fixture((db, repo) => {
  const c = repo.createConversation('c'), t = repo.addUserTurn(c.conversation_id, '質問'); const { run, assistant } = repo.addMockRun(c.conversation_id, t.turn_id, '仮回答');
  for (const key of ['run_id','conversation_id','user_turn_id','assistant_turn_id','retry_of_run_id','kind','model_id','provider','context_strategy','strategy_version','request_snapshot','started_at','finished_at','outcome','error']) assert(key in run, key);
  assert.equal(run.outcome, 'succeeded'); assert.equal(run.provider, 'mock'); assert.equal(run.assistant_turn_id, assistant.turn_id); assert.equal(run.error, null); assert.deepEqual(run.request_snapshot.messages, [{ role: 'user', content: '質問' }]);
  assert.throws(() => db.exec("UPDATE generation_runs SET request_snapshot='{}'"), /immutable/);
}));
test('retryは新しいassistant TurnとRun、Userと旧snapshotは維持', () => fixture((db, repo) => {
  const c = repo.createConversation('c'), t = repo.addUserTurn(c.conversation_id, '質問'), first = repo.addMockRun(c.conversation_id, t.turn_id, '回答1'); const next = repo.retryMockRun(c.conversation_id, first.run.run_id, '回答2');
  assert.notEqual(first.assistant.turn_id, next.assistant.turn_id); assert.notEqual(first.run.run_id, next.run.run_id); assert.equal(next.run.retry_of_run_id, first.run.run_id); assert.equal(next.run.user_turn_id, t.turn_id);
  assert.deepEqual(repo.listTurns(c.conversation_id).map(t => [t.sequence_no, t.content]), [[0,'質問'],[1,'回答1'],[2,'回答2']]); assert.equal(repo.listRuns(c.conversation_id)[0].request_snapshot.mock_response, '回答1');
}));
test('異なるUser発言・会話のretryを拒否', () => fixture((db, repo) => {
  const c = repo.createConversation('c'), t = repo.addUserTurn(c.conversation_id, '質問'), r = repo.addMockRun(c.conversation_id, t.turn_id, '回答'); const t2 = repo.addUserTurn(c.conversation_id, '別');
  assert.throws(() => repo.addMockRun(c.conversation_id, t2.turn_id, 'wrong', r.run.run_id)); assert.throws(() => repo.retryMockRun(repo.createConversation('別会話').conversation_id, r.run.run_id, 'wrong'));
  assert.equal(repo.listRuns(c.conversation_id).length, 1);
}));
test('Run INSERT失敗でassistant・sequence・会話更新をロールバック', () => fixture((db, repo) => {
  const c = repo.createConversation('c'), t = repo.addUserTurn(c.conversation_id, '質問'), before = repo.detail(c.conversation_id);
  db.exec("CREATE TRIGGER injected_failure BEFORE INSERT ON generation_runs BEGIN SELECT RAISE(ABORT,'test_storage_failure'); END");
  assert.throws(() => repo.addMockRun(c.conversation_id, t.turn_id, '失敗する回答'), /test_storage_failure/); assert.deepEqual(repo.detail(c.conversation_id), before);
  db.exec('DROP TRIGGER injected_failure'); assert.equal(repo.addMockRun(c.conversation_id, t.turn_id, '回復').assistant.sequence_no, 1);
}));
test('read-onlyエラーを成功扱いしない', () => fixture((db, repo) => { db.exec('PRAGMA query_only=ON'); assert.throws(() => repo.createConversation('no'), /readonly/); assert.equal(repo.listConversations().length, 0); }));
test('DB close→再openでも全データ復元、migration再実行は一度だけ', () => {
  const area = tempArea(); let db = openDatabase(area.path);
  try { let repo = new Repository(db); const c = repo.createConversation('persist'), t = repo.addUserTurn(c.conversation_id, '保持'); repo.addMockRun(c.conversation_id, t.turn_id, '回答'); const before = repo.detail(c.conversation_id); db.close(); db = openDatabase(area.path); repo = new Repository(db); assert.deepEqual(repo.detail(c.conversation_id), before); assert.equal(db.prepare('SELECT count(*) AS n FROM schema_migrations').get()!.n, 3); }
  finally { db.close(); area.clean(); }
});
test('未知migration版・checksum不一致で起動拒否', () => fixture((db) => { db.exec("UPDATE schema_migrations SET checksum='bad'"); assert.throws(() => migrate(db), /checksum/); db.exec('UPDATE schema_migrations SET version=99 WHERE version=2'); assert.throws(() => migrate(db), /version/); }));
test('migration失敗時に途中DDLを残さない', () => { const db = new DatabaseSync(':memory:'); try { db.exec('CREATE TABLE turns(existing TEXT)'); assert.throws(() => migrate(db)); assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name IN ('conversations','schema_migrations')").get()!.n, 0); } finally { db.close(); } });
test('DB制約が会話外参照・役割逆転を拒否', () => fixture((db, repo) => {
  const c = repo.createConversation('c'), b = repo.createConversation('b'), t = repo.addUserTurn(c.conversation_id, 'q'), pair = repo.addMockRun(c.conversation_id, t.turn_id, 'a');
  db.prepare("INSERT INTO turns SELECT 'new-assistant',conversation_id,sequence_no+1,role,content,status,created_at,finalized_at FROM turns WHERE turn_id=?").run(pair.assistant.turn_id);
  assert.throws(() => db.prepare("INSERT INTO generation_runs SELECT 'bad', ?,user_turn_id,'new-assistant',NULL,kind,model_id,provider,context_strategy,strategy_version,request_snapshot,started_at,finished_at,outcome,error FROM generation_runs WHERE run_id=?").run(b.conversation_id, pair.run.run_id), /FOREIGN KEY/);
  assert.throws(() => repo.addMockRun(c.conversation_id, pair.assistant.turn_id, 'invalid role'));
}));
