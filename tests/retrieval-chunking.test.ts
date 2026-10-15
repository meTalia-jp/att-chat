import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildRetrievalSegments, splitSentenceUnits } from '../src/laboratory/retrieval-chunking/chunker.ts';
import { chunkingFixtureTurns } from '../src/laboratory/retrieval-chunking/fixture.ts';
import { defaultChunkingConfig, runChunkingExperiment } from '../src/laboratory/retrieval-chunking/run.ts';

test('句点候補は引用閉じまで含め、原文offsetと一致する', () => {
  const content='先生は「保存されます。」と言いました。次です。';
  const units=splitSentenceUnits('T1',content);
  assert.deepEqual(units.map(unit=>unit.text),['先生は「保存されます。」と言いました。','次です。']);
  for(const unit of units) assert.equal(content.slice(unit.startOffset,unit.endOffset),unit.text);
});

test('DB SegmentはTurnと段落を越えず、長さと原文offsetを保つ', () => {
  for(const turn of chunkingFixtureTurns){
    const {segments}=buildRetrievalSegments(turn.turnId,turn.content,defaultChunkingConfig);
    assert.ok(segments.length>0);
    for(const segment of segments){
      assert.equal(turn.content.slice(segment.startOffset,segment.endOffset),segment.text);
      assert.ok(segment.charCount<=defaultChunkingConfig.maxChars,`${segment.segmentId}: ${segment.charCount}`);
      assert.equal(segment.turnId,turn.turnId);
      assert.doesNotMatch(segment.text,/\n\s*\n/u);
    }
  }
  const longTurn=chunkingFixtureTurns.find(turn=>turn.turnId==='T2')!;
  const {segments}=buildRetrievalSegments(longTurn.turnId,longTurn.content,defaultChunkingConfig);
  assert.ok(segments.filter(segment=>segment.blockIndex===4).length>=2,'長い実測誤差段落は長さ規則で分割する');
});

test('仮SQLiteへ原文・文候補・Segmentを保存しプレーンテキストへ再現する', () => {
  const directory=mkdtempSync(join(tmpdir(),'att-chat-chunking-'));
  try{
    const database=join(directory,'fixture.sqlite'), output=join(directory,'output.txt');
    const result=runChunkingExperiment(database,output);
    assert.equal(result.turnCount,3);
    const db=new DatabaseSync(database);
    try{
      assert.equal(db.prepare('SELECT count(*) n FROM source_turns').get()!.n,3);
      assert.equal(db.prepare('SELECT count(*) n FROM sentence_units').get()!.n,result.sentenceCount);
      assert.equal(db.prepare('SELECT count(*) n FROM retrieval_segments').get()!.n,result.segmentCount);
      assert.ok(result.segmentCount<result.sentenceCount);
    }finally{db.close();}
    const text=readFileSync(output,'utf8');
    assert.match(text,/PART 2 — Sentence units/);
    assert.match(text,/PART 3 — DB retrieval segments/);
    assert.match(text,/これは保存されます。/);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
