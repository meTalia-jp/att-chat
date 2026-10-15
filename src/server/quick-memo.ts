import { readFile } from 'node:fs/promises';
import { writeFileAtomically } from './atomic-file.ts';
import type { QuickMemoDocument } from '../shared/quick-memo.ts';

function normalizeText(value: string) {
  return value.trim().replace(/\r\n?/g, '\n');
}

function markdownItem(text: string) {
  return `- ${text.replace(/\n/g, '\n  ')}\n`;
}

export function parseQuickMemoMarkdown(markdown: string): string[] {
  const items: string[] = [];
  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    if (line.startsWith('- ')) items.push(line.slice(2));
    else if (items.length && line.startsWith('  ')) items[items.length - 1] += `\n${line.slice(2)}`;
  }
  return items;
}

export class QuickMemoStore {
  private pending: Promise<unknown> = Promise.resolve();
  private saveFailed = false;
  private writer: typeof writeFileAtomically;
  readonly path: string;

  constructor(path: string, writer = writeFileAtomically) { this.path = path; this.writer = writer; }
  async flush() { await this.pending; if (this.saveFailed) throw new Error('Quick Memo save failed'); }

  private async readFileOrEmpty() {
    try { return await readFile(this.path, 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
      throw error;
    }
  }

  async read(): Promise<QuickMemoDocument> {
    await this.pending;
    const markdown = await this.readFileOrEmpty();
    return { markdown, items: parseQuickMemoMarkdown(markdown) };
  }

  append(value: string): Promise<QuickMemoDocument> {
    const text = normalizeText(value);
    if (!text) return Promise.reject(new Error('Quickメモが空です'));
    const operation = this.pending.then(async () => {
      const existing = await this.readFileOrEmpty();
      const markdown = markdownItem(text) + existing;
      try { await this.writer(this.path, markdown); }
      catch (error) { this.saveFailed = true; throw error; }
      return { markdown, items: parseQuickMemoMarkdown(markdown) };
    });
    this.pending = operation.catch(() => undefined);
    return operation;
  }
}
