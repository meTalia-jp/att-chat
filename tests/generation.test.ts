import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase, migrate } from '../src/server/storage/database.ts';
import { Repository } from '../src/server/storage/repository.ts';
import { LMStudioProvider } from '../src/server/provider.ts';
import { GenerationService } from '../src/server/generation.ts';
import { createAppServer } from '../src/server/http.ts';

const sse = (text: string, finish: string | null = null) => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text }, finish_reason: finish }] })}\r\n\r\n`;
async function fixture(fn: (f: { db: DatabaseSync; repo: Repository; service: GenerationService; provider: LMStudioProvider; id: string; base: string; mode: (value: string) => void; requests: Record<string, unknown>[] }) => Promise<void>) {
  let mode = 'ok'; const requests: Record<string, unknown>[] = [];
  const upstream = createServer(async (req, res) => {
    if (req.url === '/v1/models') { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ data: mode === 'empty' ? [] : [{ id: 'test-model' }] })); return; }
    let body = ''; for await (const chunk of req) body += chunk; requests.push(JSON.parse(body));
    if (mode === 'http') { res.writeHead(503); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const bytes = Buffer.from(sse('日本語😀\r'));
    for (const byte of bytes) res.write(Buffer.from([byte]));
    if (mode === 'hold') return;
    if (mode === 'disconnect') { res.end(); return; }
    if (mode === 'bad') { res.end('data: invalid\n\n'); return; }
    if (mode === 'no-finish') { res.end('data: [DONE]\n\n'); return; }
    await delay(25); res.write(sse('\n回答', 'stop')); res.end('data: [DONE]\r\n\r\n');
  });
  upstream.listen(0,'127.0.0.1'); await once(upstream,'listening');
  const db = openDatabase(':memory:'), repo = new Repository(db), id = repo.createConversation('test').conversation_id;
  const provider = new LMStudioProvider(`http://127.0.0.1:${(upstream.address() as {port:number}).port}/v1`), service = new GenerationService(repo, provider);
  const app = createAppServer(repo, 'dist', service); app.listen(0,'127.0.0.1'); await once(app,'listening');
  try { await fn({ db, repo, service, provider, id, base: `http://127.0.0.1:${(app.address() as {port:number}).port}`, mode: value => { mode = value; }, requests }); }
  finally { app.closeAllConnections(); upstream.closeAllConnections(); await Promise.all([new Promise<void>(r => app.close(() => r())),new Promise<void>(r => upstream.close(() => r()))]); db.close(); }
}
const prepare = (repo: Repository, id: string) => repo.prepareChat(id, '質問\r\n😀', 'test-model', crypto.randomUUID());

test('モデル一覧成功・モデルなし・LM Studio未起動', async () => fixture(async f => {
  assert.deepEqual(await f.provider.models(), ['test-model']); f.mode('empty'); assert.deepEqual(await f.provider.models(), []);
  const closed = createServer(); closed.listen(0,'127.0.0.1'); await once(closed,'listening'); const port=(closed.address() as {port:number}).port; await new Promise<void>(r=>closed.close(()=>r()));
  await assert.rejects(new LMStudioProvider(`http://127.0.0.1:${port}/v1`).models(), /失敗/);
}));
test('通常生成・分割UTF8 SSE・streaming・LF・snapshotと送信一致', async () => fixture(async f => {
  const run=prepare(f.repo,f.id), events: Record<string,unknown>[]=[];
  assert.equal(run.outcome,'preparing'); assert.equal(f.repo.getTurn(f.id,run.assistant_turn_id).status,'generating');
  await f.service.execute(run,e=>{events.push(e); if(e.type==='delta')assert.equal(f.repo.run(f.id,run.run_id).outcome,'running');});
  assert.equal(f.repo.run(f.id,run.run_id).outcome,'succeeded'); assert.equal(f.repo.getTurn(f.id,run.assistant_turn_id).content,'日本語😀\n回答');
  assert.deepEqual(f.requests[0],run.request_snapshot); assert.equal(events.filter(e=>e.type==='delta').length,2); assert.equal(events.at(-1)?.outcome,'succeeded');
  assert.throws(()=>f.db.exec("UPDATE turns SET content='overwrite'"),/immutable/);
}));
test('cancel・500ms部分保存・cancelled不変・再送は新ID', async () => fixture(async f => {
  f.mode('hold'); const run=prepare(f.repo,f.id); const execution=f.service.execute(run,()=>{});
  await delay(650); assert.equal(f.repo.getTurn(f.id,run.assistant_turn_id).content,'日本語😀\n');
  const saved=await f.service.cancel(f.id,run.run_id); await execution;
  assert.equal(saved.outcome,'cancelled'); assert.equal(f.repo.getTurn(f.id,run.assistant_turn_id).status,'cancelled');
  assert.throws(()=>f.repo.checkpoint(f.id,run.run_id,'overwrite'));
  const next=prepare(f.repo,f.id); assert.notEqual(next.assistant_turn_id,run.assistant_turn_id);
  assert(!(next.request_snapshot.messages as {content:string}[]).some(m=>m.content==='日本語😀\n'));
}));
for (const mode of ['http','disconnect','bad','no-finish']) test(`${mode}をfailed扱いし正常終了にしない`, async () => fixture(async f => {
  f.mode(mode); const run=prepare(f.repo,f.id); await f.service.execute(run,()=>{});
  assert.equal(f.repo.run(f.id,run.run_id).outcome,'failed'); assert.equal(f.repo.getTurn(f.id,run.assistant_turn_id).status,'failed');
}));
test('DB開始・確定失敗を成功扱いしない・整合性rollback', async () => fixture(async f => {
  const before=f.repo.detail(f.id); f.db.exec("CREATE TRIGGER fail_insert BEFORE INSERT ON generation_runs BEGIN SELECT RAISE(ABORT,'test'); END");
  assert.throws(()=>prepare(f.repo,f.id)); assert.deepEqual(f.repo.detail(f.id),before); assert.equal(f.requests.length,0); f.db.exec('DROP TRIGGER fail_insert');
  const run=prepare(f.repo,f.id); f.db.exec("CREATE TRIGGER fail_finish BEFORE UPDATE ON generation_runs WHEN NEW.outcome='succeeded' BEGIN SELECT RAISE(ABORT,'test'); END");
  await f.service.execute(run,()=>{}); assert.equal(f.repo.run(f.id,run.run_id).outcome,'failed'); assert.equal(f.repo.getTurn(f.id,run.assistant_turn_id).status,'failed');
}));
test('DB全書込失敗は未確定のままエラー通知、回復後interrupted', async () => fixture(async f => {
  const run=prepare(f.repo,f.id), events: Record<string,unknown>[]=[]; f.db.exec('PRAGMA query_only=ON');
  await f.service.execute(run,e=>events.push(e)); assert.equal(events.at(-1)?.type,'storage_error'); assert.equal(f.repo.run(f.id,run.run_id).outcome,'preparing');
  f.db.exec('PRAGMA query_only=OFF'); assert.equal(f.repo.recoverInterrupted(),1); assert.equal(f.repo.run(f.id,run.run_id).outcome,'interrupted');
}));
test('不正遷移・snapshot変更拒否・preparing/running回復・二重送信拒否', async () => fixture(async f => {
  const key=crypto.randomUUID(), run=f.repo.prepareChat(f.id,'q','test-model',key);
  assert.throws(()=>prepare(f.repo,f.id),/生成中/); assert.throws(()=>f.repo.addUserTurn(f.id,'extra'),/生成中/);
  assert.throws(()=>f.repo.finishRun(f.id,run.run_id,'succeeded','bad')); assert.equal(f.repo.getTurn(f.id,run.assistant_turn_id).status,'generating');
  assert.throws(()=>f.db.exec("UPDATE generation_runs SET request_snapshot='{}',outcome='running'"),/immutable/);
  f.repo.startRun(f.id,run.run_id); f.repo.checkpoint(f.id,run.run_id,'途中'); f.repo.recoverInterrupted();
  assert.equal(f.repo.run(f.id,run.run_id).outcome,'interrupted'); assert.equal(f.repo.getTurn(f.id,run.assistant_turn_id).content,'途中');
  assert.throws(()=>f.repo.prepareChat(f.id,'q','test-model',key),/送信済み/);
  const preparing=prepare(f.repo,f.id); f.repo.recoverInterrupted(); assert.equal(f.repo.run(f.id,preparing.run_id).outcome,'interrupted'); assert.equal(f.repo.recoverInterrupted(),0);
}));
test('HTTP streaming、同時送信409、cancel、再読込', async () => fixture(async f => {
  f.mode('hold'); const post=(suffix:string,data:unknown)=>fetch(f.base+`/api/conversations/${f.id}`+suffix,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const response=await post('/chat',{content:'q',model:'test-model',request_id:crypto.randomUUID()}); assert.equal(response.status,201);
  const stream=response.text(); const run=f.repo.activeRun(f.id)!;
  assert.equal((await post('/chat',{content:'double',model:'test-model',request_id:crypto.randomUUID()})).status,409);
  assert.equal((await post(`/runs/${run.run_id}/cancel`,{})).status,200);
  assert.match(await stream,/cancelled/); const detail=await (await fetch(f.base+`/api/conversations/${f.id}`)).json(); assert.equal(detail.turns.length,2); assert.equal(detail.runs[0].outcome,'cancelled');
}));
test('001既存データを002適用前後で完全保持', () => {
  const db=new DatabaseSync(':memory:');
  try {
    const sql=readFileSync(new URL('../src/server/storage/migrations/001_initial.sql',import.meta.url),'utf8').replace(/\r\n?/g,'\n');
    db.exec(sql); db.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL) STRICT');
    db.prepare('INSERT INTO schema_migrations VALUES(1,?,?)').run(createHash('sha256').update(sql).digest('hex'),new Date().toISOString());
    const repo=new Repository(db), id=repo.createConversation('legacy').conversation_id, user=repo.addUserTurn(id,'q'); repo.addMockRun(id,user.turn_id,'a'); const before=repo.detail(id);
    migrate(db); assert.deepEqual(repo.detail(id),before); migrate(db); assert.deepEqual(repo.detail(id),before);
  } finally { db.close(); }
});
test('途中checkpoint保存失敗で通信を中断しfailedを保存', async () => fixture(async f => {
  f.mode('hold'); const run=prepare(f.repo,f.id);
  f.db.exec("CREATE TRIGGER fail_checkpoint BEFORE UPDATE ON turns WHEN NEW.status='generating' BEGIN SELECT RAISE(ABORT,'checkpoint_failed'); END");
  await f.service.execute(run,()=>{});
  assert.equal(f.repo.run(f.id,run.run_id).outcome,'failed'); assert.equal(f.repo.run(f.id,run.run_id).error?.code,'STORAGE_ERROR');
  assert.equal(f.repo.getTurn(f.id,run.assistant_turn_id).content,'日本語😀\n');
}));
test('ブラウザ接続切断はfailed、完了後の停止は既存結果を保持', async () => fixture(async f => {
  f.mode('hold'); const run=prepare(f.repo,f.id);
  const execution=f.service.execute(run,e=>{if(e.type==='delta')f.service.disconnect(run.run_id);}); await execution;
  assert.equal(f.repo.run(f.id,run.run_id).outcome,'failed');
  const before=f.repo.detail(f.id); await f.service.cancel(f.id,run.run_id); assert.deepEqual(f.repo.detail(f.id),before);
}));
