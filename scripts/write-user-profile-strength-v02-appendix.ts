import { readFileSync, writeFileSync } from 'node:fs';

type StoredRun = {
  model: string;
  condition_id: string;
  audience: string;
  wrapper_strength: string;
  response: string;
  diagnostics: {
    finish_reason: string;
    content_chars: number;
    reasoning_chars: number;
  } | null;
  error: string | null;
  elapsed_ms: number | null;
};

const input = 'docs/user-profile-strength-experiment-v02-data/runs.json';
const output = 'docs/user-profile-strength-experiment-v02-data/answers.md';
const data = JSON.parse(readFileSync(input, 'utf8')) as { runs: StoredRun[] };

const sections = data.runs.map(run => {
  const diagnostics = run.diagnostics;
  const facts = [
    `- Audience: ${run.audience}`,
    `- Wrapper: ${run.wrapper_strength}`,
    `- finish_reason: ${diagnostics?.finish_reason ?? 'error'}`,
    `- Answer characters: ${diagnostics?.content_chars ?? run.response.length}`,
    `- Reasoning characters: ${diagnostics?.reasoning_chars ?? 'not returned'}`,
    `- Elapsed: ${run.elapsed_ms === null ? 'not returned' : `${(run.elapsed_ms / 1000).toFixed(3)} s`}`,
    `- Error: ${run.error ?? 'none'}`,
  ].join('\n');
  const answer = run.response ? run.response.replace(/[ \t]+$/gm, '') : '_No final answer was returned._';
  return `## ${run.model} — ${run.condition_id}\n\n${facts}\n\n### Full answer\n\n${answer}`;
});

writeFileSync(
  output,
  `# User Profile Strength Experiment v0.2 — Full Answers\n\n` +
  `このAppendixは、実モデルRunで得た最終回答を条件別に保存したものです。` +
  `表示用Markdownでは行末空白だけを除去しています。正本の回答、request snapshot、system message、時刻、usage、diagnosticsは \`runs.json\` を参照してください。\n\n` +
  `${sections.join('\n\n---\n\n')}\n`,
  'utf8',
);
