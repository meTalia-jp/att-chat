import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../src/server/storage/database.ts';
import { Repository } from '../src/server/storage/repository.ts';
import { SimpleSessions } from '../src/laboratory/simple-sessions.ts';
import { RunFiles } from '../src/laboratory/single-text/run-files.ts';
import type { SimpleRun } from '../src/laboratory/run-contracts.ts';
import { experiments } from '../src/laboratory/catalog.ts';

test('Simple session saves before start, references only new generations, snapshots definition, explicit end and immutable past',()=>{
  const dir=mkdtempSync(join(tmpdir(),'lab-runs-')),db=openDatabase(join(dir,'chat.sqlite')),repo=new Repository(db);
  const files=new RunFiles<SimpleRun>(join(dir,'runs'),'simple-marker-chat');
  try {
    const c=repo.createConversation('session');
    const sessions=new SimpleSessions(files,repo,'http://127.0.0.1:1234/v1');
    assert.equal(sessions.current(),null);assert.deepEqual(sessions.list(),[]);
    const start=sessions.start(c.conversation_id);
    assert.equal(start.validation_status,'not_run');assert.equal(start.status,'running');
    assert.equal(files.read(start.run_id).conversation_id,c.conversation_id);
    assert.throws(()=>sessions.start(c.conversation_id),/継続中/);
    const oldTitle=experiments[0].title;experiments[0].title='changed after start';
    try { assert.equal(files.read(start.run_id).experiment_snapshot.title,oldTitle); }finally{experiments[0].title=oldTitle;}
    const end=sessions.finish(start.run_id);assert.equal(end.status,'completed');assert.ok(end.finished_at);
    assert.equal(end.validation_status,'not_run');assert.deepEqual(end.generation_run_ids,[]);
    const bytes=readFileSync(join(dir,'runs',start.run_id+'.json'),'utf8');
    const next=sessions.start(c.conversation_id);assert.notEqual(next.run_id,start.run_id);
    sessions.shutdown();assert.equal(files.read(next.run_id).status,'interrupted');
    assert.equal(readFileSync(join(dir,'runs',start.run_id+'.json'),'utf8'),bytes);
    // Phase 5 JSON had neither marker_events nor the new definition fields.
    const {marker_events: _events,...legacy}=end;
    const {schema_version:_schema,derived_from:_derived,procedure:_procedure,acceptance:_acceptance,...oldDefinition}=end.experiment_snapshot;
    files.save({...legacy,experiment_snapshot:oldDefinition});
    const legacyBytes=readFileSync(join(dir,'runs',start.run_id+'.json'),'utf8');
    new SimpleSessions(files,repo,'local');
    assert.equal(files.read(start.run_id).marker_events,undefined);
    assert.deepEqual(files.read(start.run_id).experiment_snapshot,oldDefinition);
    assert.equal(readFileSync(join(dir,'runs',start.run_id+'.json'),'utf8'),legacyBytes);
  } finally {files.close();db.close();rmSync(dir,{recursive:true,force:true});}
});

test('Simple start/end storage failure never advances state; restart recovers running JSON',()=>{
  const dir=mkdtempSync(join(tmpdir(),'lab-failure-')),db=openDatabase(join(dir,'chat.sqlite')),repo=new Repository(db);
  const files=new RunFiles<SimpleRun>(join(dir,'runs'),'simple-marker-chat');
  try {
    const c=repo.createConversation('session'),sessions=new SimpleSessions(files,repo,'local');
    const save=files.save.bind(files);
    files.save=()=>{throw new Error('disk failure');};
    assert.throws(()=>sessions.start(c.conversation_id),/disk failure/);assert.equal(sessions.current(),null);assert.equal(files.all().length,0);
    files.save=save;const run=sessions.start(c.conversation_id);
    files.save=()=>{throw new Error('disk failure');};
    assert.throws(()=>sessions.markerEvent(run.run_id,'created','marker-id'),/disk failure/);
    assert.equal(sessions.current()!.marker_events!.length,1);
    assert.throws(()=>sessions.finish(run.run_id),/disk failure/);assert.equal(sessions.current()!.status,'running');
    files.save=save;
    sessions.checkpoint();assert.equal(files.read(run.run_id).marker_events![0].highlight_id,'marker-id');
    const restarted=new SimpleSessions(files,repo,'local');assert.equal(restarted.current(),null);
    assert.equal(restarted.list()[0].status,'interrupted');assert.equal(restarted.list()[0].validation_status,'not_run');
    assert.equal(restarted.list()[0].marker_events![0].operation,'created');
    assert.throws(()=>restarted.start('missing'));
  } finally {files.close();db.close();rmSync(dir,{recursive:true,force:true});}
});
