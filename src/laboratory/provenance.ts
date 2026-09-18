import { execFileSync } from 'node:child_process';

export function provenance() {
  try { return {
    source_commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(),
    dirty_state: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8', windowsHide: true }).trim().length > 0,
  }; } catch { return { source_commit: null, dirty_state: null }; }
}
