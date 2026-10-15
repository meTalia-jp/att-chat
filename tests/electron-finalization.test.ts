import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openDatabase } from '../src/server/storage/database.ts';
import { Repository } from '../src/server/storage/repository.ts';
import { SettingsStore } from '../src/server/settings.ts';
import { CollectionStore } from '../src/server/collections.ts';
import { QuickMemoStore } from '../src/server/quick-memo.ts';

const runtimeModule = pathToFileURL(resolve('electron/runtime.mjs')).href;
const singleModule = pathToFileURL(resolve('electron/single-instance.mjs')).href;

test('dev has four isolated defaults and explicit Electron overrides; generic backend env cannot leak in', async () => {
  const { createElectronRuntime } = await import(runtimeModule);
  const root = resolve('.');
  const env = { ATTCHAT_DB:'browser.sqlite', ATTCHAT_SETTINGS:'browser.json', ATTCHAT_COLLECTIONS:'browser-collections.json', ATTCHAT_QUICK_MEMO:'browser.md' };
  const config = createElectronRuntime(root, env);
  for (const [key, filename] of Object.entries({databasePath:'electron-skeleton-v01.sqlite',settingsPath:'electron-settings-v1.json',collectionsPath:'electron-collections-v1.json',quickMemoPath:'electron-quick-memo.md'})) {
    assert.equal(config[key], resolve(root,'.cache',filename));
  }
  const custom = createElectronRuntime(root, { ...env, ATTCHAT_ELECTRON_DB:'custom/db', ATTCHAT_ELECTRON_SETTINGS:'custom/settings', ATTCHAT_ELECTRON_COLLECTIONS:'custom/collections', ATTCHAT_ELECTRON_QUICK_MEMO:'custom/memo' });
  assert.equal(custom.databasePath,resolve(root,'custom/db'));
  assert.equal(custom.settingsPath,resolve(root,'custom/settings'));
  assert.equal(custom.collectionsPath,resolve(root,'custom/collections'));
  assert.equal(custom.quickMemoPath,resolve(root,'custom/memo'));
});

test('distribution ignores all storage env overrides and repository location', async () => {
  const { createElectronRuntime } = await import(runtimeModule);
  const distributionDataDirectory = resolve('.cache/fake-userData/data');
  const env = Object.fromEntries(['DB','SETTINGS','COLLECTIONS','QUICK_MEMO'].flatMap(name => [[`ATTCHAT_${name}`,'wrong'],[`ATTCHAT_ELECTRON_${name}`,'also-wrong']]));
  for (const root of [resolve('install-a'), resolve('install-b')]) {
    const config = createElectronRuntime(root,env,{distributionDataDirectory});
    for (const [key,filename] of Object.entries({databasePath:'attchat.sqlite',settingsPath:'settings.json',collectionsPath:'collections.json',quickMemoPath:'quick-memo.md'})) {
      assert.equal(config[key],join(distributionDataDirectory,filename));
      assert.notEqual(config[key],resolve('data',filename));
    }
  }
});

test('fresh distribution data directory and four stores survive reopening from another installation', async () => {
  const { createElectronRuntime } = await import(runtimeModule);
  const directory = await mkdtemp(join(tmpdir(),'attchat-electron-phase1-'));
  let db: ReturnType<typeof openDatabase> | undefined;
  try {
    const options = {distributionDataDirectory:join(directory,'userData','data')};
    const config = createElectronRuntime(join(directory,'install-a'),{},options);
    await mkdir(dirname(config.databasePath),{recursive:true});
    assert.deepEqual(await readdir(options.distributionDataDirectory),[]);
    db = openDatabase(config.databasePath);
    const repo = new Repository(db);
    const settings = new SettingsStore(config.settingsPath);
    const collections = new CollectionStore(config.collectionsPath,()=>repo.listConversations().map(c=>c.conversation_id));
    const memo = new QuickMemoStore(config.quickMemoPath);
    assert.deepEqual((await settings.load()).warnings,[]);
    assert.deepEqual((await collections.load()).data.collections,[]);
    assert.deepEqual((await memo.read()).items,[]);
    const files = await readdir(options.distributionDataDirectory);
    assert.ok(files.includes('attchat.sqlite'));
    for (const name of ['settings.json','collections.json','quick-memo.md']) assert.ok(!files.includes(name));
    const conversation = repo.createConversation('Persistent conversation');
    repo.addUserTurn(conversation.conversation_id,'Persistent turn');
    await settings.update({general:{startup_screen:'last'}});
    await collections.create('Persistent collection');
    const collection = collections.get().data.collections[0];
    await collections.assign(collection.id,conversation.conversation_id);
    await memo.append('Persistent memo');
    db.close(); db = undefined;
    const restarted = createElectronRuntime(join(directory,'install-b'),{},options);
    db = openDatabase(restarted.databasePath);
    const restoredRepo = new Repository(db);
    assert.equal(restoredRepo.getConversation(conversation.conversation_id).title,'Persistent conversation');
    assert.equal(restoredRepo.listTurns(conversation.conversation_id)[0].content,'Persistent turn');
    assert.equal((await new SettingsStore(restarted.settingsPath).load()).settings.general.startup_screen,'last');
    const restoredCollections = await new CollectionStore(restarted.collectionsPath,()=>restoredRepo.listConversations().map(c=>c.conversation_id)).load();
    assert.equal(restoredCollections.data.membership[conversation.conversation_id],collection.id);
    assert.equal(restoredCollections.data.collections[0].name,'Persistent collection');
    assert.deepEqual((await new QuickMemoStore(restarted.quickMemoPath).read()).items,['Persistent memo']);
  } finally {
    db?.close();
    assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep+'attchat-electron-phase1-'));
    await rm(directory,{recursive:true,force:true});
  }
});

class FakeApp extends EventEmitter {
  calls: string[] = [];
  acquired = true;
  requestSingleInstanceLock() { this.calls.push('lock'); return this.acquired; }
  quit() { this.calls.push('quit'); }
  whenReady() { this.calls.push('ready'); return Promise.resolve(); }
}
function fakeWindow(minimized = false) {
  const calls: string[] = [];
  return { calls, isDestroyed:()=>false, isMinimized:()=>minimized, restore:()=>{calls.push('restore');minimized=false;},show:()=>calls.push('show'),focus:()=>calls.push('focus') };
}
test('lock failure quits before readiness, storage, ports or either child', async () => {
  const { startSingleInstance } = await import(singleModule);
  const app = new FakeApp(); app.acquired=false;
  await startSingleInstance(app,()=>{throw new Error('startup must not execute');},assert.fail);
  assert.deepEqual(app.calls,['lock','quit']);
  assert.equal(app.listenerCount('second-instance'),0);
});
test('primary startup happens once and second instance restores, shows and focuses existing window', async () => {
  const { startSingleInstance } = await import(singleModule);
  const app = new FakeApp(), window = fakeWindow(true);
  await startSingleInstance(app,(setWindow: (window:unknown)=>void)=>{app.calls.push('storage','ports','backend','frontend');setWindow(window);},assert.fail);
  app.emit('second-instance');
  assert.deepEqual(window.calls,['restore','show','focus']);
  app.emit('second-instance');
  assert.deepEqual(window.calls,['restore','show','focus','show','focus']);
  assert.deepEqual(app.calls,['lock','ready','storage','ports','backend','frontend']);
});
test('second instance during startup is focused when window becomes available', async () => {
  const { startSingleInstance } = await import(singleModule);
  const app = new FakeApp(), window = fakeWindow();
  const started = startSingleInstance(app,(setWindow: (window:unknown)=>void)=>setWindow(window),assert.fail);
  app.emit('second-instance');
  await started;
  assert.deepEqual(window.calls,['show','focus']);
});
test('main gates real startup behind lock, injects all four paths and preserves Browser defaults', async () => {
  const main = await readFile('electron/main.mjs','utf8');
  assert.match(main,/startSingleInstance\(app, start,/);
  assert.match(main,/app.isPackaged \? resolve\(app.getPath\('userData'\), 'data'\)/);
  assert.ok(main.indexOf('async function start(setWindow)') < main.indexOf('const runtime = createElectronRuntime'));
  for (const [env,key] of Object.entries({DB:'databasePath',SETTINGS:'settingsPath',COLLECTIONS:'collectionsPath',QUICK_MEMO:'quickMemoPath'})) assert.ok(main.includes(`ATTCHAT_${env}: runtime.${key}`));
  const backend = await readFile('src/server/main.ts','utf8');
  for (const filename of ['attchat.sqlite','settings.json','collections.json','quick-memo.md']) assert.ok(backend.includes(`data/${filename}`));
});
