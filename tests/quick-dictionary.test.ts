import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createDictionaryService, createDictionarySearch, type DictionaryResult } from '../src/laboratory/quick-dictionary.ts';

test('invalid input never loads; exact ASCII word lookup normalizes case and trims', async () => {
  let loads = 0;
  const service = createDictionaryService(async () => { loads++; return { experiment: '実験', Apple: 'リンゴ' }; });
  for (const input of ['', '日本語', 'two words', 'two\nwords', 'test123', 'experiment,', 'a-b', "it's", 'ｅｘｐ', 'K']) {
    assert.equal((await service.lookup(input)).status, 'invalid');
  }
  assert.equal(loads, 0);
  for (const input of ['experiment', 'EXPERIMENT', '  experiment\n']) {
    assert.deepEqual(await service.lookup(input), {word:'experiment',meaning:'実験',source:'EJDict-hand',status:'found'});
  }
  assert.equal((await service.lookup('APPLE')).meaning, 'リンゴ');
  for (const input of ['experiments', 'exper', 'constructor', 'qzxqzxunknown']) assert.equal((await service.lookup(input)).status, 'not-found');
  assert.equal(loads, 1);
});

test('concurrent lookup shares first load and failure can be retried', async () => {
  let loads = 0;
  let resolve!: (data: unknown) => void;
  const service = createDictionaryService(() => { loads++; return new Promise(done => { resolve = done; }); });
  const first = service.lookup('experiment'), second = service.lookup('EXPERIMENT');
  assert.equal(loads, 1); resolve({experiment:'実験'});
  assert.equal((await first).status, 'found'); assert.equal((await second).status, 'found');
  let attempts = 0;
  const retry = createDictionaryService(async () => { if (++attempts === 1) throw new Error('offline'); return {experiment:'実験'}; });
  assert.equal((await retry.lookup('experiment')).status, 'unavailable');
  assert.equal((await retry.lookup('experiment')).status, 'found');
  for (const malformed of [null, [], {}, {experiment:12}]) assert.equal((await createDictionaryService(async () => malformed).lookup('experiment')).status,'unavailable');
});

test('latest request wins including invalid input and unmount cancellation', async () => {
  const pending = new Map<string,(r: DictionaryResult) => void>();
  const results: DictionaryResult[] = [];
  const search = createDictionarySearch({lookup:word=>new Promise(done=>pending.set(word,done))}, r=>results.push(r));
  const first=search.search('first'), second=search.search('日本語');
  pending.get('日本語')!({word:'日本語',meaning:'',source:'EJDict-hand',status:'invalid'});await second;
  pending.get('first')!({word:'first',meaning:'最初',source:'EJDict-hand',status:'found'});await first;
  assert.equal(results.at(-1)!.status,'invalid');
  const last=search.search('last');search.cancel();const count=results.length;
  pending.get('last')!({word:'last',meaning:'最後',source:'EJDict-hand',status:'found'});await last;
  assert.equal(results.length,count);
});

test('optional EJDict JSON has a usable experiment entry', { skip: !existsSync('public/dictionaries/ejdict-hand/ejdict.json') }, async () => {
  const service=createDictionaryService(async()=>JSON.parse(await readFile('public/dictionaries/ejdict-hand/ejdict.json','utf8')));
  const result=await service.lookup('experiment');assert.equal(result.status,'found');assert.match(result.meaning,/実験/);
});

test('external dictionary provenance is available without the JSON', async () => {
  const source=JSON.parse(await readFile('public/dictionaries/ejdict-hand/SOURCE.json','utf8'));assert.equal(source.name,'EJDict-hand');
  assert.equal(source.placement_path,'public/dictionaries/ejdict-hand/ejdict.json');
  assert.equal(source.expected_size,5009560);
  assert.match(source.expected_sha256,/^[a-f0-9]{64}$/);
  assert.match(await readFile('public/dictionaries/ejdict-hand/README.md','utf8'),/Public Domain/);
});

test('default loader reports missing external asset and retries; corrupt JSON stays a read failure', async () => {
  const original = globalThis.fetch;
  try {
    for (const response of [new Response('',{status:404}), new Response('',{status:503}), new Response('<html>',{headers:{'content-type':'text/html'}})]) {
      globalThis.fetch=async()=>response;
      assert.equal((await createDictionaryService().lookup('experiment')).status,'missing-asset');
    }
    globalThis.fetch=async()=>{throw new TypeError('offline');};
    const service=createDictionaryService();
    assert.equal((await service.lookup('experiment')).status,'missing-asset');
    globalThis.fetch=async()=>new Response(JSON.stringify({experiment:'実験'}));
    assert.equal((await service.lookup('experiment')).status,'found');
    globalThis.fetch=async()=>new Response('{');
    assert.equal((await createDictionaryService().lookup('experiment')).status,'unavailable');
  } finally { globalThis.fetch=original; }
});
