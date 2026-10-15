import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SettingsStore, writeSettingsAtomically } from '../src/server/settings.ts';
import { defaultSettings, restoredProfiles, restoreSelectedModel, settingsMaxBytes } from '../src/shared/settings.ts';
import { SYSTEM_PROFILE_PRESETS } from '../src/shared/system-profile-presets.ts';
import { GenerationService } from '../src/server/generation.ts';
import { LMStudioConnectionRuntime } from '../src/server/model-connection.ts';
import { openDatabase } from '../src/server/storage/database.ts';
import { Repository } from '../src/server/storage/repository.ts';
import { createAppServer } from '../src/server/http.ts';
import { once } from 'node:events';

async function fixture(work: (store: SettingsStore, path: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'attchat-settings-')), path = join(dir,'settings.json');
  try { await work(new SettingsStore(path), path); } finally { await rm(dir, {recursive:true,force:true}); }
}
test('settings missing defaults; atomic save/reload; fixed and custom profiles', () => fixture(async (store,path) => {
  assert.deepEqual(await store.load(),{settings:defaultSettings(),warnings:[]});
  await store.update({profiles:{system:{preset:'thinking_support'},user:{preset:'custom',custom_text:'Practical\r\nprofile'}},ui:{send_key_mode:'enter'}});
  const first=await readFile(path,'utf8');
  assert.equal(first.includes(SYSTEM_PROFILE_PRESETS.thinking_support.text),false);
  const reloaded = await new SettingsStore(path).load();
  assert.equal(restoredProfiles(reloaded.settings).system.text,SYSTEM_PROFILE_PRESETS.thinking_support.text);
  assert.equal(restoredProfiles(reloaded.settings).user.text,'Practical\nprofile');
  await store.update({ui:{right_sidebar_open:false}});
  assert.equal(JSON.parse(await readFile(path,'utf8')).ui.send_key_mode,'enter');
  assert.deepEqual(await readdir(join(path,'..')),['settings.json']);
}));
test('settings corrupt and unknown version preserve original and warn without downgrade', () => fixture(async (store,path) => {
  for (const raw of ['{', JSON.stringify({...defaultSettings(),version:2})]) {
    await writeFile(path,raw); const loaded=await store.load();
    assert.deepEqual(loaded.settings,defaultSettings()); assert.ok(loaded.warnings.length);
    await assert.rejects(store.update({ui:{send_key_mode:'enter'}}));
    assert.equal(await readFile(path,'utf8'),raw);
  }
}));
test('settings read ignores unknown fields and recovers invalid units only', () => fixture(async (store,path) => {
  await writeFile(path,JSON.stringify({version:1,api_key:'not-persisted',general:{reuse_model:'true',startup_screen:'last'},ui:{send_key_mode:'bad',right_sidebar_open:false},model:{connection_mode:null},profiles:{system:{preset:'custom',custom_text:'good',token:'ignored'}}}));
  const loaded=await store.load();assert.equal(loaded.settings.general.startup_screen,'last');assert.equal(loaded.settings.general.reuse_model,true);assert.equal(loaded.settings.ui.right_sidebar_open,false);assert.equal(loaded.settings.ui.send_key_mode,'safe');assert.ok(loaded.warnings.length>=3);
  await store.update({ui:{minimap_mode:'overview'}});
  const raw=await readFile(path,'utf8');assert.equal(raw.includes('api_key'),false);assert.equal(raw.includes('token'),false);
}));
test('settings strict rejection: enums, booleans, NUL, size, credentials, custom-only text', () => fixture(async store => {
  await store.load();
  for(const patch of [
    {version:2},{general:{reuse_model:'false'}},{ui:{send_key_mode:'other'}},
    {model:{connection_mode:null}},{model:{selected_model:'a'.repeat(301)}},{model:{selected_model:'\0'}},
    {profiles:{system:{preset:'custom',custom_text:'\0'}}},{profiles:{user:{preset:'custom',custom_text:'a'.repeat(20001)}}},
    {profiles:{user:{preset:'off',custom_text:'hidden'}}},{profiles:{system:{preset:'unknown'}}},
    {api_key:'x'},{model:{Authorization:'x'}},{ui:{secret:'x'}}, {credential:'x'},
    {profiles:{user:{preset:'custom',custom_text:'x'.repeat(settingsMaxBytes)}}},
  ]) await assert.rejects(store.update(patch));
  assert.deepEqual(store.get().settings,defaultSettings());
}));
test('settings concurrent patches merge serially; write failure preserves old file and memory', () => fixture(async (store,path) => {
  await store.load();
  await Promise.all([store.update({ui:{send_key_mode:'enter'}}),store.update({general:{startup_screen:'last'}}),store.update({profiles:{user:{preset:'expert'}}})]);
  const before=await readFile(path,'utf8');
  await assert.rejects(writeSettingsAtomically(path,'new contents',async temporary => {
    assert.equal(await readFile(temporary,'utf8'),'new contents');
    assert.equal(await readFile(path,'utf8'),before);
    throw new Error('replace failed');
  }));
  assert.equal(await readFile(path,'utf8'),before);
  assert.deepEqual(await readdir(join(path,'..')),['settings.json']);
  const failing=new SettingsStore(path,async () => {throw new Error('disk failed');});await failing.load();
  await assert.rejects(failing.update({ui:{send_key_mode:'safe'}}));
  assert.equal(await readFile(path,'utf8'),before);assert.equal(failing.get().settings.ui.send_key_mode,'enter');
  await assert.rejects(writeSettingsAtomically(join(path,'child'),'{}'));
  assert.equal(await readFile(path,'utf8'),before);
}));
test('settings oversized file falls back without writing', () => fixture(async (store,path) => {
  await writeFile(path,' '.repeat(settingsMaxBytes+1));assert.ok((await store.load()).warnings.length);
}));
test('saved model requires matching fetched ID and reuse flag', () => {
  const settings=defaultSettings();settings.model.selected_model='qwen';
  assert.equal(restoreSelectedModel(settings,['qwen']).model,'qwen');
  assert.equal(restoreSelectedModel(settings,['other']).model,'');assert.ok(restoreSelectedModel(settings,[]).warning);
  settings.general.reuse_model=false;assert.deepEqual(restoreSelectedModel(settings,['qwen']),{model:'',warning:''});
});
test('connection checks before save before provider apply, failure preserves both; API cannot bypass connection check', () => fixture(async (store,path) => {
  await store.load(); const db=openDatabase(':memory:'),repo=new Repository(db),service=new GenerationService(repo);
  const runtime=new LMStudioConnectionRuntime(service,store);
  const original=globalThis.fetch;const calls:string[]=[];
  globalThis.fetch=(async (url:unknown) => {calls.push(String(url));return new Response(JSON.stringify({data:[{id:'qwen'}]}),{status:200});}) as typeof fetch;
  try {
    await runtime.checkAndApply('lm_studio_advanced','http://Z690:1234/v1');
    assert.deepEqual(calls,['http://z690:1234/v1/models']);assert.equal(service.provider.baseUrl,'http://z690:1234/v1');
    const loaded=await new SettingsStore(path).load();assert.equal(loaded.settings.model.connection_mode,'lm_studio_advanced');
    globalThis.fetch=(async()=>{throw new Error('offline');}) as typeof fetch;
    await assert.rejects(runtime.checkAndApply('lm_studio_simple'));assert.equal(store.get().settings.model.connection_mode,'lm_studio_advanced');assert.equal(service.provider.baseUrl,'http://z690:1234/v1');
    const failStore=new SettingsStore(path,async()=>{throw new Error('disk');});await failStore.load();
    globalThis.fetch=(async()=>new Response(JSON.stringify({data:[]}))) as typeof fetch;
    await assert.rejects(new LMStudioConnectionRuntime(service,failStore).checkAndApply('lm_studio_simple'));assert.equal(service.provider.baseUrl,'http://z690:1234/v1');
  } finally {globalThis.fetch=original;}
  const app=createAppServer(repo,'dist',service,undefined,undefined,undefined,undefined,runtime,store);app.listen(0,'127.0.0.1');await once(app,'listening');
  const url=`http://127.0.0.1:${(app.address() as {port:number}).port}/api/settings`;
  try {
    for(const data of [{model:{connection_mode:'lm_studio_simple'}},{profiles:{system:{preset:'off',secret:'x'}}},{api_key:'x'}]) {
      const res=await fetch(url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});assert.equal(res.status,400);
    }
    const saved=await fetch(url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:{selected_model:'qwen'}})});assert.equal(saved.status,200);
    assert.equal((await (await fetch(url)).json()).settings.model.selected_model,'qwen');
    assert.equal((await fetch(url,{headers:{Origin:'http://evil.invalid'}})).status,403);
  } finally {app.closeAllConnections();await new Promise<void>(done=>app.close(()=>done()));db.close();}
}));
