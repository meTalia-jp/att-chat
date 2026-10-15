import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { markers } from './fixture.ts';
import { conditions, preview } from './experiment.ts';

// Factual appendix only. Subjective assessment lives in the hand-written report.
const directory=resolve(process.argv[2] ?? 'docs/laboratory/context-correction-v01-data');
let output='# Context Correction v0.1 — Automatic checks / 全回答\n\n生成元: report.ts。文字数はUTF-16、ContextはTurnラベル込み、Inputはsystem+user本文のみ。token数ではない。全Run Human review: pending。回答本文はモデル出力を無修正で引用する。\n\n';
const rows:string[]=[];
let answers='';
for(const marker of markers) for(const condition of conditions) {
  const p=preview(marker,condition);
  const file=`${marker.id}-${condition}.json`;
  const r=JSON.parse(await readFile(resolve(directory,file),'utf8'));
  assert.deepEqual(r.request,p.request);
  assert.equal(r.request_sha256,createHash('sha256').update(JSON.stringify(r.request)).digest('hex'));
  assert.ok(r.automatic.marker_match && r.automatic.no_future_turns);
  assert.deepEqual(r.included_turn_ids,p.included_turn_ids);
  assert.equal(r.error,null); assert.equal(r.diagnostics.finish_reason,'stop');
  assert.equal(r.output_utf16,r.answer.length); assert.equal(r.human_review,'pending');
  rows.push(`| ${marker.id}/${condition} | ${r.included_turn_ids.join(', ')||'なし'} | ${r.included_turn_ids.length} | ${r.context_utf16} | ${r.input_utf16} | ${r.output_utf16} | stop / なし |`);
  answers+=`\n## Marker ${marker.id} / 条件 ${condition}\n\n[元データ・送信全文・SHA-256](${file})\n\n日時: ${r.started} → ${r.finished}。Human review: pending。\n\n${r.answer.split('\n').map((line:string)=>'> '+line).join('\n')}\n`;
}
output+='16/16: 保存requestと現在のPreview一致、request SHA一致、Marker一致、後続Turnなし、errorなし、finish_reason=stop。各Run独立system+userの2message。usage tokensは全件nullで計測不能。\n\n| Marker/条件 | Included Turn IDs | Turn数 | Context量 | Input総量 | 回答長 | 終端 / error |\n|---|---|---:|---:|---:|---:|---|\n'+rows.join('\n')+'\n'+answers;
await writeFile(resolve(directory,'responses.md'),output);
console.log('Validated 16 saved runs; responses.md written (no model call).');
