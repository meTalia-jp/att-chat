import { readFile, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { writeFileAtomically } from './atomic-file.ts';
import { InputError } from './storage/repository.ts';
import { emptyCollections, type CollectionData, type CollectionResult } from '../shared/collections.ts';

const maxBytes = 4 * 1024 * 1024;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Collection形式が不正です');
  return value as Record<string, unknown>;
}
function name(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200 || /[\u0000-\u001f\u007f]/.test(value)) throw new InputError('名前は空白以外の1〜200文字で指定してください');
  return value.trim();
}
function id(value: unknown): value is string { return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value); }
function validate(value: unknown): CollectionData {
  const data = object(value);
  if (data.version !== 1 || !Array.isArray(data.collections)) throw new Error('未対応のCollection形式です');
  if (Object.keys(data).some(key => !['version','collections','membership'].includes(key))) throw new Error('未対応のCollection項目です');
  const ids = new Set<string>(), names = new Set<string>();
  const collections = data.collections.map(value => {
    const item = object(value), label = name(item.name);
    if (!id(item.id) || ids.has(item.id) || names.has(label) || Object.keys(item).some(key => !['id','name'].includes(key))) throw new Error('Collection定義が不正です');
    ids.add(item.id); names.add(label); return { id:item.id, name:label };
  });
  const entries = Object.entries(object(data.membership));
  if (entries.some(([key, value]) => !id(key) || !id(value))) throw new Error('membership形式が不正です');
  return { version:1, collections, membership:Object.fromEntries(entries) as Record<string,string> };
}

export class CollectionStore {
  readonly path: string;
  private value = emptyCollections();
  private blocked = false;
  private pending: Promise<unknown> = Promise.resolve();
  private saveFailed = false;
  private conversationIds: () => readonly string[];
  private writer: typeof writeFileAtomically;
  constructor(path: string, conversationIds: () => readonly string[], writer = writeFileAtomically) {
    this.path = path; this.conversationIds = conversationIds; this.writer = writer;
  }
  async load(): Promise<CollectionResult> {
    await this.pending;
    this.value = emptyCollections(); this.blocked = false;
    try {
      if ((await stat(this.path)).size > maxBytes) throw new Error('Collectionファイルが大きすぎます');
      this.value = validate(JSON.parse(await readFile(this.path, 'utf8')));
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.blocked = true; }
    return this.get();
  }
  get(): CollectionResult {
    if (this.blocked) return { data:emptyCollections(), writable:false, warnings:['コレクションを読み込めません。全会話を未分類で表示しています。元ファイルを保全するため編集を停止しています。ファイルを確認して再起動してください。'] };
    const conversations = new Set(this.conversationIds()), collections = new Set(this.value.collections.map(c => c.id));
    const entries = Object.entries(this.value.membership);
    const valid = entries.filter(([conversation, collection]) => conversations.has(conversation) && collections.has(collection));
    return { data:{ ...structuredClone(this.value), membership:Object.fromEntries(valid) }, writable:true,
      warnings: valid.length === entries.length ? [] : ['存在しない会話またはコレクションへの所属を表示から除外しました。元の所属情報はファイルに保持しています。'] };
  }
  async flush() { await this.pending; if (this.saveFailed) throw new Error('Collection save failed'); }
  private mutate(edit: (next: CollectionData) => void): Promise<CollectionResult> {
    const operation = this.pending.then(async () => {
      if (this.blocked) throw new InputError('元ファイルを保全するためCollection編集を停止しています', 503);
      const next = structuredClone(this.value); edit(next);
      const serialized = JSON.stringify(next, null, 2) + '\n';
      if (Buffer.byteLength(serialized) > maxBytes) throw new InputError('Collectionの保存上限を超えています', 413);
      try { await this.writer(this.path, serialized); }
      catch (error) { this.saveFailed = true; throw error; }
      this.value = next;
      return this.get();
    });
    this.pending = operation.catch(() => undefined); return operation;
  }
  private collection(data: CollectionData, id: string) {
    const item = data.collections.find(c => c.id === id);
    if (!item) throw new InputError('コレクションがありません', 404);
    return item;
  }
  private uniqueName(data: CollectionData, value: unknown, except?: string) {
    const label = name(value);
    if (data.collections.some(c => c.id !== except && c.name === label)) throw new InputError('同名のコレクションがあります', 409);
    return label;
  }
  create(value: unknown) { return this.mutate(next => { next.collections.push({ id:randomUUID(), name:this.uniqueName(next, value) }); }); }
  rename(id: string, value: unknown) { return this.mutate(next => { this.collection(next, id).name = this.uniqueName(next, value, id); }); }
  assign(collectionId: string, conversationId: string) {
    return this.mutate(next => {
      this.collection(next, collectionId);
      if (!this.conversationIds().includes(conversationId)) throw new InputError('会話がありません', 404);
      Object.defineProperty(next.membership, conversationId, { value:collectionId, enumerable:true, configurable:true, writable:true });
    });
  }
  unassign(collectionId: string, conversationId: string) {
    return this.mutate(next => { this.collection(next, collectionId); if (Object.hasOwn(next.membership, conversationId) && next.membership[conversationId] === collectionId) delete next.membership[conversationId]; });
  }
  deleteCollection(id: string) {
    return this.mutate(next => {
      this.collection(next, id); next.collections = next.collections.filter(c => c.id !== id);
      next.membership = Object.fromEntries(Object.entries(next.membership).filter(([, collection]) => collection !== id));
    });
  }
}
