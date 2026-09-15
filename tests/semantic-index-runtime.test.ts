import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { openDatabase } from '../src/server/storage/database.ts';
import { Repository } from '../src/server/storage/repository.ts';
import { SemanticIndexRepository } from '../src/semantic/index-repository.ts';
import { launchSemanticWorker } from '../src/semantic/launch.ts';

test('S2 実worker別プロセス・384 BLOB・長文拒否・restart（opt-in）', {skip:!process.env.ATTCHAT_S2_MODEL_DIR}, async()=>{
  const dir=mkdtempSync(join(tmpdir(),'attchat-s2-runtime-')), path=join(dir,'test.sqlite');
  const db=openDatabase(path), chat=new Repository(db), repo=new SemanticIndexRepository(db);
  const previous=process.env.ATTCHAT_EMBEDDING_MODEL_DIR;
  process.env.ATTCHAT_EMBEDDING_MODEL_DIR=process.env.ATTCHAT_S2_MODEL_DIR;
  let child: ReturnType<typeof launchSemanticWorker>;
  const space='embedding-space-v1:31929068c80e20d1a5beac7e6adc985c7690f5a634f9b2177a4b8aeffdb6cf9a';
  const waitReady=async(expected:number)=>{
    const deadline=Date.now()+30000;
    while(Date.now()<deadline){
      if(db.prepare('SELECT 1 FROM embedding_spaces WHERE space_id=?').get(space) && repo.counts(space).ready===expected && repo.counts(space).failed===1) return;
      if(child?.exitCode!==null) throw new Error('WORKER_EXITED');
      await delay(100);
    }
    throw new Error('WORKER_TIMEOUT');
  };
  const stop=async()=>{if(child && child.exitCode===null){const exited=once(child,'exit'); child.kill(); await exited;} child=undefined;};
  try {
    const id=chat.createConversation('runtime').conversation_id, user=chat.addUserTurn(id,'過去の会話');
    chat.addMockRun(id,user.turn_id,'Conversation history'); chat.addUserTurn(id,'会話履歴 '.repeat(1000));
    const before=chat.detail(id); child=launchSemanticWorker(path); assert(child); await waitReady(2);
    assert.equal(repo.readVector(user.turn_id,space)?.length,384); assert.equal(repo.counts(space).input_too_long,1);
    const saved=repo.row(user.turn_id,space); await stop();
    chat.addUserTurn(id,'再起動時の追加'); child=launchSemanticWorker(path); assert(child); await waitReady(3);
    assert.deepEqual(repo.row(user.turn_id,space),saved); assert.deepEqual(chat.listRuns(id),before.runs);
    console.log('S2 runtime: ready=3 failed=1 INPUT_TOO_LONG=1; restart preserved');
  } finally {await stop(); if(previous===undefined)delete process.env.ATTCHAT_EMBEDDING_MODEL_DIR; else process.env.ATTCHAT_EMBEDDING_MODEL_DIR=previous; db.close(); rmSync(dir,{recursive:true,force:true});}
});
