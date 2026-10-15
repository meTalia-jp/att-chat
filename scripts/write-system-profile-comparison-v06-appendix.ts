import { readFileSync,writeFileSync } from 'node:fs';

type StoredRun={
  model:string;
  subject:string;
  system_profile:string;
  answer:string;
  reasoning:string;
  diagnostics:{finish_reason:string;content_chars:number;reasoning_chars:number}|null;
  error:string|null;
  elapsed_ms:number|null;
};

const input='docs/system-profile-comparison-v06-data/runs.json';
const output='docs/system-profile-comparison-v06-data/answers.md';
const data=JSON.parse(readFileSync(input,'utf8')) as {runs:StoredRun[]};
const sections=data.runs.map(run=>{
  const answer=run.answer?run.answer.replace(/[ \t]+$/gm,''):'_No final answer was returned._';
  const reasoning=run.reasoning?run.reasoning.replace(/[ \t]+$/gm,''):'_Reasoning text was not returned._';
  return `## ${run.model} — ${run.subject} — ${run.system_profile}\n\n`+
    `- finish_reason: ${run.diagnostics?.finish_reason??'error'}\n`+
    `- Answer characters: ${run.diagnostics?.content_chars??run.answer.length}\n`+
    `- Reasoning characters: ${run.diagnostics?.reasoning_chars??run.reasoning.length}\n`+
    `- Elapsed: ${run.elapsed_ms===null?'not returned':`${(run.elapsed_ms/1000).toFixed(3)} s`}\n`+
    `- Error: ${run.error??'none'}\n\n`+
    `### Full answer\n\n${answer}\n\n<details><summary>Reasoning</summary>\n\n${reasoning}\n\n</details>`;
});

writeFileSync(output,
  `# System Profile Comparison v0.6 — Full Answers\n\n`+
  `表示用Markdownでは行末空白だけを除去しています。正本のrequest snapshot、回答、reasoningは `+
  `\`runs.json\` を参照してください。\n\n${sections.join('\n\n---\n\n')}\n`,
  'utf8');
