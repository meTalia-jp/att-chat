import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { QuickMemoStore, parseQuickMemoMarkdown } from '../src/server/quick-memo.ts';

test('QuickMemoStore prepends Markdown bullets, preserves duplicates, and reloads newest-first after restart', async () => {
  const cache=resolve('.cache');await mkdir(cache,{recursive:true});const directory=await mkdtemp(join(cache,'quick-memo-'));const path=join(directory,'quick-memo.md');
  try{
    const firstProcess=new QuickMemoStore(path);
    assert.deepEqual(await firstProcess.read(),{markdown:'',items:[]});
    await firstProcess.append('最初のメモ');
    assert.equal(await readFile(path,'utf8'),'- 最初のメモ\n');
    await firstProcess.append('同じメモ');
    assert.equal(await readFile(path,'utf8'),'- 同じメモ\n- 最初のメモ\n');
    await firstProcess.append('同じメモ');
    await firstProcess.append('複数行\nメモ');
    const expected='- 複数行\n  メモ\n- 同じメモ\n- 同じメモ\n- 最初のメモ\n';
    assert.equal(await readFile(path,'utf8'),expected);
    assert.deepEqual(parseQuickMemoMarkdown(expected),['複数行\nメモ','同じメモ','同じメモ','最初のメモ']);
    const restartedProcess=new QuickMemoStore(path);
    assert.deepEqual(await restartedProcess.read(),{markdown:expected,items:['複数行\nメモ','同じメモ','同じメモ','最初のメモ']});
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('Production Quick Memo uses a persistent Markdown path with an environment override', async () => {
  const source=await readFile('src/server/main.ts','utf8');
  assert.match(source,/ATTCHAT_QUICK_MEMO/);
  assert.match(source,/data\/quick-memo\.md/);
  assert.match(source,/new QuickMemoStore\(quickMemoPath\)/);
});
