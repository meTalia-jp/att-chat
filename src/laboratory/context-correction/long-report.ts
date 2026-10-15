import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { markers } from './long-fixture.ts';
import { conditions, preview } from './long-experiment.ts';

// Factual appendix only. Subjective assessment lives in the hand-written report.
const directory=resolve(process.argv[2] ?? 'docs/laboratory/context-correction-v02-data');
let output='# Context Correction v0.2 — Automatic checks / 全回答\n\n生成元: report.ts。文字数はUTF-16、Contextは挿入タグを除く生slice、Inputはsystem+user本文のみ。token数ではない。全Run Human review: pending。回答本文はモデル出力を無修正で引用する。\n\n';
const rows:string[]=[];
let answers='';
for(const marker of markers) for(const condition of conditions) {
  const p=preview(marker,condition);
  const file=`${marker.id}-${condition}.json`;
  const r=JSON.parse(await readFile(resolve(directory,file),'utf8'));
  assert.deepEqual(r.request,p.request);
  assert.equal(r.request_sha256,createHash('sha256').update(JSON.stringify(r.request)).digest('hex'));
  assert.deepEqual(r.automatic,p.automatic);
  assert.ok(Object.values(r.automatic).every(Boolean));
  assert.deepEqual(r.local_range,p.local_range);
  assert.equal(r.context_utf16,p.context_utf16);
  assert.equal(r.included_percentage,p.included_percentage);
  assert.deepEqual(r.included_turn_ids,p.included_turn_ids);
  assert.equal(r.error,null); assert.ok(['stop','length'].includes(r.diagnostics.finish_reason));
  assert.equal(r.output_utf16,r.answer.length); assert.equal(r.human_review,'pending');
  rows.push(`| ${marker.id}/${condition} | ${r.local_range?`${r.local_range.context_start_offset}–${r.local_range.context_end_offset}`:'なし'} | ${r.context_utf16} | ${r.included_percentage.toFixed(2)}% | ${r.input_utf16} | ${r.output_utf16} | ${r.diagnostics.finish_reason} / なし |`);
  answers+=`\n## Marker ${marker.id} / 条件 ${condition}\n\n[元データ・送信全文・SHA-256](${file})\n\n日時: ${r.started} → ${r.finished}。Human review: pending。\n\n${r.answer.split('\n').map((line:string)=>'> '+line).join('\n')}\n`;
}
output+='16/16: 保存requestと現在のPreview一致、request SHA一致、Marker一致、grapheme境界・Source範囲内、他Turnなし、errorなし。finish_reasonは各行参照（lengthは途中終了、品質評価上の制限）。Source T20は2650 UTF-16。Context量と割合は挿入タグを除く生のsliceであり、AはFocusを別掲するため0。各Run独立system+userの2message。usage tokensは全件nullで計測不能。\n\n| Marker/条件 | Window [start,end) | Context量 | Source割合 | Input総量 | 回答長 | 終端 / error |\n|---|---|---:|---:|---:|---:|---|\n'+rows.join('\n')+'\n'+answers;
await writeFile(resolve(directory,'responses.md'),output);
console.log('Validated 16 saved runs; responses.md written (no model call).');
