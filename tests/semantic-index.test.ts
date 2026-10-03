import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, migrate } from '../src/server/storage/database.ts';
import { Repository } from '../src/server/storage/repository.ts';
import { SemanticIndexRepository, hashText, inputHashes } from '../src/semantic/index-repository.ts';
import { BackgroundIndexer } from '../src/semantic/indexer.ts';
import { FakeEmbeddingProvider, fakeSpec, type FakeMode } from './fixtures/fake-embedding-provider.ts';
import { GenerationService } from '../src/server/generation.ts';
import { LMStudioProvider } from '../src/server/provider.ts';
import { identifySpace } from '../src/semantic/space.ts';

function setup(db = openDatabase(':memory:')) {
  const chat=new Repository(db), repo=new SemanticIndexRepository(db), provider=new FakeEmbeddingProvider();
  const id=chat.createConversation('semantic').conversation_id, user=chat.addUserTurn(id,'日本語😀'), space=repo.registerSpace(fakeSpec,0);
  return {db,chat,repo,provider,id,user,space};
}
async function fixture(fn: (f: ReturnType<typeof setup>) => unknown) { const f=setup(); try { await fn(f); } finally { f.db.close(); } }

test('S2 space canonical登録・重複・秘密情報除外',()=>fixture(f=>{
  assert.equal(f.repo.registerSpace({...fakeSpec,...{api_key:'secret'}}),f.space);
  assert.equal(f.db.prepare('SELECT count(*) n FROM embedding_spaces').get()!.n,1);
  assert.equal(JSON.stringify(f.repo.getSpace(f.space)).includes('secret'),false);
  assert.equal(f.space,identifySpace(fakeSpec).space_id);
  assert.throws(()=>f.db.exec("UPDATE embedding_spaces SET dimensions=8"),/immutable/);
}));
test('S2 source/input hashはUTF8原文とprefix付き原文',()=>{
  const text='日本語😀e\u0301\n'; const h=inputHashes(text,fakeSpec);
  assert.equal(h.source_hash,hashText(text)); assert.equal(h.input_hash,hashText('d:'+text)); assert.notEqual(h.source_hash,h.input_hash);
});
test('S2 completed User/Assistant対象、generating/failed/cancelled除外・SQL拒否',()=>fixture(f=>{
  f.chat.addMockRun(f.id,f.user.turn_id,'回答');
  const run=f.chat.prepareChat(f.id,'質問','m',crypto.randomUUID());
  f.repo.supplement(f.space,0);
  assert.equal(f.repo.counts(f.space).pending,3);
  const h=inputHashes('',fakeSpec);
  assert.throws(()=>f.db.prepare("INSERT INTO turn_embeddings(turn_id,space_id,source_hash,input_hash,status,created_at,updated_at) VALUES(?,?,?,?,'pending',0,0)").run(run.assistant_turn_id,f.space,h.source_hash,h.input_hash),/completed/);
  f.chat.finishRun(f.id,run.run_id,'cancelled','partial');
  const r2=f.chat.prepareChat(f.id,'q','m',crypto.randomUUID()); f.chat.finishRun(f.id,r2.run_id,'failed','partial',{code:'TEST',message:'test'});
  f.repo.supplement(f.space); assert.equal(f.repo.row(run.assistant_turn_id,f.space),undefined); assert.equal(f.repo.row(r2.assistant_turn_id,f.space),undefined);
}));
test('S2 pending重複なし・missing補完・ready BLOB little-endian roundtrip',()=>fixture(async f=>{
  assert.equal(f.repo.counts(f.space).missing,1); assert.equal(f.repo.supplement(f.space,0),1); assert.equal(f.repo.supplement(f.space,0),0);
  const lease=f.repo.claim(f.space,1)!; const result=await f.provider.embed(lease.content,{purpose:'document'});
  assert.equal(f.repo.saveReady(lease,result,2),true); assert.equal(f.repo.counts(f.space).ready,1);
  assert(result.ok); assert.deepEqual(f.repo.readVector(f.user.turn_id,f.space),result.vector);
  const blob=Buffer.from(f.repo.row(f.user.turn_id,f.space)!.vector as Uint8Array);
  assert.equal(blob.length,16); assert.equal(blob.readFloatLE(0),result.vector[0]);
  assert.throws(()=>f.db.exec("UPDATE turn_embeddings SET vector=x'00000000'"),/dimensions/);
}));
for (const mode of ['dimensions','nan','infinity','zero','space'] as FakeMode[]) test(`S2 invalid vector拒否 ${mode}`,()=>fixture(async f=>{
  f.repo.supplement(f.space,0); const lease=f.repo.claim(f.space,1)!;
  assert.throws(()=>f.repo.saveReady(lease,{ok:true,space_id:f.space,vector:new Float32Array(0),input_tokens:1,truncated:false},2),/INVALID_VECTOR/);
  const result=await new FakeEmbeddingProvider(mode).embed('a',{purpose:'document'});
  assert.throws(()=>f.repo.saveReady(lease,result,2)); assert.equal(f.repo.counts(f.space).ready,0);
}));
for (const mode of ['INPUT_TOO_LONG','MODEL_UNAVAILABLE','dimensions'] as FakeMode[]) test(`S2 非retry失敗 ${mode}`,()=>fixture(async f=>{
  const worker=new BackgroundIndexer(f.repo,new FakeEmbeddingProvider(mode),fakeSpec);
  await worker.tick(); const row=f.repo.row(f.user.turn_id,f.space)!;
  assert.equal(row.status,'failed'); assert.equal(row.attempt_count,1); assert.equal(await worker.tick(),false);
  if(mode==='INPUT_TOO_LONG')assert.equal(f.repo.counts(f.space).input_too_long,1);
}));
test('S2 retry exponential backoff最大3回',()=>fixture(async f=>{
  let now=0; const worker=new BackgroundIndexer(f.repo,new FakeEmbeddingProvider('PROVIDER_ERROR'),fakeSpec,()=>now);
  await worker.tick(); assert.equal(f.repo.row(f.user.turn_id,f.space)!.next_attempt_at,1000);
  now=999; assert.equal(await worker.tick(),false); now=1000; await worker.tick();
  assert.equal(f.repo.row(f.user.turn_id,f.space)!.next_attempt_at,3000); now=3000; await worker.tick();
  assert.equal(f.repo.row(f.user.turn_id,f.space)!.status,'failed'); assert.equal(f.repo.row(f.user.turn_id,f.space)!.attempt_count,3);
}));
test('S2 lease timeout回収・期限切れ/旧token/異space結果拒否',()=>fixture(async f=>{
  f.repo.supplement(f.space,0); const a=f.repo.claim(f.space,1,10)!; assert.equal(f.repo.claim(f.space,2),undefined);
  const result=await f.provider.embed(a.content,{purpose:'document'}); assert.equal(f.repo.saveReady(a,result,11),false);
  const b=f.repo.claim(f.space,11)!; assert.notEqual(a.lease_token,b.lease_token); assert.equal(f.repo.saveReady(a,result,12),false);
  assert.equal(f.repo.saveReady({...b,source_hash:hashText('wrong')},result,12),false);
  assert.equal(f.repo.saveReady(b,result,12),true);
}));
test('S2 crashed lease最大3回でfailed',()=>fixture(f=>{
  f.repo.supplement(f.space,0); for(const now of [0,10,20])assert(f.repo.claim(f.space,now,10));
  assert.equal(f.repo.claim(f.space,30),undefined); assert.equal(f.repo.row(f.user.turn_id,f.space)!.error_code,'LEASE_EXHAUSTED');
}));
test('S2 rebuildは対象spaceのみ・旧worker無効・旧space ready保持',()=>fixture(async f=>{
  const a=new BackgroundIndexer(f.repo,f.provider,fakeSpec); await a.tick(); const before=f.repo.row(f.user.turn_id,f.space);
  const spec={...fakeSpec,model_revision:'2'}, b=new BackgroundIndexer(f.repo,new FakeEmbeddingProvider('normal','in_process_local',spec),spec);
  f.repo.supplement(b.spaceId,0); const lease=f.repo.claim(b.spaceId,1)!;
  assert.equal(f.repo.rebuild(b.spaceId,2),1); assert.equal(f.repo.saveFailed(lease,'PROVIDER_ERROR',true,3),false);
  assert.deepEqual(f.repo.row(f.user.turn_id,f.space),before); assert.equal(f.repo.readVector(f.user.turn_id,b.spaceId),undefined);
  await b.tick(); assert.equal(f.repo.counts(b.spaceId).ready,1);
}));
test('S2 hash mismatchはstale・再生成で回復',()=>fixture(async f=>{
  const worker=new BackgroundIndexer(f.repo,f.provider,fakeSpec); f.repo.supplement(f.space);
  f.db.prepare('UPDATE turn_embeddings SET source_hash=?').run(hashText('corrupt'));
  await worker.tick(); assert.equal(f.repo.row(f.user.turn_id,f.space)!.status,'stale');
  f.repo.rebuild(f.space); await worker.tick(); assert.equal(f.repo.counts(f.space).ready,1);
}));
test('S2 推論中transactionなし・同worker並行tick拒否',()=>fixture(async f=>{
  let release!:()=>void; const original=f.provider.embed.bind(f.provider);
  f.provider.embed=async(text,options)=>{ assert.equal(f.db.isTransaction,false); await new Promise<void>(r=>release=r); return original(text,options); };
  const worker=new BackgroundIndexer(f.repo,f.provider,fakeSpec), pending=worker.tick();
  await new Promise(r=>setImmediate(r)); assert.equal(await worker.tick(),false); release(); await pending;
  assert.equal(f.repo.counts(f.space).ready,1);
}));
test('S2 pending/ready DB失敗はchat succeededへ非波及・次回回復',()=>fixture(async f=>{
  const lm=new LMStudioProvider(); lm.generate=async(_request,_signal,onDelta)=>{onDelta('回答');};
  const service=new GenerationService(f.chat,lm), run=f.chat.prepareChat(f.id,'q','model',crypto.randomUUID());
  await service.execute(run,()=>{}); const before=f.chat.detail(f.id);
  const worker=new BackgroundIndexer(f.repo,f.provider,fakeSpec);
  f.db.exec("CREATE TRIGGER fail_pending BEFORE INSERT ON turn_embeddings BEGIN SELECT RAISE(ABORT,'injected'); END");
  await assert.rejects(worker.tick()); assert.deepEqual(f.chat.detail(f.id),before);
  f.db.exec('DROP TRIGGER fail_pending');
  f.db.exec("CREATE TRIGGER fail_ready BEFORE UPDATE ON turn_embeddings WHEN NEW.status='ready' BEGIN SELECT RAISE(ABORT,'injected'); END");
  await worker.tick(); assert.deepEqual(f.chat.detail(f.id),before); assert.equal(f.chat.run(f.id,run.run_id).outcome,'succeeded');
  f.db.exec('DROP TRIGGER fail_ready');
  f.repo.rebuild(f.space); while(await worker.tick()){} assert.equal(f.repo.counts(f.space).ready,3);
}));
test('S2 pending補完transaction rollback',()=>fixture(f=>{
  f.chat.addUserTurn(f.id,'other');
  f.db.exec("CREATE TRIGGER fail_second BEFORE INSERT ON turn_embeddings WHEN (SELECT count(*) FROM turn_embeddings)>0 BEGIN SELECT RAISE(ABORT,'injected'); END");
  assert.throws(()=>f.repo.supplement(f.space)); assert.equal(f.repo.counts(f.space).pending,0);
}));
test('S2 CANCELLEDはreadyにしない・TIMEOUTはretry可能',()=>fixture(async f=>{
  const worker=new BackgroundIndexer(f.repo,new FakeEmbeddingProvider('CANCELLED'),fakeSpec);
  await worker.tick(); assert.equal(f.repo.row(f.user.turn_id,f.space)!.error_code,'CANCELLED');
  assert.equal(f.repo.counts(f.space).ready,0); f.repo.rebuild(f.space,0);
  const lease=f.repo.claim(f.space,0)!; f.repo.saveFailed(lease,'TIMEOUT',true,1);
  assert.equal(f.repo.row(f.user.turn_id,f.space)!.next_attempt_at,1001);
}));
test('S2 DB busy中の結果保存失敗・lease回収で回復',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'attchat-s2-busy-')),path=join(dir,'test.sqlite');
  const db=openDatabase(path), other=openDatabase(path); db.exec('PRAGMA busy_timeout=1');
  try {
    const f=setup(db); let now=0, lock=true;
    const original=f.provider.embed.bind(f.provider);
    f.provider.embed=async(text,options)=>{const result=await original(text,options); if(lock)other.exec('BEGIN IMMEDIATE'); return result;};
    const worker=new BackgroundIndexer(f.repo,f.provider,fakeSpec,()=>now);
    await assert.rejects(worker.tick()); assert.equal(f.repo.counts(f.space).ready,0);
    other.exec('ROLLBACK'); lock=false; now=60001; await worker.tick();
    assert.equal(f.repo.counts(f.space).ready,1); assert.equal(f.repo.row(f.user.turn_id,f.space)!.attempt_count,2);
  } finally {if(other.isTransaction)other.exec('ROLLBACK'); other.close(); db.close(); rmSync(dir,{recursive:true,force:true});}
});
test('S2 restartでmissing/expired lease/ready復元',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'attchat-s2-')), path=join(dir,'test.sqlite'); let db=openDatabase(path);
  try {
    const f=setup(db), indexer=new BackgroundIndexer(f.repo,f.provider,fakeSpec,()=>0); await indexer.tick();
    const missing=f.chat.addUserTurn(f.id,'miss'); f.repo.supplement(f.space,0); f.repo.claim(f.space,0,10);
    const extra=f.chat.addUserTurn(f.id,'new'); db.close(); db=openDatabase(path);
    const repo=new SemanticIndexRepository(db), worker=new BackgroundIndexer(repo,new FakeEmbeddingProvider(),fakeSpec,()=>20);
    while(await worker.tick()){} assert.equal(repo.counts(f.space).ready,3);
    assert(repo.readVector(missing.turn_id,f.space)); assert(repo.readVector(extra.turn_id,f.space));
  } finally { db.close(); rmSync(dir,{recursive:true,force:true}); }
});
for (const version of [4,6]) test(`S2 migration ${version}→008 既存rows保全・再実行`,()=>{
  const db=new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,checksum TEXT,applied_at TEXT) STRICT');
    const dir=new URL('../src/server/storage/migrations/',import.meta.url);
    const files=readdirSync(dir).sort().slice(0,version);
    files.forEach((file,i)=>{const sql=readFileSync(new URL(file,dir),'utf8').replace(/\r\n?/g,'\n'); db.exec(sql); db.prepare('INSERT INTO schema_migrations VALUES(?,?,?)').run(i+1,createHash('sha256').update(sql).digest('hex'),'test');});
    const repo=new Repository(db), c=repo.createConversation('legacy'), t=repo.addUserTurn(c.conversation_id,'original'); repo.addMockRun(c.conversation_id,t.turn_id,'answer');
    const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name as string);
    const before=tables.filter(n=>n!=='schema_migrations').map(n=>[n,db.prepare(`SELECT * FROM ${n}`).all()] as const);
    migrate(db); migrate(db); assert.equal(db.prepare('SELECT count(*) n FROM schema_migrations').get()!.n,8);
    for(const [name,rows] of before)assert.deepEqual(db.prepare(`SELECT * FROM ${name}`).all(),rows);
  } finally { db.close(); }
});
test('S2 migration007 DDL失敗は全体rollback',()=>{
  const db=new DatabaseSync(':memory:'); try {
    db.exec('CREATE TABLE embedding_spaces(existing TEXT)'); assert.throws(()=>migrate(db));
    assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name IN ('turns','turn_embeddings','schema_migrations')").get()!.n,0);
  } finally { db.close(); }
});
