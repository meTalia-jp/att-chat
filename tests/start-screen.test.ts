import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import type { createRoot as CreateRoot } from 'react-dom/client';
import type { Conversation } from '../src/shared/contracts.ts';
import type { CollectionResult } from '../src/shared/collections.ts';

async function fixture(work: (value: {
  container: HTMLElement;
  dom: JSDOM;
  modules: Record<string, any>;
  render: (node: React.ReactNode) => Promise<void>;
  click: (text: string) => Promise<void>;
}) => Promise<void>) {
  const cache = resolve('.cache'); await mkdir(cache, { recursive:true });
  const out = await mkdtemp(join(cache, 'start-screen-test-'));
  const dom = new JSDOM('<div id="app"></div>', { url:'http://localhost/' });
  const keys = ['window','document','Node','HTMLElement','IS_REACT_ACT_ENVIRONMENT'] as const;
  const saved = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let root: ReturnType<typeof CreateRoot> | undefined;
  try {
    await build({ configFile:false, logLevel:'silent', build:{ ssr:true, outDir:out, rollupOptions:{ input:{ StartScreen:resolve('src/client/StartScreen.tsx'), SettingsShell:resolve('src/client/SettingsShell.tsx'), ModelSettingsControls:resolve('src/client/ModelSettingsControls.tsx'), ConversationTitle:resolve('src/client/ConversationTitle.tsx'), CollectionSidebar:resolve('src/client/CollectionSidebar.tsx') }, output:{ entryFileNames:'[name].mjs' } } } });
    for (const key of ['window','document','Node','HTMLElement'] as const) Object.defineProperty(globalThis, key, { configurable:true, value:key === 'window' ? dom.window : dom.window[key] });
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT:true });
    const { createRoot } = await import('react-dom/client');
    const modules = {
      ...(await import(pathToFileURL(join(out, 'StartScreen.mjs')).href)),
      ...(await import(pathToFileURL(join(out, 'SettingsShell.mjs')).href)),
      ...(await import(pathToFileURL(join(out, 'ModelSettingsControls.mjs')).href)),
      ...(await import(pathToFileURL(join(out, 'ConversationTitle.mjs')).href)),
      ...(await import(pathToFileURL(join(out, 'CollectionSidebar.mjs')).href)),
    };
    const container = dom.window.document.getElementById('app')!; root = createRoot(container);
    const render = async (node:React.ReactNode) => { await act(async () => { root!.render(node); await new Promise(done => setTimeout(done, 10)); }); };
    const click = async (text:string) => {
      const button = Array.from(container.querySelectorAll('button')).find(item => item.textContent?.trim() === text);
      assert.ok(button, `button ${text}`); await act(async () => { button.click(); await new Promise(done => setTimeout(done, 10)); });
    };
    await work({ container, dom, modules, render, click });
  } finally {
    if (root) await act(async () => root!.unmount());
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    dom.window.close(); await rm(out, { recursive:true, force:true });
  }
}

const conversations: Conversation[] = [
  { conversation_id:'old', title:'古い会話', created_at:'2026-01-01T00:00:00Z', updated_at:'2026-01-02T00:00:00Z' },
  { conversation_id:'latest', title:'最後の会話', created_at:'2026-01-02T00:00:00Z', updated_at:'2026-01-04T00:00:00Z' },
  { conversation_id:'middle', title:'途中の会話', created_at:'2026-01-03T00:00:00Z', updated_at:'2026-01-03T00:00:00Z' },
];

test('Start Screen exposes applied profiles and existing Conversation routes without the retired Basic Prompt UI', async () => fixture(async ({ container, render, click, modules }) => {
  let opened = '', modelSettings = 0, settings = 0, newChats = 0;
  const draw = () => createElement(modules.StartScreen, {
    conversations, model:'google/gemma-4-12b-qat', connection:'available', systemProfile:'thinking_support', userProfile:'practical',
    onNewChat:() => { newChats += 1; },
    onOpenConversation:(id:string) => { opened=id; }, onOpenModelSettings:() => { modelSettings += 1; }, onOpenSettings:() => { settings += 1; },
  });
  await render(draw());
  assert.match(container.textContent!, /google\/gemma-4-12b-qat/); assert.match(container.textContent!, /● 利用可能/);
  assert.match(container.textContent!, /System Profile思考支援/); assert.match(container.textContent!, /User Profile実務/);
  assert.doesNotMatch(container.textContent!, /ユーザー基本プロンプト/); assert.equal(container.querySelector('.start-prompt'), null);
  assert.equal(container.querySelectorAll('select').length, 0); assert.equal(container.querySelectorAll('textarea').length, 0);
  assert.deepEqual(Array.from(container.querySelectorAll('.start-recents li span')).map(item => item.textContent), ['最後の会話','途中の会話','古い会話']);
  await click('最後の会話を開く'); assert.equal(opened, 'latest');
  await act(async () => (Array.from(container.querySelectorAll('.start-recents button')).find(item => item.textContent?.includes('古い会話')) as HTMLButtonElement).click()); assert.equal(opened, 'old');
  await click('新規チャット'); assert.equal(newChats, 1);
  await click('モデル変更'); await click('設定'); assert.equal(modelSettings, 1); assert.equal(settings, 1);
}));

test('Start Screen profile labels reflect applied values including OFF and Custom', async () => fixture(async ({ container, render, modules }) => {
  const draw = (systemProfile:string,userProfile:string) => createElement(modules.StartScreen, { conversations, model:'m', connection:'available', systemProfile, userProfile, onNewChat:()=>{}, onOpenConversation:()=>{}, onOpenModelSettings:()=>{}, onOpenSettings:()=>{} });
  await render(draw('off','off')); assert.match(container.textContent!, /System ProfileOFF/); assert.match(container.textContent!, /User ProfileOFF/);
  await render(draw('custom','custom')); assert.match(container.textContent!, /System Profileカスタム/); assert.match(container.textContent!, /User Profileカスタム/);
  await render(draw('thinking_support','beginner')); assert.match(container.textContent!, /System Profile思考支援/); assert.match(container.textContent!, /User Profile初学者/);
}));

test('Start Screen disables last-conversation route when no Conversation exists', async () => fixture(async ({ container, render, modules }) => {
  await render(createElement(modules.StartScreen, { conversations:[], model:'', connection:'unselected', systemProfile:'off', userProfile:'off', onNewChat:()=>{}, onOpenConversation:()=>{}, onOpenModelSettings:()=>{}, onOpenSettings:()=>{} }));
  assert.equal((Array.from(container.querySelectorAll('button')).find(item => item.textContent === '最後の会話を開く') as HTMLButtonElement).disabled, true);
  assert.match(container.textContent!, /保存済みの会話はありません/);
}));

test('General settings keep startup preferences in caller-owned session state', async () => fixture(async ({ container, render, modules }) => {
  let startup = { screen:'start', reuseModel:true };
  const draw = () => createElement(modules.SettingsShell, { open:true, section:'general', developer:{ markerManagement:false, runDetails:false, storageTools:false }, startup, onStartup:(value:typeof startup) => { startup=value; }, onClose:()=>{}, onSection:()=>{}, onDeveloper:()=>{}, onModelHost:()=>{} });
  await render(draw());
  const inputs = container.querySelectorAll<HTMLInputElement>('.startup-settings input'); assert.equal(inputs.length, 3);
  await act(async () => inputs[1].click()); await render(draw()); assert.equal(startup.screen, 'last');
  await act(async () => inputs[2].click()); await render(draw()); assert.equal(startup.reuseModel, false);
  assert.doesNotMatch(container.textContent!, /ユーザー基本プロンプト|前回設定を引き継ぐ/);
  assert.match(container.textContent!, /次回起動時にも使用/);
}));

test('Conversation title supports save, Escape cancel, and empty-title rejection', async () => fixture(async ({ container, dom, render, click, modules }) => {
  let title='元の会話名',saved='';
  const draw=()=>createElement(modules.ConversationTitle,{title,onSave:async(value:string)=>{saved=value;title=value;return true;}});
  await render(draw());
  const editButton=container.querySelector<HTMLButtonElement>('[aria-label="会話名を編集"]');assert.ok(editButton);assert.equal(editButton.textContent,'✎');
  await act(async()=>editButton.click());
  let input=container.querySelector<HTMLInputElement>('[aria-label="会話名"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(input,'  変更後  ');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await new Promise(done=>setTimeout(done,10));});
  await click('保存'); await render(draw()); assert.equal(saved,'変更後'); assert.match(container.textContent!,/変更後/);
  await click('変更後'); input=container.querySelector<HTMLInputElement>('[aria-label="会話名"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(input,'破棄する名前');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await new Promise(done=>setTimeout(done,10));});
  assert.equal(container.querySelector('[aria-label="会話名"]'),null);assert.match(container.textContent!,/変更後/);
  await click('変更後');input=container.querySelector<HTMLInputElement>('[aria-label="会話名"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(input,'   ');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await new Promise(done=>setTimeout(done,10));});
  assert.equal((Array.from(container.querySelectorAll('button')).find(item=>item.textContent==='保存') as HTMLButtonElement).disabled,true);
}));

test('Model controls reuse caller model-list state and refresh route', async () => fixture(async ({ container, dom, render, modules }) => {
  let selected = 'model-a', refreshes = 0, checks = 0;
  let connectionMode='lm_studio_simple',draftBaseUrl='http://127.0.0.1:1234/v1',appliedBaseUrl='http://127.0.0.1:1234/v1';
  const draw = () => createElement(modules.ModelSettingsControls, { models:['model-a','model-b'], model:selected, busy:false, connectionMode, appliedMode:appliedBaseUrl.includes('Z690')?'lm_studio_advanced':'lm_studio_simple', draftBaseUrl, appliedBaseUrl, connectionStatus:'available', onConnectionModeChange:(value:string)=>{connectionMode=value;}, onDraftBaseUrlChange:(value:string)=>{draftBaseUrl=value;}, onCheckConnection:()=>{checks+=1;appliedBaseUrl=draftBaseUrl;}, onModelChange:(value:string) => { selected=value; }, onRefresh:() => { refreshes += 1; } });
  await render(draw());
  const connectionSelect=container.querySelector<HTMLSelectElement>('[aria-label="接続方式"]')!;
  const modelSelect=container.querySelector<HTMLSelectElement>('[aria-label="モデル"]')!;
  assert.equal(connectionSelect.value,'lm_studio_simple');assert.equal(container.querySelector('[aria-label="LM Studio Base URL"]'),null);
  assert.equal(connectionSelect.querySelector<HTMLOptionElement>('option[value="openai"]')!.disabled,true);assert.equal(container.querySelector('input[type=password]'),null);
  await act(async () => { modelSelect.value='model-b'; modelSelect.dispatchEvent(new dom.window.Event('change', { bubbles:true })); }); await render(draw()); assert.equal(selected, 'model-b');
  await act(async()=>{connectionSelect.value='lm_studio_advanced';connectionSelect.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});await render(draw());
  const baseUrl=container.querySelector<HTMLInputElement>('[aria-label="LM Studio Base URL"]')!;assert.ok(baseUrl);assert.equal(appliedBaseUrl,'http://127.0.0.1:1234/v1');
  await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(baseUrl,'http://Z690:1234/v1');baseUrl.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});await render(draw());
  assert.equal(draftBaseUrl,'http://Z690:1234/v1');assert.equal(appliedBaseUrl,'http://127.0.0.1:1234/v1');
  const check=Array.from(container.querySelectorAll('button')).find(item=>item.textContent==='接続確認')!;await act(async()=>check.click());await render(draw());assert.equal(checks,1);assert.equal(appliedBaseUrl,'http://Z690:1234/v1');
  const refresh=Array.from(container.querySelectorAll('button')).find(item=>item.textContent==='モデル一覧更新')!;await act(async () => refresh.click()); assert.equal(refreshes, 1);
}));

test('Collection Sidebar derives lists, uses current titles, cancels inline edits and blocks corrupt-file edits', async () => fixture(async ({ container, dom, render, click, modules }) => {
  const result: CollectionResult={data:{version:1,collections:[{id:'a',name:'調査'}],membership:{latest:'a'}},writable:true,warnings:[]};
  let opened='';
  const draw=(items=conversations,value=result)=>createElement(modules.CollectionSidebar,{conversations:items,currentId:'latest',result:value,onChange:()=>{},onOpen:(id:string)=>{opened=id;}});
  await render(draw());
  assert.doesNotMatch(container.querySelector('[aria-label="未分類の会話"]')!.textContent!,/最後の会話/);
  assert.match(container.querySelector('[aria-label="調査の会話"]')!.textContent!,/最後の会話/);
  await click('最後の会話');assert.equal(opened,'latest');
  await render(draw(conversations.map(c=>({...c,title:c.conversation_id==='latest'?'変更された会話名':c.title}))));
  assert.match(container.querySelector('[aria-label="調査の会話"]')!.textContent!,/変更された会話名/);
  await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="コレクションを作成"]')!.click());
  assert.equal([...container.querySelectorAll('button')].find(b=>b.textContent==='保存')!.disabled,true);
  const input=container.querySelector<HTMLInputElement>('[aria-label="コレクション名"]')!;
  await act(async()=>input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert.equal(container.querySelector('[aria-label="コレクション名"]'),null);
  await render(draw(conversations,{data:{version:1,collections:[],membership:{}},writable:false,warnings:['元ファイルを保全しています']}));
  assert.equal(container.querySelector<HTMLButtonElement>('[aria-label="コレクションを作成"]')!.disabled,true);
  assert.match(container.querySelector('[aria-label="未分類の会話"]')!.textContent!,/最後の会話/);
  assert.match(container.textContent!,/元ファイルを保全/);
}));
