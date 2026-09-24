import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import type { createRoot as CreateRoot } from 'react-dom/client';
import { palettePosition, paragraphSlice, overlaps, textareaHeight, type QuickMarker } from '../src/laboratory/marker-quick-action.ts';

test('Signal UIは下を優先し、画面の上下左右へclampする', () => {
  assert.deepEqual(palettePosition({left:100,right:200,top:100,bottom:120},{width:400,height:300},{width:216,height:44},8,true),{left:42,top:128,placement:'below'});
  assert.deepEqual(palettePosition({left:-30,right:10,top:2,bottom:22},{width:240,height:100},{width:216,height:44},8,true),{left:8,top:30,placement:'below'});
  assert.deepEqual(palettePosition({left:210,right:230,top:90,bottom:110},{width:240,height:100},{width:216,height:44},8,true),{left:16,top:38,placement:'above'});
});

test('auto-growは初期高さ・最大高さと内部scrollを制御する', () => {
  assert.deepEqual(textareaHeight(20,72,176),{height:72,overflowY:'hidden'});
  assert.deepEqual(textareaHeight(140,72,176),{height:140,overflowY:'hidden'});
  assert.deepEqual(textareaHeight(240,72,176),{height:176,overflowY:'auto'});
  assert.deepEqual(textareaHeight(40,94,202),{height:94,overflowY:'hidden'});
});

test('複数段落Markerは各段落の範囲だけを描画する', () => {
  const marker:QuickMarker={marker_id:'m',color:'yellow',start:{paragraph:0,offset:3},end:{paragraph:2,offset:4},selected_text:'fixture',memo:'',attention:''};
  assert.deepEqual(paragraphSlice(marker,0,10),{start:3,end:10});
  assert.deepEqual(paragraphSlice(marker,1,12),{start:0,end:12});
  assert.deepEqual(paragraphSlice(marker,2,9),{start:0,end:4});
  assert.equal(paragraphSlice(marker,3,9),null);
});

test('選択後palette、selection保持、1クリックMarker、外側click、Esc', { timeout: 30000 }, async () => {
  const cache=resolve('.cache');await mkdir(cache,{recursive:true});const out=await mkdtemp(join(cache,'quick-action-test-'));
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/'});
  const keys=['window','document','Node','HTMLElement','Range','crypto','IS_REACT_ACT_ENVIRONMENT'] as const;
  const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));let root:ReturnType<typeof CreateRoot>|undefined;
  try {
    await build({configFile:false,logLevel:'silent',build:{ssr:true,outDir:out,rollupOptions:{input:resolve('src/laboratory/MarkerQuickActionPrototype.tsx'),output:{entryFileNames:'app.mjs'}}}});
    for(const key of ['window','document','Node','HTMLElement','Range','crypto'] as const)Object.defineProperty(globalThis,key,{configurable:true,value:key==='window'?dom.window:dom.window[key]});
    Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
    Object.defineProperty(dom.window.Range.prototype,'getBoundingClientRect',{configurable:true,value:()=>({left:20,right:120,top:90,bottom:110,width:100,height:20,x:20,y:90,toJSON(){}})});
    const {createRoot}=await import('react-dom/client'),{MarkerQuickActionPrototype}=await import(pathToFileURL(join(out,'app.mjs')).href);
    const container=dom.window.document.getElementById('root')!;root=createRoot(container);await act(async()=>root!.render(createElement(MarkerQuickActionPrototype)));
    assert.equal(container.querySelectorAll<HTMLInputElement>('input[name="quick-ui-variant"]').length,2);
    assert.equal(container.querySelector<HTMLElement>('[data-ui-variant]')!.dataset.uiVariant,'d2');
    await act(async()=>container.querySelector<HTMLInputElement>('input[value="a"]')!.click());
    assert.equal(container.querySelector<HTMLElement>('[data-ui-variant]')!.dataset.uiVariant,'a');
    await act(async()=>container.querySelector<HTMLInputElement>('input[value="d2"]')!.click());
    const select=(index:number)=>{const p=container.querySelector<HTMLElement>(`[data-quick-paragraph="${index}"]`)!,node=p.firstChild!;const range=dom.window.document.createRange();range.setStart(node,2);range.setEnd(node,10);const selection=dom.window.getSelection()!;selection.removeAllRanges();selection.addRange(range);p.dispatchEvent(new dom.window.MouseEvent('mouseup',{bubbles:true}));};
    await act(async()=>select(0));
    const toolbar=container.querySelector<HTMLElement>('[role="toolbar"]')!;assert.ok(toolbar);assert.ok(toolbar.matches('[data-signal-header]'));assert.equal(dom.window.getSelection()!.isCollapsed,false);
    assert.equal(container.querySelector<HTMLButtonElement>('[aria-label="Marker Detailを開く"]')!.disabled,true);
    const quick=container.querySelector<HTMLButtonElement>('[aria-label="Quick Toolを開く"]')!;assert.equal(quick.disabled,false);
    await act(async()=>quick.click());assert.match(container.querySelector('[role="dialog"]')!.textContent!,/Quick Memo.*Coming next/s);
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Quick Toolを開く"]')!.click());assert.equal(container.querySelector('[role="dialog"]'),null);
    const yellow=container.querySelector<HTMLButtonElement>('[aria-label="yellow Markerを作成"]')!;
    await act(async()=>{yellow.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true,cancelable:true}));});assert.equal(dom.window.getSelection()!.isCollapsed,false);
    await act(async()=>yellow.click());assert.ok(container.querySelector('.quick-floating-compact'));assert.equal(container.querySelector('[role="dialog"]'),null);assert.equal(container.querySelectorAll('mark.quick-mark-yellow').length,1);
    assert.equal(container.querySelector<HTMLButtonElement>('[aria-label="Marker Detailを開く"]')!.disabled,false);
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Marker Detailを開く"]')!.click());
    assert.ok(container.querySelector('[role="dialog"]'));assert.ok(container.querySelector('[role="dialog"] [data-signal-header]'));
    await act(async()=>{dom.window.document.body.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true}));});
    assert.equal(container.querySelector('[role="dialog"]'),null);
    const mark=container.querySelector<HTMLElement>('mark')!;
    await act(async()=>mark.click());
    assert.ok(container.querySelector('.quick-floating-compact'));assert.equal(container.querySelector('[role="dialog"]'),null);
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Quick Toolを開く"]')!.click());assert.ok(container.querySelector('[aria-label="Quick Tool Popup"]'));
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Quick Toolを開く"]')!.click());
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Marker Detailを開く"]')!.click());
    assert.ok(container.querySelector('[role="dialog"]'));assert.equal(container.querySelector('.quick-floating-compact'),null);assert.ok(container.querySelector('[role="dialog"] [data-signal-header]'));
    const inputs=container.querySelectorAll<HTMLTextAreaElement>('[role="dialog"] textarea');
    for(const [index,value] of ['参考記録','なぜ必要？'].entries()){
      await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value')!.set!.call(inputs[index],value);inputs[index].dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
    }
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="redに変更"]')!.click());
    assert.ok(container.querySelector('mark.quick-mark-red'));
    await act(async()=>{dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});
    await act(async()=>mark.click());
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Marker Detailを開く"]')!.click());
    assert.deepEqual(Array.from(container.querySelectorAll<HTMLTextAreaElement>('[role="dialog"] textarea')).map(e=>e.value),['参考記録','なぜ必要？']);
    await act(async()=>Array.from(container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(e=>e.textContent==='Markerを削除')!.click());
    assert.equal(container.querySelector('mark'),null);assert.equal(container.querySelector('[role="dialog"]'),null);
    await act(async()=>select(1));assert.ok(container.querySelector('[role="toolbar"]'));await act(async()=>{dom.window.document.body.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true}));});
    assert.equal(container.querySelector('[role="toolbar"]'),null);
    await act(async()=>select(2));await act(async()=>{dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});assert.equal(container.querySelector('[role="toolbar"]'),null);
  } finally { if(root)await act(async()=>root!.unmount());for(const[key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}dom.window.close();await rm(out,{recursive:true,force:true}); }
});

test('排他: 部分重複・包含・完全一致を拒否し隣接を許可',()=>{
  const span=(start:number,end:number)=>({start:{paragraph:0,offset:start},end:{paragraph:0,offset:end}});
  for(const range of [span(3,8),span(1,3),span(0,8),span(0,5)])assert.equal(overlaps(span(0,5),range),true);
  assert.equal(overlaps(span(0,5),span(5,9)),false);
  assert.equal(overlaps(span(0,5),{start:{paragraph:1,offset:0},end:{paragraph:1,offset:3}}),false);
});
test('Detailは下優先・下端では上へ配置',()=>{
  assert.equal(palettePosition({left:0,right:30,top:100,bottom:120},{width:400,height:600},{width:300,height:280},8,true).top,128);
  const p=palettePosition({left:390,right:400,top:500,bottom:520},{width:400,height:600},{width:300,height:280},8,true);
  assert.deepEqual(p,{left:92,top:212,placement:'above'});
});
