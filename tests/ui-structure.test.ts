import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { JSDOM } from 'jsdom';
import { createElement, createRef, act } from 'react';
import type { createRoot as CreateRoot } from 'react-dom/client';
import type { Highlight, Turn } from '../src/shared/contracts.ts';
import { createQuickDictionaryService } from '../src/client/quick-dictionary.ts';
import { SYSTEM_PROFILE_PRESETS } from '../src/shared/system-profile-presets.ts';
import { USER_PROFILE_PRESETS } from '../src/shared/user-profile-presets.ts';

async function fixture(work: (value: { document: Document; container: HTMLElement; render: (node: React.ReactNode) => Promise<void>; click: (text: string, within?: Element) => Promise<void>; modules: Record<string, any>; dom: JSDOM }) => Promise<void>) {
  const cache = resolve('.cache'); await mkdir(cache, { recursive: true });
  const out = await mkdtemp(join(cache, 'ui-structure-test-'));
  const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost/' });
  const keys = ['window','document','Node','NodeFilter','Range','HTMLElement','ResizeObserver','requestAnimationFrame','cancelAnimationFrame','IS_REACT_ACT_ENVIRONMENT'] as const;
  const saved = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let root: ReturnType<typeof CreateRoot> | undefined;
  try {
    await build({ configFile:false, logLevel:'silent', build:{ ssr:true, outDir:out, rollupOptions:{ input:{ RightSidebar:resolve('src/client/RightSidebar.tsx'), SettingsShell:resolve('src/client/SettingsShell.tsx'), MiniMap:resolve('src/client/MiniMap.tsx') }, output:{entryFileNames:'[name].mjs'} } } });
    for (const key of ['window','document','Node','NodeFilter','Range','HTMLElement'] as const) Object.defineProperty(globalThis, key, { configurable:true, value:key === 'window' ? dom.window : dom.window[key] });
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT:true, ResizeObserver:class { observe(){} disconnect(){} }, requestAnimationFrame:(callback:FrameRequestCallback)=>setTimeout(()=>callback(0),0), cancelAnimationFrame:(id:number)=>clearTimeout(id) });
    dom.window.matchMedia = (() => ({ matches:true, addEventListener(){}, removeEventListener(){} })) as unknown as typeof window.matchMedia;
    dom.window.HTMLElement.prototype.scrollIntoView = function(){};
    const { createRoot } = await import('react-dom/client');
    const modules = {
      ...(await import(pathToFileURL(join(out, 'RightSidebar.mjs')).href)),
      ...(await import(pathToFileURL(join(out, 'SettingsShell.mjs')).href)),
      ...(await import(pathToFileURL(join(out, 'MiniMap.mjs')).href)),
    };
    const container = dom.window.document.getElementById('app')!; root = createRoot(container);
    const render = async (node: React.ReactNode) => { await act(async () => { root!.render(node); await new Promise(done => setTimeout(done, 20)); }); };
    const click = async (text: string, within: Element = container) => { const button = Array.from(within.querySelectorAll('button')).find(item => item.textContent === text); assert.ok(button, text); await act(async () => { button.click(); await new Promise(done => setTimeout(done, 20)); }); };
    await work({ document:dom.window.document, container, render, click, modules, dom });
  } finally {
    if (root) await act(async () => root!.unmount());
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    dom.window.close(); await rm(out, { recursive:true, force:true });
  }
}

test('Right Sidebar keeps Quick tools state across collapse and supports dictionary and duplicate memos', async () => fixture(async ({ container, render, click, modules, dom }) => {
  let savedOpen = true;
  let open = true, host: HTMLDivElement | null = null;
  const controller = createRef<{ openDictionary:(text:string)=>Promise<void>; addMemo:(text:string)=>Promise<void> }>();
  const lookups:string[]=[];
  const dictionary = createQuickDictionaryService(async () => ({ experiment:'実験', signal:'信号' }));
  const service = { lookup:(text:string)=>{lookups.push(text);return dictionary.lookup(text);} };
  let memoMarkdown='',memoItems:string[]=[];
  const memoService={load:async()=>({markdown:memoMarkdown,items:[...memoItems]}),append:async(text:string)=>{memoItems.unshift(text);memoMarkdown=`- ${text}\n${memoMarkdown}`;return {markdown:memoMarkdown,items:[...memoItems]};}};
  const draw = () => createElement(modules.RightSidebar, { ref:controller, open, service, memoService, onOpenChange:(value:boolean) => { open=value; }, onExplicitOpenChange:(value:boolean) => { open=value;savedOpen=value; }, onMiniMapHost:(value:HTMLDivElement|null) => { host=value; } });
  await render(draw()); assert.ok(host); assert.ok(container.textContent!.includes('Quick辞書'));
  const input = container.querySelector('[aria-label="クイックツール入力"]') as HTMLInputElement;
  const selectedText=dom.window.document.createElement('p');selectedText.textContent='selection must not enter Quick tools';dom.window.document.body.append(selectedText);
  const selection=dom.window.getSelection()!,range=dom.window.document.createRange();range.selectNodeContents(selectedText);selection.removeAllRanges();selection.addRange(range);
  dom.window.document.dispatchEvent(new dom.window.Event('selectionchange'));await act(async()=>{await new Promise(done=>setTimeout(done,0));});
  assert.equal(input.value,'');
  const enter = async (value:string) => act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new dom.window.Event('input', { bubbles:true })); input.dispatchEvent(new dom.window.Event('change', { bubbles:true })); });
  await enter('Experiment'); await click('検索'); assert.match(container.textContent!, /experiment.*実験/s);assert.deepEqual(lookups,['Experiment']);
  await click('Quickメモ'); await enter('手動1件目'); await click('追加'); await enter('手動2件目'); await click('追加'); assert.deepEqual(Array.from(container.querySelectorAll('.quick-memo-body li')).map(item=>item.textContent),['手動2件目','手動1件目']);assert.equal(memoMarkdown,'- 手動2件目\n- 手動1件目\n');
  await click('›'); await render(draw()); assert.equal(open, false); assert.ok(container.querySelector('.right-sidebar-content')?.hasAttribute('hidden'));
  await click('‹'); await render(draw()); assert.equal(container.querySelectorAll('.quick-memo-body li').length, 2);
  await click('›'); await render(draw()); assert.equal(savedOpen,false);
  await act(async()=>{controller.current!.openDictionary('Signal');await new Promise(done=>setTimeout(done,20));});await render(draw());
  assert.equal(open,true);assert.equal(savedOpen,false);assert.equal(container.querySelector('[role=tab][aria-selected=true]')?.textContent,'Quick辞書');assert.match(container.textContent!,/signal.*信号/s);assert.deepEqual(lookups,['Experiment','Signal']);
  await act(async()=>{await assert.rejects(controller.current!.openDictionary('two words'),/英単語を1語選択してください/);await new Promise(done=>setTimeout(done,20));});await render(draw());
  assert.equal((container.querySelector('[aria-label="クイックツール入力"]') as HTMLInputElement).value,'two words');assert.match(container.textContent!,/英単語を1語選択してください/);
  await act(async()=>{await assert.rejects(controller.current!.openDictionary('日本語'),/英単語を1語選択してください/);await new Promise(done=>setTimeout(done,20));});await render(draw());
  assert.equal(open,true);assert.equal(container.querySelector('[role=tab][aria-selected=true]')?.textContent,'Quick辞書');assert.match(container.textContent!,/英単語を1語選択してください/);
  await act(async()=>{await controller.current!.addMemo('Signalから追加');await new Promise(done=>setTimeout(done,20));});await render(draw());
  assert.equal(open,true);assert.equal(savedOpen,false);assert.equal(container.querySelector('[role=tab][aria-selected=true]')?.textContent,'Quickメモ');assert.deepEqual(Array.from(container.querySelectorAll('.quick-memo-body li')).map(item=>item.textContent),['Signalから追加','手動2件目','手動1件目']);assert.equal(memoMarkdown,'- Signalから追加\n- 手動2件目\n- 手動1件目\n');
}));

test('Settings shell provides sections, developer visibility toggles, model host and Escape close', async () => fixture(async ({ container, document, render, click, modules, dom }) => {
  let section = 'general', closed = false, developer = { markerManagement:false, runDetails:false, storageTools:false }, modelHost:HTMLDivElement|null=null;
  let systemPrompt:{enabled:boolean;preset:'off'|'concise'|'thinking_support'|'non_accommodating'|'custom';text:string}={enabled:false,preset:'off',text:''}, userProfile:{enabled:boolean;preset:'off'|'beginner'|'practical'|'expert'|'custom';text:string}={enabled:false,preset:'off',text:''};
  const draw = () => createElement(modules.SettingsShell, { open:!closed, section, developer, systemPrompt, onSystemPrompt:(value:typeof systemPrompt)=>{systemPrompt=value;}, userProfile, onUserProfile:(value:typeof userProfile)=>{userProfile=value;}, onClose:() => { closed=true; }, onSection:(value:string) => { section=value; }, onDeveloper:(value:typeof developer) => { developer=value; }, onModelHost:(value:HTMLDivElement|null) => { modelHost=value; } });
  await render(draw()); await click('モデル'); await render(draw()); assert.ok(modelHost); assert.equal(section, 'model');
  await click('System Prompt'); await render(draw()); assert.equal(section,'system-prompt');assert.match(container.textContent!,/Experimental/);
  const promptText=container.querySelector<HTMLTextAreaElement>('[aria-label="モデル用System Prompt"]')!;
  const systemSection=container.querySelector('[aria-label="System Profile設定"]')!;
  let promptRadios=systemSection.querySelectorAll<HTMLInputElement>('input[name="system-profile-preset"]');
  assert.equal(promptRadios.length,5);assert.equal(promptRadios[0].checked,true);assert.equal(promptText.disabled,true);assert.doesNotMatch(systemSection.textContent!,/標準/);
  assert.match(systemSection.textContent!,/OFF/);assert.match(systemSection.textContent!,/簡潔/);assert.match(systemSection.textContent!,/思考支援/);assert.match(systemSection.textContent!,/非迎合/);assert.match(systemSection.textContent!,/カスタム/);
  await act(async()=>{promptRadios[1].click();await new Promise(done=>setTimeout(done,20));});
  assert.equal(promptText.value,SYSTEM_PROFILE_PRESETS.concise.text);assert.equal(promptText.disabled,false);assert.deepEqual(systemPrompt,{enabled:false,preset:'off',text:''});
  await click('System Profileを適用');await render(draw());assert.deepEqual(systemPrompt,{enabled:true,preset:'concise',text:SYSTEM_PROFILE_PRESETS.concise.text});assert.match(container.textContent!,/System Profileを生成設定へ適用しました/);
  promptRadios=systemSection.querySelectorAll<HTMLInputElement>('input[name="system-profile-preset"]');
  await act(async()=>{promptRadios[0].click();await new Promise(done=>setTimeout(done,20));});assert.equal(promptText.value,'');assert.deepEqual(systemPrompt,{enabled:true,preset:'concise',text:SYSTEM_PROFILE_PRESETS.concise.text});
  await click('System Profileを適用');await render(draw());assert.deepEqual(systemPrompt,{enabled:false,preset:'off',text:''});
  promptRadios=systemSection.querySelectorAll<HTMLInputElement>('input[name="system-profile-preset"]');
  await act(async()=>{promptRadios[2].click();await new Promise(done=>setTimeout(done,20));});assert.equal(promptText.value,SYSTEM_PROFILE_PRESETS.thinking_support.text);
  await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value')!.set!.call(promptText,'SYSTEM-TEST');promptText.dispatchEvent(new dom.window.Event('input',{bubbles:true}));promptText.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await new Promise(done=>setTimeout(done,20));});
  promptRadios=systemSection.querySelectorAll<HTMLInputElement>('input[name="system-profile-preset"]');assert.equal(promptRadios[4].checked,true);assert.deepEqual(systemPrompt,{enabled:false,preset:'off',text:''});
  await click('System Profileを適用');await render(draw());assert.deepEqual(systemPrompt,{enabled:true,preset:'custom',text:'SYSTEM-TEST'});
  promptRadios=systemSection.querySelectorAll<HTMLInputElement>('input[name="system-profile-preset"]');
  await act(async()=>{promptRadios[3].click();await new Promise(done=>setTimeout(done,20));});assert.equal(promptText.value,SYSTEM_PROFILE_PRESETS.non_accommodating.text);
  await act(async()=>{promptRadios[4].click();await new Promise(done=>setTimeout(done,20));});assert.equal(promptText.value,SYSTEM_PROFILE_PRESETS.non_accommodating.text);
  const profileText=container.querySelector<HTMLTextAreaElement>('[aria-label="ユーザープロフィール"]')!;
  let profileRadios=container.querySelectorAll<HTMLInputElement>('input[name="user-profile-preset"]');
  assert.equal(profileRadios.length,5);assert.equal(profileRadios[0].checked,true);assert.equal(profileText.disabled,true);assert.deepEqual(userProfile,{enabled:false,preset:'off',text:''});
  await act(async()=>{profileRadios[4].click();await new Promise(done=>setTimeout(done,20));});assert.equal(profileText.value,'');assert.equal(profileText.disabled,false);
  profileRadios=container.querySelectorAll<HTMLInputElement>('input[name="user-profile-preset"]');
  await act(async()=>{profileRadios[1].click();await new Promise(done=>setTimeout(done,20));});
  assert.equal(profileText.value,USER_PROFILE_PRESETS.beginner.text);assert.equal(profileText.disabled,false);assert.deepEqual(userProfile,{enabled:false,preset:'off',text:''});
  profileRadios=container.querySelectorAll<HTMLInputElement>('input[name="user-profile-preset"]');
  await act(async()=>{profileRadios[2].click();await new Promise(done=>setTimeout(done,20));});assert.equal(profileText.value,USER_PROFILE_PRESETS.practical.text);
  profileRadios=container.querySelectorAll<HTMLInputElement>('input[name="user-profile-preset"]');
  await act(async()=>{profileRadios[3].click();await new Promise(done=>setTimeout(done,20));});assert.equal(profileText.value,USER_PROFILE_PRESETS.expert.text);
  profileRadios=container.querySelectorAll<HTMLInputElement>('input[name="user-profile-preset"]');
  await act(async()=>{profileRadios[2].click();await new Promise(done=>setTimeout(done,20));});
  await click('User Profileを適用');await render(draw());assert.deepEqual(userProfile,{enabled:true,preset:'practical',text:USER_PROFILE_PRESETS.practical.text});assert.deepEqual(systemPrompt,{enabled:true,preset:'custom',text:'SYSTEM-TEST'});
  await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value')!.set!.call(profileText,'Pythonは初心者です');profileText.dispatchEvent(new dom.window.Event('input',{bubbles:true}));profileText.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await new Promise(done=>setTimeout(done,20));});
  profileRadios=container.querySelectorAll<HTMLInputElement>('input[name="user-profile-preset"]');assert.equal(profileRadios[4].checked,true);assert.equal(userProfile.preset,'practical');
  await click('User Profileを適用');await render(draw());assert.deepEqual(userProfile,{enabled:true,preset:'custom',text:'Pythonは初心者です'});assert.match(container.textContent!,/User Profileを生成設定へ適用しました/);
  profileRadios=container.querySelectorAll<HTMLInputElement>('input[name="user-profile-preset"]');await act(async()=>{profileRadios[0].click();await new Promise(done=>setTimeout(done,20));});assert.equal(userProfile.preset,'custom');
  await click('User Profileを適用');await render(draw());assert.deepEqual(userProfile,{enabled:false,preset:'off',text:''});
  await click('Developer / Experimental'); await render(draw());
  const checks = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]'); assert.equal(checks.length, 3);
  await act(async () => { checks[0].click(); await new Promise(done => setTimeout(done, 20)); }); await render(draw()); assert.equal(developer.markerManagement, true);
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key:'Escape', bubbles:true })); await act(async () => { await new Promise(done => setTimeout(done, 20)); }); await render(draw());
  assert.equal(closed, true); assert.equal(container.querySelector('[role=dialog]'), null);
}));

test('Settings shell defaults to safe send keys and switches session state to Enter-send mode', async () => fixture(async ({ container, render, modules }) => {
  let mode = 'safe';
  const draw = () => createElement(modules.SettingsShell, { open:true, section:'ui', developer:{ markerManagement:false, runDetails:false, storageTools:false }, sendKeyMode:mode, onSendKeyMode:(value:string) => { mode=value; }, onClose:()=>{}, onSection:()=>{}, onDeveloper:()=>{}, onModelHost:()=>{} });
  await render(draw());
  assert.match(container.textContent!, /送信キー/);
  const radios=container.querySelectorAll<HTMLInputElement>('input[name="send-key-mode"]');
  assert.equal(radios.length,2);assert.equal(radios[0].checked,true);assert.equal(radios[1].checked,false);
  await act(async()=>{radios[1].click();await new Promise(done=>setTimeout(done,20));});await render(draw());
  assert.equal(mode,'enter');
  const updated=container.querySelectorAll<HTMLInputElement>('input[name="send-key-mode"]');assert.equal(updated[0].checked,false);assert.equal(updated[1].checked,true);
  assert.match(container.textContent!,/次回起動時に復元/);
}));

test('embedded miniMAP keeps detail and overview modes with Marker and current-position UI', async () => fixture(async ({ container, render, click, modules }) => {
  const root = document.createElement('div'); root.innerHTML = '<article data-turn="t1"><mark data-highlight="h1">x</mark></article><article data-turn="t2">y</article>'; document.body.append(root);
  Object.defineProperty(root, 'getBoundingClientRect', { value:() => ({ top:0, bottom:600, height:600, left:0, right:500, width:500, x:0, y:0, toJSON(){} }) });
  root.querySelectorAll('*').forEach((element, index) => Object.defineProperty(element, 'getBoundingClientRect', { value:() => ({ top:index*100, bottom:index*100+40, height:40, left:0, right:100, width:100, x:0, y:index*100, toJSON(){} }) }));
  const turns = [{ turn_id:'t1', conversation_id:'c', sequence_no:0, role:'assistant', content:'x', status:'completed', created_at:'x', finalized_at:'x' }, { turn_id:'t2', conversation_id:'c', sequence_no:1, role:'user', content:'y', status:'completed', created_at:'x', finalized_at:'x' }] as Turn[];
  const highlights = [{ highlight_id:'h1', turn_id:'t1', start_offset:0, end_offset:1, source_text:'x', target_text:'x', color:'red', note:'', status:'resolved', reason:null, created_at:'x', updated_at:'x' }] as Highlight[];
  await render(createElement(modules.MiniMap, { embedded:true, root:{ current:root }, turns, highlights, onJump:()=>{} }));
  assert.equal(container.querySelectorAll('.minimap-detail-row').length, 2); assert.equal(container.querySelectorAll('.minimap-detail-dot').length, 1);
  await click('全体'); assert.ok(container.querySelector('.minimap-rail')); assert.ok(container.querySelector('[aria-label="current Turn"]'));
  await click('詳細'); assert.equal(container.querySelectorAll('.minimap-detail-row').length, 2);
  root.remove();
}));

test('production UI source keeps Laboratory out of runtime dependencies and defaults developer UI off', async () => {
  const source = await readFile('src/client/main.tsx', 'utf8');
  assert.doesNotMatch(source, /src\/laboratory|\.\.\/laboratory|from ['"].*laboratory/);
  assert.match(source, /markerManagement: false, runDetails: false, storageTools: false/);
  assert.match(source, /<RightSidebar/); assert.match(source, /<SettingsShell/);
});

test('production Quick dictionary validates one ASCII word and lazy-loads once', async () => {
  let loads = 0;
  const service = createQuickDictionaryService(async () => { loads += 1; return { experiment:'実験' }; });
  assert.equal((await service.lookup('日本語')).status, 'invalid'); assert.equal((await service.lookup('two words')).status, 'invalid'); assert.equal(loads, 0);
  assert.deepEqual(await service.lookup(' Experiment '), { word:'experiment', meaning:'実験', source:'EJDict-hand', status:'found' });
  assert.equal((await service.lookup('missing')).status, 'not-found'); assert.equal(loads, 1);
});
