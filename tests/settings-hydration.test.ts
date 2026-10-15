import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { defaultSettings } from '../src/shared/settings.ts';
import { SYSTEM_PROFILE_PRESETS } from '../src/shared/system-profile-presets.ts';

test('App hydration precedes writes and draft mount; profiles, UI, startup, model checks and reload restore', async () => {
  await mkdir(resolve('.cache'),{recursive:true});const out=await mkdtemp(resolve('.cache/settings-hydration-'));
  await build({configFile:false,logLevel:'silent',build:{ssr:true,outDir:out,rollupOptions:{input:resolve('src/client/main.tsx'),output:{entryFileNames:'app.mjs'}}}});
  const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost/'});
  const names=['window','document','Node','HTMLElement','HTMLTextAreaElement','ResizeObserver','requestAnimationFrame','cancelAnimationFrame','fetch','IS_REACT_ACT_ENVIRONMENT'];
  const descriptors=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const settings=defaultSettings();settings.general.startup_screen='last';settings.model.connection_mode='lm_studio_advanced';settings.model.lm_studio_base_url='http://z690:1234/v1';settings.model.selected_model='qwen';settings.ui.send_key_mode='enter';settings.ui.right_sidebar_open=false;settings.ui.minimap_mode='overview';settings.profiles.system={preset:'thinking_support'};settings.profiles.user={preset:'custom',custom_text:'Hydrated profile'};
  const conversation={conversation_id:'saved',title:'Saved conversation',created_at:'2026-01-01',updated_at:'2026-01-01'};
  let release!:()=>void;let gate=new Promise<void>(done=>{release=done;});let modelRelease!:()=>void;let modelGate=new Promise<void>(done=>{modelRelease=done;});
  let modelIds=['qwen'],offline=false;const calls:Array<{path:string;method:string;body?:any}>=[];
  let root:ReturnType<typeof import('react-dom/client')['createRoot']>|undefined;
  try {
    Object.defineProperty(dom.window,'matchMedia',{value:()=>({matches:true,addEventListener(){},removeEventListener(){}})});
    for(const name of ['window','document','Node','HTMLElement','HTMLTextAreaElement']) Object.defineProperty(globalThis,name,{configurable:true,value:name==='window'?dom.window:(dom.window as any)[name]});
    Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:(callback:()=>void)=>setTimeout(callback,0),cancelAnimationFrame:clearTimeout});
    globalThis.fetch=(async(path:unknown,options?:RequestInit)=>{
      const url=String(path),method=options?.method??'GET',body=options?.body?JSON.parse(String(options.body)):undefined;calls.push({path:url,method,body});
      let value:unknown;
      if(url==='/api/settings'){
        await gate;
        if(method==='PATCH')return new Response(JSON.stringify({error:{message:'disk full'}}),{status:500});
        assert.equal(method,'GET');value={settings,warnings:[]};
      }
      else if(url==='/api/model-connection') value={mode:settings.model.connection_mode,applied_base_url:settings.model.lm_studio_base_url};
      else if(url==='/api/models'){await modelGate;if(offline) return new Response(JSON.stringify({error:{message:'offline'}}),{status:502});value={models:modelIds};}
      else if(url==='/api/conversations') value=[conversation];
      else if(url==='/api/collections') value={data:{version:1,collections:[{id:'collection',name:'Saved collection'}],membership:{saved:'collection'}},writable:true,warnings:[]};
      else if(url==='/api/conversations/saved') value={conversation,turns:[],runs:[]};
      else if(url==='/api/quick-memo')value={markdown:'',items:[]};
      else if(url.endsWith('/highlights'))value=[];
      else throw new Error(`Unexpected request ${url}`);
      return new Response(JSON.stringify(value),{status:200});
    }) as typeof fetch;
    const {App}=await import(pathToFileURL(join(out,'app.mjs')).href),{createRoot}=await import('react-dom/client');
    const container=dom.window.document.getElementById('app')!;
    const settle=async()=>{await act(async()=>{await new Promise(done=>setTimeout(done,30));});};
    const mount=async()=>{root=createRoot(container);await act(async()=>{root!.render(createElement(App));});await settle();};
    const click=async(text:string)=>{const button=[...container.querySelectorAll('button')].find(item=>item.textContent?.trim()===text);assert.ok(button,text);await act(async()=>button.click());await settle();};
    await mount();assert.match(container.textContent!,/設定を読み込んでいます/);assert.equal(container.querySelector('[aria-label="設定"]'),null);assert.deepEqual(calls.map(item=>item.method),['GET']);
    release();await settle();await settle();
    assert.ok(container.querySelector('.normal-chat-conversation'));assert.ok(container.querySelector('.right-sidebar-collapsed'));
    assert.match(container.querySelector('[aria-label="Saved collectionの会話"]')!.textContent!,/Saved conversation/);
    assert.doesNotMatch(container.querySelector('[aria-label="未分類の会話"]')!.textContent!,/Saved conversation/);
    await click('設定');await click('System Prompt');
    assert.equal(container.querySelector<HTMLTextAreaElement>('[aria-label="モデル用System Prompt"]')!.value,SYSTEM_PROFILE_PRESETS.thinking_support.text);
    assert.equal(container.querySelector<HTMLTextAreaElement>('[aria-label="ユーザープロフィール"]')!.value,'Hydrated profile');
    await click('UI');assert.equal(container.querySelectorAll<HTMLInputElement>('[name="send-key-mode"]')[1].checked,true);
    await click('一般');assert.equal(container.querySelectorAll<HTMLInputElement>('[name="startup-screen"]')[1].checked,true);
    await click('モデル');assert.match(container.textContent!,/確認中/);assert.equal(container.querySelector<HTMLSelectElement>('[aria-label="モデル"]')!.value,'');
    modelRelease();await settle();assert.equal(container.querySelector<HTMLSelectElement>('[aria-label="モデル"]')!.value,'qwen');
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="LM Studio Base URL"]')!.value,'http://z690:1234/v1');assert.equal(calls.some(item=>item.method!=='GET'),false);
    for(const scenario of ['missing','no-reuse','offline','simple'] as const){
      await act(async()=>root!.unmount());root=undefined;gate=Promise.resolve();modelGate=Promise.resolve();offline=scenario==='offline';modelIds=scenario==='missing'?['other']:['qwen'];settings.general.reuse_model=scenario!=='no-reuse';
      settings.general.startup_screen='start';if(scenario==='simple'){settings.model.connection_mode='lm_studio_simple';settings.model.lm_studio_base_url='http://127.0.0.1:1234/v1';}
      const before=calls.length;await mount();assert.ok(container.querySelector('.start-screen'));await click('設定');await click('モデル');
      assert.match(container.querySelector('.start-screen')!.textContent!,/Saved conversation/,'Start Screen includes classified conversations');
      assert.equal(container.querySelector<HTMLSelectElement>('[aria-label="モデル"]')!.value,scenario==='simple'?'qwen':'');
      if(scenario==='missing')assert.match(container.textContent!,/保存されたモデル/);if(scenario==='offline')assert.match(container.textContent!,/接続不可/);
      assert.ok(calls.slice(before).some(item=>item.path==='/api/models'));assert.equal(settings.model.selected_model,'qwen');
    }
    assert.equal(calls.some(item=>item.method!=='GET'),false);
    await click('System Prompt');
    await act(async()=>container.querySelector<HTMLInputElement>('input[name="system-profile-preset"][value="concise"]')!.click());
    assert.equal(calls.some(item=>item.method!=='GET'),false, 'draft never saves');
    await click('System Profileを適用');assert.match(container.textContent!,/未保存.*disk full/);
    assert.equal(container.querySelector<HTMLInputElement>('input[name="system-profile-preset"][value="concise"]')!.checked,true,'draft remains after failure');
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="設定を閉じる"]')!.click());await settle();
    assert.match(container.querySelector('.start-profiles')!.textContent!,/思考支援/,'Applied value remains unchanged');
  } finally {
    if(root)await act(async()=>root!.unmount());dom.window.close();
    for(const [name,descriptor]of descriptors){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}
    await rm(out,{recursive:true,force:true});
  }
});
