import type { DatabaseSync } from 'node:sqlite';
import type { Turn } from '../shared/contracts.ts';

type ConversationRow={conversation_id:string;title:string};
export class RetrievalRepository {
  private db:DatabaseSync;
  constructor(db:DatabaseSync){this.db=db;}
  findTurn(turnId:string){return this.db.prepare('SELECT * FROM turns WHERE turn_id=?').get(turnId) as Turn|undefined;}
  findConversation(conversationId:string){return this.db.prepare('SELECT conversation_id,title FROM conversations WHERE conversation_id=?').get(conversationId) as ConversationRow|undefined;}
  window(turnId:string,before:number,after:number){
    return this.db.prepare(`WITH anchor AS (SELECT conversation_id,sequence_no FROM turns WHERE turn_id=? AND status='completed'),
      previous AS (SELECT t.* FROM turns t JOIN anchor a ON a.conversation_id=t.conversation_id WHERE t.status='completed' AND t.sequence_no<a.sequence_no ORDER BY t.sequence_no DESC,t.turn_id DESC LIMIT ?),
      following AS (SELECT t.* FROM turns t JOIN anchor a ON a.conversation_id=t.conversation_id WHERE t.status='completed' AND t.sequence_no>a.sequence_no ORDER BY t.sequence_no,t.turn_id LIMIT ?),
      selected AS (SELECT * FROM previous UNION ALL SELECT t.* FROM turns t JOIN anchor a ON a.conversation_id=t.conversation_id AND a.sequence_no=t.sequence_no WHERE t.turn_id=? UNION ALL SELECT * FROM following)
      SELECT * FROM selected ORDER BY sequence_no,turn_id`).all(turnId,before,after,turnId) as unknown as Turn[];
  }
}
