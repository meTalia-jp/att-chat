import { readFileSync, writeFileSync } from 'node:fs';

type StoredRun = {
  model: string;
  subject: string;
  profile: string;
  answer: string;
  diagnostics: { finish_reason:string; content_chars:number; reasoning_chars:number } | null;
  error: string | null;
  elapsed_ms: number | null;
};

const input = 'docs/user-profile-preset-comparison-v03-data/runs.json';
const output = 'docs/user-profile-preset-comparison-v03-data/answers.md';
const data = JSON.parse(readFileSync(input,'utf8')) as { runs:StoredRun[] };
const sections = data.runs.map(run => {
  const answer = run.answer ? run.answer.replace(/[ \t]+$/gm,'') : '_No final answer was returned._';
  return `## ${run.model} — ${run.subject} — ${run.profile}\n\n` +
    `- finish_reason: ${run.diagnostics?.finish_reason ?? 'error'}\n` +
    `- Answer characters: ${run.diagnostics?.content_chars ?? run.answer.length}\n` +
    `- Reasoning characters: ${run.diagnostics?.reasoning_chars ?? 'not returned'}\n` +
    `- Elapsed: ${run.elapsed_ms === null ? 'not returned' : `${(run.elapsed_ms / 1000).toFixed(3)} s`}\n` +
    `- Error: ${run.error ?? 'none'}\n\n### Full answer\n\n${answer}`;
});

writeFileSync(
  output,
  `# User Profile Preset Comparison v0.3 — Full Answers\n\n` +
  `表示用Markdownでは行末空白だけを除去しています。正本の回答とrequest snapshotは \`runs.json\` を参照してください。\n\n` +
  `${sections.join('\n\n---\n\n')}\n`,
  'utf8',
);
