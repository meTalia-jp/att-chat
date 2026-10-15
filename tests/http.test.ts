import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { openDatabase } from '../src/server/storage/database.ts';
import { Repository } from '../src/server/storage/repository.ts';
import { createAppServer } from '../src/server/http.ts';

test('HTTP作成・取得・並列追加・更新API拒否・DB失敗の非2xx', async () => {
  const db = openDatabase(':memory:'), repo = new Repository(db), server = createAppServer(repo, resolve('dist'));
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const base = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const post = (path: string, data: unknown) => fetch(base+path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
  try {
    const created = await post('/api/conversations', {title:'HTTP'}); assert.equal(created.status,201); const c = await created.json();
    const renamed=await fetch(base+`/api/conversations/${c.conversation_id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'  HTTP変更後  '})});assert.equal(renamed.status,200);assert.equal((await renamed.json()).title,'HTTP変更後');
    const listed=await(await fetch(base+'/api/conversations')).json();assert.equal(listed[0].title,'HTTP変更後');
    const emptyRename=await fetch(base+`/api/conversations/${c.conversation_id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'   '})});assert.equal(emptyRename.status,400);
    const replies = await Promise.all(Array.from({length:8}, (_,i) => post(`/api/conversations/${c.conversation_id}/turns`, {content:`発言${i}`}))); assert(replies.every(r=>r.status===201));
    const detail = await (await fetch(base+`/api/conversations/${c.conversation_id}`)).json(); assert.deepEqual(detail.turns.map((t:{sequence_no:number})=>t.sequence_no), [0,1,2,3,4,5,6,7]);
    const update = await fetch(base+`/api/conversations/${c.conversation_id}/turns`, {method:'PUT'}); assert.equal(update.status,404);
    const invalid = await post('/api/conversations',{title:'ok', unexpected:1}); assert.equal(invalid.status,400);
    const foreign = await fetch(base+'/api/conversations',{headers:{Origin:'https://unrelated.example'}}); assert.equal(foreign.status,403);
    db.exec("CREATE TRIGGER injected_failure BEFORE INSERT ON generation_runs BEGIN SELECT RAISE(ABORT,'failed'); END");
    const failed = await post(`/api/conversations/${c.conversation_id}/mock-runs`,{user_turn_id:detail.turns[0].turn_id, content:'失敗回答'}); assert.equal(failed.status,500); assert.equal((await failed.json()).error.code,'STORAGE_ERROR');
    assert.equal(repo.listTurns(c.conversation_id).length,8); assert.equal(repo.listRuns(c.conversation_id).length,0);
    db.exec('DROP TRIGGER injected_failure');
    const mock = await post(`/api/conversations/${c.conversation_id}/mock-runs`,{user_turn_id:detail.turns[0].turn_id,content:'ok'}); assert.equal(mock.status,201); const pair = await mock.json();
    const retry = await post(`/api/conversations/${c.conversation_id}/runs/${pair.run.run_id}/retry`,{content:'retry'}); assert.equal(retry.status,201); assert.equal(repo.listRuns(c.conversation_id).length,2);
  } finally { server.close(); server.closeAllConnections(); await once(server,'close'); db.close(); }
});
