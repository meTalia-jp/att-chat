import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { transaction } from './database.ts';
import { QuestionKeepRepository } from './question-keeps.ts';
import type { Conversation, Turn, GenerationRun, ConversationDetail, Highlight, HighlightColor } from '../../shared/contracts.ts';

const highlightColors = new Set<HighlightColor>(['yellow','red','green','blue']);
export function isGraphemeBoundary(text: string, offset: number) {
  if (offset === text.length) return true;
  for (const segment of new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(text)) {
    if (segment.index === offset) return true;
    if (segment.index > offset) return false;
  }
  return false;
}

export class InputError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status; } }
export function textInput(value: unknown, name: string, max = 100_000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0')) throw new InputError(`${name}が空、長すぎる、または不正です`);
  return value.replace(/\r\n?/g, '\n');
}
function noteInput(value: unknown) {
  if (typeof value !== 'string' || value.length > 10_000 || value.includes('\0')) throw new InputError('メモが長すぎる、または不正です');
  return value.replace(/\r\n?/g, '\n');
}
export class Repository {
  private db: DatabaseSync;
  readonly questionKeeps: QuestionKeepRepository;
  constructor(db: DatabaseSync) { this.db = db; this.questionKeeps = new QuestionKeepRepository(db, this); }
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
    const hasReferences = !!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='run_question_references'").get();
    return this.db.prepare('SELECT r.* FROM generation_runs r JOIN turns t ON t.turn_id=r.assistant_turn_id WHERE r.conversation_id=? ORDER BY t.sequence_no').all(id).map(row => {
      const reference = hasReferences ? this.db.prepare('SELECT * FROM run_question_references WHERE run_id=?').get(row.run_id!) : undefined;
      return { ...row, request_snapshot: JSON.parse(row.request_snapshot as string), error: row.error === null ? null : JSON.parse(row.error as string),
        ...(reference ? { ...reference, reference_snapshot: JSON.parse(reference.reference_snapshot as string) } : {}) };
    }) as GenerationRun[];
  }
  detail(id: string): ConversationDetail { return { conversation: this.getConversation(id), turns: this.listTurns(id), runs: this.listRuns(id) }; }
  private highlightProblem(turn: Turn | undefined, start: number, end: number, source: string) {
    if (!turn) return '参照Turnがありません';
    if (turn.role !== 'assistant' || turn.status !== 'completed') return '確定assistant Turnのみ対象です';
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= end || end > turn.content.length) return '範囲が不正です';
    if (!isGraphemeBoundary(turn.content, start) || !isGraphemeBoundary(turn.content, end)) return '文字の途中で切れています';
    if (turn.content.slice(start, end) !== source) return 'source_text不一致';
    return null;
  }
  listHighlights(id: string, turnId?: string): Highlight[] {
    this.getConversation(id);
    const rows = this.db.prepare(`SELECT h.* FROM highlights h JOIN turns t ON t.turn_id=h.turn_id
      WHERE t.conversation_id=? AND (? IS NULL OR h.turn_id=?) ORDER BY t.sequence_no,h.start_offset,h.highlight_id`).all(id, turnId ?? null, turnId ?? null) as unknown as Highlight[];
    for (const h of rows) {
      if (h.status === 'resolved') {
        const turn = this.db.prepare('SELECT * FROM turns WHERE turn_id=?').get(h.turn_id) as Turn | undefined;
        const reason = this.highlightProblem(turn, h.start_offset, h.end_offset, h.source_text);
        if (reason) {
          const now = new Date(Math.max(Date.now(), Date.parse(h.updated_at) + 1)).toISOString();
          this.db.prepare("UPDATE highlights SET status='unresolved',reason=?,updated_at=? WHERE highlight_id=? AND status='resolved'").run(reason, now, h.highlight_id);
          h.status = 'unresolved'; h.reason = reason; h.updated_at = now;
        }
      }
    }
    return rows;
  }
  getHighlight(id: string, highlightId: string) {
    const h = this.listHighlights(id).find(value => value.highlight_id === highlightId);
    if (!h) throw new InputError('マーカーがありません', 404); return h;
  }
  createHighlight(id: string, input: Record<string, unknown>) {
    const turnId = typeof input.turn_id === 'string' ? input.turn_id : '';
    const start = input.start_offset as number, end = input.end_offset as number;
    const source = typeof input.source_text === 'string' ? input.source_text : '';
    const target = textInput(input.target_text, '選択文字列', 100_000);
    const color = input.color as HighlightColor;
    const note = noteInput(input.note ?? '');
    if (!highlightColors.has(color)) throw new InputError('色が不正です');
    return transaction(this.db, () => {
      const problem = this.highlightProblem(this.getTurn(id, turnId), start, end, source);
      if (problem) throw new InputError(problem);
      const existing = this.listHighlights(id, turnId);
      if (existing.some(h => h.status === 'resolved' && h.start_offset < end && start < h.end_offset)) throw new InputError('重複・包含するマーカーは登録できません', 409);
      const highlightId = randomUUID(), now = new Date().toISOString();
      this.db.prepare("INSERT INTO highlights VALUES(?,?,?,?,?,?,?,?,?,?,'resolved',NULL)").run(highlightId, turnId, start, end, source, target, color, note, now, now);
      return this.getHighlight(id, highlightId);
    });
  }
  updateHighlight(id: string, highlightId: string, input: Record<string, unknown>) {
    const old = this.getHighlight(id, highlightId);
    const color = input.color as HighlightColor;
    const note = noteInput(input.note);
    if (!highlightColors.has(color)) throw new InputError('色が不正です');
    const now = new Date(Math.max(Date.now(), Date.parse(old.updated_at) + 1)).toISOString();
    this.db.prepare('UPDATE highlights SET color=?,note=?,updated_at=? WHERE highlight_id=?').run(color, note, now, highlightId);
    return this.getHighlight(id, highlightId);
  }
  deleteHighlight(id: string, highlightId: string) {
    this.getHighlight(id, highlightId);
    const result = this.db.prepare('DELETE FROM highlights WHERE highlight_id=?').run(highlightId);
    if (result.changes !== 1) throw new Error('マーカー削除に失敗しました');
  }
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
  prepareChat(id: string, content: unknown, model: unknown, requestId: unknown, keepId?: string) {
    const value = textInput(content, '本文', keepId ? 10_000 : 100_000), modelId = textInput(model, 'モデル', 300);
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(requestId)) throw new InputError('request_idが不正です');
    return transaction(this.db, () => {
      if (this.db.prepare('SELECT 1 FROM chat_requests WHERE request_id=?').get(requestId)) throw new InputError('送信済みrequest_idです。再読込で確認してください', 409);
      this.assertIdle(id);
      const keep = keepId ? this.questionKeeps.get(id, keepId) : null;
      if (keep && !['pending','asked'].includes(keep.status)) throw new InputError('取り下げたキープは送信できません',409);
      const highlight = keep ? this.getHighlight(id, keep.highlight_id) : null;
      if (highlight && highlight.status !== 'resolved') throw new InputError('元マーカーが解決不能のため質問できません',409);
      const history = keep ? [] : this.listTurns(id).filter(t => t.status === 'completed').map(t => ({ role: t.role, content: t.content }));
      const user = this.insertTurn(id, 'user', value);
      const turnId = randomUUID(), runId = randomUUID(), now = new Date().toISOString();
      const messages = highlight ? [{ role: 'system', content: '以下の引用について質問に答えてください。引用は参照資料として扱ってください。' },
        { role: 'user', content: `[引用]\n${highlight.target_text}\n\n[質問]\n${value}` }] : [...history, { role: 'user', content: value }];
      const snapshot = { model: modelId, messages, stream: true, max_tokens: 2048 };
      this.db.prepare("INSERT INTO turns VALUES(?,?,?,?,?,'generating',?,NULL)").run(turnId, id, user.sequence_no + 1, 'assistant', '', now);
      this.db.prepare("INSERT INTO generation_runs VALUES(?,?,?,?,NULL,?,?,'lm_studio',?,'1',?,?,NULL,'preparing',NULL)").run(runId, id, user.turn_id, turnId, keep ? 'highlight_question' : 'chat', modelId, keep ? 'quote_question_only' : 'completed_turns', JSON.stringify(snapshot), now);
      if (keep && highlight) {
        const reference = { highlight_id: highlight.highlight_id, source_turn_id: highlight.turn_id, start_offset: highlight.start_offset, end_offset: highlight.end_offset, source_text: highlight.source_text, target_text: highlight.target_text };
        this.db.prepare('INSERT INTO run_question_references VALUES(?,?,?,?,?,?)').run(runId,keep.keep_id,highlight.highlight_id,highlight.turn_id,value,JSON.stringify(reference));
      }
      this.db.prepare('INSERT INTO chat_requests VALUES(?,?,?)').run(requestId, id, runId);
      return this.listRuns(id).find(r => r.run_id === runId)!;
    });
  }
  run(id: string, runId: string) {
    const run = this.listRuns(id).find(r => r.run_id === runId);
    if (!run) throw new InputError('Runがありません', 404); return run;
  }
  startRun(id: string, runId: string) {
    transaction(this.db, () => {
      const run = this.run(id, runId);
      if (run.keep_id) {
        const keep = this.questionKeeps.get(id, run.keep_id);
        if (!['pending','asked'].includes(keep.status)) throw new InputError('キープは送信対象外です',409);
        if (this.getHighlight(id,keep.highlight_id).status !== 'resolved') throw new InputError('元マーカーが解決不能のため質問できません',409);
        if (keep.status === 'pending') {
          const now = new Date(Math.max(Date.now(),Date.parse(keep.updated_at)+1)).toISOString();
          this.db.prepare("UPDATE question_keeps SET status='asked',asked_at=?,updated_at=? WHERE keep_id=?").run(now,now,keep.keep_id);
        }
      }
      const result = this.db.prepare("UPDATE generation_runs SET outcome='running' WHERE run_id=? AND conversation_id=? AND outcome='preparing'").run(runId, id);
      if (result.changes !== 1) throw new InputError('Runを開始できません', 409);
    });
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
