import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {markers} from './long-fixture.ts';
import {modes,levels,preview,escalation} from './handoff-experiment.ts';
const dir=resolve(process.argv[2]??'docs/laboratory/context-correction-v03-data');
const rows:string[]=[];let answers='';
for(const m of markers)for(const mode of modes)for(const level of levels){
 const p=preview(m,mode,level),name=`${m.id}-${mode}-${level}.json`;
 const r=JSON.parse(await readFile(resolve(dir,name),'utf8'));
 for(const [key,value]of Object.entries(p))assert.deepEqual(r[key],value,`${name}: ${key}`);
 assert.equal(r.request_sha256,createHash('sha256').update(JSON.stringify(r.request)).digest('hex'));
 assert.ok(Object.values(r.automatic).every(Boolean));
 assert.equal(r.output_utf16,r.answer.length);assert.equal(r.error,null);
 assert.ok(['stop','length'].includes(r.diagnostics.finish_reason));
 assert.equal(r.escalation_candidate,escalation(r.answer).escalation_candidate);
 rows.push(`| ${m.id}/${mode}/${level} | ${r.local_range.start}–${r.local_range.end} | ${r.context_utf16} / ${r.included_percentage.toFixed(2)}% | ${r.history_utf16} | ${r.input_utf16} | ${r.output_utf16} | ${r.diagnostics.finish_reason} | ${r.escalation_candidate} |`);
 answers+=`\n## ${m.id} / ${mode} / ${level}\n\n[request・Preview・automatic・diagnostics](${name})。Human review: pending。Error: ${r.error}。Escalation evidence: ${r.escalation_evidence.join(' / ')||'なし'}。\n\n${r.answer.split('\n').map((line:string)=>'> '+line).join('\n')}\n`;
}
await writeFile(resolve(dir,'responses.md'),'# Context Correction v0.3 — Automatic / 全回答\n\n24 Run。全requestと現在Preview・SHA・window・Mode・Level・history ID・文字数を照合。Source T20=2650 UTF-16。S履歴T1–T20、N履歴なし。error0。文字数はUTF-16、tokensではない。Escalationは表現のliteral screening、再問い合わせなし。主観評価と分離しHuman review全件pending。\n\n| Marker/Mode/Level | Window | Local / Source割合 | History | Total input | Response | finish_reason | escalation_candidate |\n|---|---|---|---:|---:|---:|---|---|\n'+rows.join('\n')+'\n'+answers);
console.log('24 saved runs validated; responses.md generated without model calls');
