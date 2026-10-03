import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { transaction } from './database.ts';
import { InputError, type Repository } from './repository.ts';
import type { GlobalQuestionKeep, QuestionKeep } from '../../shared/question-keep.ts';

function draftText(value: unknown, name: string) {
  if (typeof value !== 'string' || value.length>10000 || value.includes('\0')) throw new InputError(`${name}が不正です（最大10,000文字）`);
  return value.replace(/\r\n?/g, '\n');
}
export class QuestionKeepRepository {
  private db: DatabaseSync;
  private repo: Repository;
  constructor(db: DatabaseSync, repo: Repository) { this.db=db; this.repo=repo; }
  list(id: string): QuestionKeep[] {
    this.repo.getConversation(id);
    return this.db.prepare(`SELECT k.* FROM question_keeps k JOIN highlights h ON h.highlight_id=k.highlight_id
      JOIN turns t ON t.turn_id=h.turn_id WHERE t.conversation_id=? ORDER BY k.created_at,k.keep_id`).all(id) as unknown as QuestionKeep[];
  }
  listGlobal(): GlobalQuestionKeep[] {
    const rows = this.db.prepare(`SELECT
      c.conversation_id,c.title,
      k.keep_id,k.highlight_id,k.question_draft,k.memo,k.status AS keep_status,k.created_at,k.updated_at,k.asked_at,
      h.status AS highlight_status,h.reason,h.source_text,h.target_text,
      t.turn_id,t.sequence_no
      FROM question_keeps k
      JOIN highlights h ON h.highlight_id=k.highlight_id
      JOIN turns t ON t.turn_id=h.turn_id
      JOIN conversations c ON c.conversation_id=t.conversation_id
      ORDER BY k.created_at DESC,k.rowid DESC`).all() as Array<Record<string, unknown>>;
    return rows.map(row => ({
      conversation: { conversation_id: row.conversation_id as string, title: row.title as string },
      keep: {
        keep_id: row.keep_id as string,
        highlight_id: row.highlight_id as string,
        question_draft: row.question_draft as string,
        memo: row.memo as string,
        status: row.keep_status as QuestionKeep['status'],
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
        asked_at: row.asked_at as string | null,
      },
      highlight: {
        highlight_id: row.highlight_id as string,
        status: row.highlight_status as GlobalQuestionKeep['highlight']['status'],
        reason: row.reason as string | null,
        source_text: row.source_text as string,
        target_text: row.target_text as string,
      },
      source_turn: { turn_id: row.turn_id as string, sequence_no: row.sequence_no as number },
    }));
  }
  get(id: string, keepId: string) {
    const keep=this.list(id).find(k=>k.keep_id===keepId);
    if (!keep) throw new InputError('質問キープがありません',404);
    return keep;
  }
  create(id: string, input: Record<string,unknown>) {
    if(typeof input.highlight_id!=='string') throw new InputError('highlight_idが必要です');
    const highlight=this.repo.getHighlight(id,input.highlight_id);
    if(highlight.status!=='resolved') throw new InputError('unresolvedマーカーには新規キープできません',409);
    const question=draftText(input.question_draft??'','質問下書き'),memo=draftText(input.memo??'','メモ');
    return transaction(this.db,()=>{
      const keepId=randomUUID(),now=new Date().toISOString();
      this.db.prepare("INSERT INTO question_keeps VALUES(?,?,?,?,'pending',?,?,NULL)").run(keepId,highlight.highlight_id,question,memo,now,now);
      return this.get(id,keepId);
    });
  }
  update(id: string, keepId: string, input: Record<string,unknown>) {
    return transaction(this.db,()=>{
      const old=this.get(id,keepId);
      if(old.status==='asked') throw new InputError('askedのキープは変更できません',409);
      const status=input.status??old.status;
      if(status!=='pending'&&status!=='dismissed') throw new InputError('Phase 3Aではpending/dismissedのみ変更できます');
      const question=draftText(input.question_draft??old.question_draft,'質問下書き'),memo=draftText(input.memo??old.memo,'メモ');
      const now=new Date(Math.max(Date.now(),Date.parse(old.updated_at)+1)).toISOString();
      this.db.prepare('UPDATE question_keeps SET question_draft=?,memo=?,status=?,updated_at=? WHERE keep_id=?').run(question,memo,status,now,keepId);
      return this.get(id,keepId);
    });
  }
  delete(id: string, keepId: string) {
    this.get(id,keepId);
    if(this.db.prepare('DELETE FROM question_keeps WHERE keep_id=?').run(keepId).changes!==1) throw new Error('キープ削除に失敗しました');
  }
}
