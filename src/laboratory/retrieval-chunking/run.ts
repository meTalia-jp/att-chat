import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildRetrievalSegments, type ChunkingConfig } from './chunker.ts';
import { chunkingFixtureTurns } from './fixture.ts';

export const defaultChunkingConfig: ChunkingConfig = { minChars: 120, targetChars: 220, maxChars: 360 };

function quote(value: string) { return value.replaceAll('\r', '').replaceAll('\n', '\n    '); }

export function runChunkingExperiment(databasePath: string, outputPath: string, config = defaultChunkingConfig) {
  const dbFile = resolve(databasePath), textFile = resolve(outputPath);
  mkdirSync(dirname(dbFile), { recursive: true });
  mkdirSync(dirname(textFile), { recursive: true });
  rmSync(dbFile, { force: true });
  const db = new DatabaseSync(dbFile);
  try {
    db.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE source_turns(turn_id TEXT PRIMARY KEY, role TEXT NOT NULL, content TEXT NOT NULL) STRICT;
      CREATE TABLE sentence_units(
        turn_id TEXT NOT NULL REFERENCES source_turns(turn_id), block_index INTEGER NOT NULL,
        sentence_index INTEGER NOT NULL, start_offset INTEGER NOT NULL, end_offset INTEGER NOT NULL,
        text TEXT NOT NULL, PRIMARY KEY(turn_id,block_index,sentence_index)
      ) STRICT;
      CREATE TABLE retrieval_segments(
        segment_id TEXT PRIMARY KEY, turn_id TEXT NOT NULL REFERENCES source_turns(turn_id),
        block_index INTEGER NOT NULL, segment_index INTEGER NOT NULL, start_offset INTEGER NOT NULL,
        end_offset INTEGER NOT NULL, text TEXT NOT NULL, char_count INTEGER NOT NULL,
        sentence_count INTEGER NOT NULL, boundary_reason TEXT NOT NULL
      ) STRICT;
    `);
    const insertTurn = db.prepare('INSERT INTO source_turns VALUES(?,?,?)');
    const insertSentence = db.prepare('INSERT INTO sentence_units VALUES(?,?,?,?,?,?)');
    const insertSegment = db.prepare('INSERT INTO retrieval_segments VALUES(?,?,?,?,?,?,?,?,?,?)');
    for (const turn of chunkingFixtureTurns) {
      insertTurn.run(turn.turnId, turn.role, turn.content);
      const result = buildRetrievalSegments(turn.turnId, turn.content, config);
      for (const unit of result.sentences) insertSentence.run(unit.turnId, unit.blockIndex, unit.sentenceIndex, unit.startOffset, unit.endOffset, unit.text);
      for (const segment of result.segments) insertSegment.run(segment.segmentId, segment.turnId, segment.blockIndex, segment.segmentIndex, segment.startOffset, segment.endOffset, segment.text, segment.charCount, segment.sentenceCount, segment.boundaryReason);
    }

    const turns = db.prepare('SELECT turn_id,role,length(content) char_count,content FROM source_turns ORDER BY CAST(substr(turn_id,2) AS INTEGER)').all() as Array<Record<string, unknown>>;
    const sentences = db.prepare('SELECT * FROM sentence_units ORDER BY CAST(substr(turn_id,2) AS INTEGER),block_index,sentence_index').all() as Array<Record<string, unknown>>;
    const segments = db.prepare('SELECT * FROM retrieval_segments ORDER BY CAST(substr(turn_id,2) AS INTEGER),segment_index').all() as Array<Record<string, unknown>>;
    const lines = [
      'Retrieval Chunking Laboratory Output',
      '====================================',
      '',
      `Database: ${dbFile}`,
      `Rule: Turn hard boundary / blank-line paragraph hard boundary / sentence boundary 。！？`,
      `Length: minimum ${config.minChars} / target ${config.targetChars} / maximum ${config.maxChars} UTF-16 characters`,
      `Turns: ${turns.length} / Sentence units: ${sentences.length} / Retrieval segments: ${segments.length}`,
      '',
      'PART 1 — Original turns',
      '-----------------------',
      ...turns.flatMap(turn => [``, `[${turn.turn_id}] role=${turn.role} chars=${turn.char_count}`, quote(String(turn.content))]),
      '',
      'PART 2 — Sentence units (period candidates)',
      '------------------------------------------------',
      ...sentences.flatMap(row => [``, `[${row.turn_id} B${Number(row.block_index)+1}.${Number(row.sentence_index)+1}] range=[${row.start_offset},${row.end_offset}) chars=${String(row.text).length}`, quote(String(row.text))]),
      '',
      'PART 3 — DB retrieval segments (length-adjusted)',
      '-------------------------------------------------',
      ...segments.flatMap(row => [``, `[${row.segment_id}] block=${Number(row.block_index)+1} range=[${row.start_offset},${row.end_offset}) chars=${row.char_count} sentences=${row.sentence_count} reason=${row.boundary_reason}`, quote(String(row.text))]),
      '',
      'PART 4 — Reading checklist',
      '--------------------------',
      '1. 「これは保存されます。」単独で、保存対象を特定できるか。',
      '2. DB Segmentでは直前の定義と同じSegmentになり、対象を特定できるか。',
      '3. 「重要です。」や「この比を十分小さくします。」の指示対象が残っているか。',
      '4. 運動量・エネルギー・測定・近似の話題が一つのSegmentへ混ざりすぎていないか。',
      '5. 短いT1/T3はTurn境界を越えず、短いまま残ることが妥当か。',
      '',
      'This file is generated from the SQLite rows; source turns remain authoritative.'
    ];
    writeFileSync(textFile, `${lines.join('\n')}\n`, 'utf8');
    return { databasePath: dbFile, outputPath: textFile, turnCount: turns.length, sentenceCount: sentences.length, segmentCount: segments.length };
  } finally { db.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/(.:)/u, '$1'))) {
  const databasePath = process.argv[2] ?? '.cache/retrieval-chunking/chunking.sqlite';
  const outputPath = process.argv[3] ?? 'docs/laboratory/retrieval-chunking-output.txt';
  console.log(JSON.stringify(runChunkingExperiment(databasePath, outputPath), null, 2));
}
