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
  addUserTurn(id: string, content: unknown): Turn { const value = textInput(content, '本文'); return transaction(this.db, () => this.insertTurn(id, 'user', value)); }
  // All updates are deliberately absent from the public Repository API.
  addMockRun(id: string, userTurnId: string, content: unknown, retryOf: string | null = null) {
    const value = textInput(content, '仮回答');
    return transaction(this.db, () => {
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
    return this.addMockRun(id, run.user_turn_id, content, runId);
  }
}
