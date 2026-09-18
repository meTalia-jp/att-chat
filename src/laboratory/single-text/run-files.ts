import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ExperimentRun } from './contracts.ts';
import { SingleTextError } from './contracts.ts';
import type { RunMetadata } from '../run-contracts.ts';

// One owner per directory. JSON is derived from application records, not executable input.
export class RunFiles<T extends RunMetadata = ExperimentRun> {
  readonly directory: string;
  private lockToken = randomUUID();
  private closed = false;
  private experimentIds: readonly string[];
  constructor(directory: string, experimentId: string | readonly string[] = 'single-text-generation') {
    this.experimentIds = typeof experimentId === 'string' ? [experimentId] : experimentId;
    this.directory = resolve(directory); mkdirSync(this.directory, { recursive: true });
    const lock = join(this.directory, '.owner');
    try { writeFileSync(lock, JSON.stringify({ pid: process.pid, token: this.lockToken }), { flag: 'wx' }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const owner = JSON.parse(readFileSync(lock, 'utf8'));
      if (!Number.isInteger(owner.pid) || owner.pid < 1) throw new Error('Run directory lock is invalid');
      try { process.kill(owner.pid, 0); throw new Error('Run directory is already in use'); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; }
      unlinkSync(lock);
      writeFileSync(lock, JSON.stringify({ pid: process.pid, token: this.lockToken }), { flag: 'wx' });
    }
  }
  private path(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new SingleTextError('INVALID_ID', 'Run IDが不正です');
    return join(this.directory, id + '.json');
  }
  read(id: string): T {
    const path = this.path(id);
    if (!existsSync(path)) throw new SingleTextError('NOT_FOUND', 'Runがありません', 404);
    const run = JSON.parse(readFileSync(path, 'utf8')) as T;
    if (run.schema_version !== 1 || run.run_id !== id || !this.experimentIds.includes(run.experiment_id) ||
      !['running','completed','failed','cancelled','interrupted'].includes(run.status)) throw new Error('Invalid Run file');
    return run;
  }
  all() { return readdirSync(this.directory).filter(name => /^[0-9a-f-]{36}\.json$/i.test(name)).map(name => this.read(name.slice(0, -5))); }
  save(run: T) {
    if (this.closed) throw new Error('Run storage is closed');
    const target = this.path(run.run_id), temporary = target + '.' + randomUUID() + '.tmp';
    let descriptor: number | undefined;
    try {
      descriptor = openSync(temporary, 'wx');
      writeFileSync(descriptor, JSON.stringify(run, null, 2), 'utf8');
      fsyncSync(descriptor); closeSync(descriptor); descriptor = undefined;
      renameSync(temporary, target);
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }
  close() {
    if (this.closed) return;
    const path = join(this.directory, '.owner');
    if (JSON.parse(readFileSync(path, 'utf8')).token !== this.lockToken) throw new Error('Run directory owner changed');
    unlinkSync(path); this.closed = true;
  }
}
