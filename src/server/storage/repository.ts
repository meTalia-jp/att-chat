import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { transaction } from './database.ts';
import type { Conversation, Turn, GenerationRun, ConversationDetail } from '../../shared/contracts.ts';

export class InputError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status; } }
export function textInput(value: unknown, name: string, max = 100_000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0')) throw new InputError(`${name}が空、長すぎる、または不正です`);
  return value.replace(/\r\n?/g, '\n');
}
export class Repository {
  private db: DatabaseSync;
  constructor(db: DatabaseSync) { this.db = db; }
  listConversations(): Conversation[] { return this.db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC, conversation_id').all() as Conversation[]; }
  getConversation(id: string): Conversation {
    const c = this.db.prepare('SELECT * FROM conversations WHERE conversation_id=?').get(id) as Conversation | undefined;
    if (!c) throw new InputError('会話がありません', 404); return c;
  }
  createConversation(title: unknown): Conversation {
    const valid = textInput(title, 'タイトル', 200).trim();
    return transaction(this.db, () => {
      const id = randomUUID(), now = new Date().toISOString();
      this.db.prepare('INSERT INTO conversations VALUES(?,?,?,?)').run(id, valid, now, now);
      return this.getConversation(id);
    });
  }
  getTurn(conversationId: string, turnId: string): Turn {
    const t = this.db.prepare('SELECT * FROM turns WHERE conversation_id=? AND turn_id=?').get(conversationId, turnId) as Turn | undefined;
    if (!t) throw new InputError('発言がありません', 404); return t;
  }
  listTurns(id: string): Turn[] { this.getConversation(id); return this.db.prepare('SELECT * FROM turns WHERE conversation_id=? ORDER BY sequence_no').all(id) as Turn[]; }
  listRuns(id: string): GenerationRun[] {
    this.getConversation(id);
    return this.db.prepare('SELECT r.* FROM generation_runs r JOIN turns t ON t.turn_id=r.assistant_turn_id WHERE r.conversation_id=? ORDER BY t.sequence_no').all(id).map(row => ({ ...row, request_snapshot: JSON.parse(row.request_snapshot as string), error: row.error === null ? null : JSON.parse(row.error as string) })) as GenerationRun[];
  }
  detail(id: string): ConversationDetail { return { conversation: this.getConversation(id), turns: this.listTurns(id), runs: this.listRuns(id) }; }
  private insertTurn(id: string, role: 'user' | 'assistant', content: string): Turn {
    this.getConversation(id);
    const next = this.db.prepare('SELECT COALESCE(MAX(sequence_no),-1)+1 AS n FROM turns WHERE conversation_id=?').get(id)!.n as number;
    const turnId = randomUUID(), now = new Date().toISOString();
    this.db.prepare("INSERT INTO turns VALUES(?,?,?,?,?,'completed',?,?)").run(turnId, id, next, role, content, now, now);
    this.db.prepare('UPDATE conversations SET updated_at=? WHERE conversation_id=?').run(now, id);
    return this.getTurn(id, turnId);
  }
  addUserTurn(id: string, content: unknown): Turn { const value = textInput(content, '本文'); return transaction(this.db, () => { this.assertIdle(id); return this.insertTurn(id, 'user', value); }); }
  activeRun(id: string) { return this.listRuns(id).find(r => ['preparing', 'running'].includes(r.outcome)); }
  private assertIdle(id: string) { if (this.activeRun(id)) throw new InputError('この会話は生成中です', 409); }
  prepareChat(id: string, content: unknown, model: unknown, requestId: unknown) {
    const value = textInput(content, '本文'), modelId = textInput(model, 'モデル', 300);
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(requestId)) throw new InputError('request_idが不正です');
    return transaction(this.db, () => {
      if (this.db.prepare('SELECT 1 FROM chat_requests WHERE request_id=?').get(requestId)) throw new InputError('送信済みrequest_idです。再読込で確認してください', 409);
      this.assertIdle(id);
      const history = this.listTurns(id).filter(t => t.status === 'completed').map(t => ({ role: t.role, content: t.content }));
      const user = this.insertTurn(id, 'user', value);
      const turnId = randomUUID(), runId = randomUUID(), now = new Date().toISOString();
      const snapshot = { model: modelId, messages: [...history, { role: 'user', content: value }], stream: true, max_tokens: 2048 };
      this.db.prepare("INSERT INTO turns VALUES(?,?,?,?,?,'generating',?,NULL)").run(turnId, id, user.sequence_no + 1, 'assistant', '', now);
      this.db.prepare("INSERT INTO generation_runs VALUES(?,?,?,?,NULL,'chat',?,'lm_studio','completed_turns','1',?,?,NULL,'preparing',NULL)").run(runId, id, user.turn_id, turnId, modelId, JSON.stringify(snapshot), now);
      this.db.prepare('INSERT INTO chat_requests VALUES(?,?,?)').run(requestId, id, runId);
      return this.listRuns(id).find(r => r.run_id === runId)!;
    });
  }
  run(id: string, runId: string) {
    const run = this.listRuns(id).find(r => r.run_id === runId);
    if (!run) throw new InputError('Runがありません', 404); return run;
  }
  startRun(id: string, runId: string) {
    const result = this.db.prepare("UPDATE generation_runs SET outcome='running' WHERE run_id=? AND conversation_id=? AND outcome='preparing'").run(runId, id);
    if (result.changes !== 1) throw new InputError('Runを開始できません', 409);
  }
  checkpoint(id: string, runId: string, content: string) {
    const r = this.run(id, runId);
    if (!['preparing','running'].includes(r.outcome)) throw new InputError('Runは終了済みです', 409);
    this.db.prepare("UPDATE turns SET content=? WHERE turn_id=? AND status='generating'").run(content.replace(/\r\n?/g, '\n'), r.assistant_turn_id);
  }
  finishRun(id: string, runId: string, outcome: 'succeeded' | 'failed' | 'cancelled' | 'interrupted', content: string, error: Record<string, unknown> | null = null) {
    return transaction(this.db, () => {
      const r = this.run(id, runId);
      if (!['preparing','running'].includes(r.outcome)) throw new InputError('Runは終了済みです', 409);
      const status = outcome === 'succeeded' ? 'completed' : outcome === 'cancelled' ? 'cancelled' : 'failed';
      const now = new Date().toISOString();
      this.db.prepare('UPDATE turns SET content=?,status=?,finalized_at=? WHERE turn_id=?').run(content.replace(/\r\n?/g, '\n'), status, now, r.assistant_turn_id);
      this.db.prepare('UPDATE generation_runs SET outcome=?,finished_at=?,error=? WHERE run_id=?').run(outcome, now, error ? JSON.stringify(error) : null, runId);
      this.db.prepare('UPDATE conversations SET updated_at=? WHERE conversation_id=?').run(now, id);
      return this.run(id, runId);
    });
  }
  recoverInterrupted() {
    const rows = this.db.prepare("SELECT conversation_id,run_id FROM generation_runs WHERE outcome IN ('preparing','running')").all();
    for (const row of rows) {
      const id = row.conversation_id as string, runId = row.run_id as string, r = this.run(id, runId);
      this.finishRun(id, runId, 'interrupted', this.getTurn(id, r.assistant_turn_id).content, { code: 'PROCESS_INTERRUPTED', message: '前回の生成が終了しないままサーバーが停止しました。自動再送しません。' });
    }
    return rows.length;
  }
  addMockRun(id: string, userTurnId: string, content: unknown, retryOf: string | null = null) {
    const value = textInput(content, '仮回答');
    return transaction(this.db, () => {
      this.assertIdle(id);
      const user = this.getTurn(id, userTurnId);
      if (user.role !== 'user' || user.status !== 'completed') throw new InputError('確定User発言を指定してください');
      if (retryOf && !this.db.prepare('SELECT 1 FROM generation_runs WHERE run_id=? AND conversation_id=? AND user_turn_id=?').get(retryOf, id, userTurnId)) throw new InputError('再試行元が一致しません');
      const started = new Date().toISOString();
      const snapshot = { model: 'mock-fixed', messages: [{ role: 'user', content: user.content }], mock_response: value };
      const assistant = this.insertTurn(id, 'assistant', value), runId = randomUUID();
      this.db.prepare("INSERT INTO generation_runs VALUES(?,?,?,?,?,'mock','mock-fixed','mock','mock_single_user','1',?,?,?,'succeeded',NULL)").run(runId, id, userTurnId, assistant.turn_id, retryOf, JSON.stringify(snapshot), started, new Date().toISOString());
      const run = this.listRuns(id).find(r => r.run_id === runId)!;
      return { assistant, run };
    });
  }
  retryMockRun(id: string, runId: string, content: unknown) {
    const run = this.listRuns(id).find(r => r.run_id === runId);
    if (!run) throw new InputError('再試行元Runがありません', 404);
    if (run.kind !== 'mock') throw new InputError('仮再試行はmock Run専用です');
    return this.addMockRun(id, run.user_turn_id, content, runId);
  }
}
