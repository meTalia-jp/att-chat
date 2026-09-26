import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import type { createRoot as CreateRoot } from 'react-dom/client';
import { palettePosition, endSignalPosition, quickMenuPosition, paragraphSlice, overlaps, textareaHeight, type QuickMarker } from '../src/laboratory/marker-quick-action.ts';

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

test('終端Signalは右▷を終端の12px右へ寄せ、端ではclampと上反転する',()=>{
  const p=endSignalPosition({left:100,right:400,top:100,bottom:120},{width:800,height:600});
  assert.equal(p.left+195,412);assert.equal(p.top,128);assert.equal(p.placement,'below');
  assert.deepEqual(endSignalPosition({left:0,right:5,top:580,bottom:600},{width:800,height:600}),{left:8,top:528,placement:'above'});
  assert.equal(endSignalPosition({left:780,right:800,top:100,bottom:120},{width:800,height:600}).left,576);
});

test('Quick Menuは8px右へ開き、右不足なら左へ反転し上下左右をclampする',()=>{
  assert.deepEqual(quickMenuPosition({left:200,right:416,top:120},{width:800,height:600},{width:164,height:138}),{left:424,top:120,side:'right'});
  assert.deepEqual(quickMenuPosition({left:576,right:792,top:550},{width:800,height:600},{width:164,height:138}),{left:404,top:454,side:'left'});
  assert.deepEqual(quickMenuPosition({left:8,right:224,top:-10},{width:240,height:100},{width:164,height:84}),{left:8,top:8,side:'left'});
});

test('複数段落Markerは各段落の範囲だけを描画する', () => {
  const marker:QuickMarker={marker_id:'m',color:'yellow',start:{paragraph:0,offset:3},end:{paragraph:2,offset:4},selected_text:'fixture',memo:'',attention:''};
  assert.deepEqual(paragraphSlice(marker,0,10),{start:3,end:10});
  assert.deepEqual(paragraphSlice(marker,1,12),{start:0,end:12});
  assert.deepEqual(paragraphSlice(marker,2,9),{start:0,end:4});
  assert.equal(paragraphSlice(marker,3,9),null);
});

test('Quick Memoは選択・既設Markerから独立追加し、順序・重複・複数行とMarker編集を保持する', { timeout: 30000 }, async () => {
  const cache=resolve('.cache');await mkdir(cache,{recursive:true});const out=await mkdtemp(join(cache,'quick-action-test-'));
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/'});
  const keys=['window','document','Node','HTMLElement','Range','crypto','fetch','IS_REACT_ACT_ENVIRONMENT'] as const;
  const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));let root:ReturnType<typeof CreateRoot>|undefined;
  try {
    await build({configFile:false,logLevel:'silent',build:{ssr:true,outDir:out,rollupOptions:{input:resolve('src/laboratory/MarkerQuickActionPrototype.tsx'),output:{entryFileNames:'app.mjs'}}}});
    for(const key of ['window','document','Node','HTMLElement','Range','crypto'] as const)Object.defineProperty(globalThis,key,{configurable:true,value:key==='window'?dom.window:dom.window[key]});
    Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
    Object.defineProperty(dom.window.Range.prototype,'getBoundingClientRect',{configurable:true,value:()=>({left:20,right:120,top:90,bottom:110,width:100,height:20,x:20,y:90,toJSON(){}})});
    Object.defineProperty(dom.window.Range.prototype,'getClientRects',{configurable:true,value:()=>[{left:20,right:120,top:90,bottom:110,width:100,height:20}]});
    const {createRoot}=await import('react-dom/client'),{MarkerQuickActionPrototype}=await import(pathToFileURL(join(out,'app.mjs')).href);
    let loads=0;
    Object.defineProperty(globalThis,'fetch',{configurable:true,value:async()=>{loads++;if(loads===1)throw new Error('load failed');return {ok:true,json:async()=>({experiment:'実験、試み'})};}});
    const container=dom.window.document.getElementById('root')!;root=createRoot(container);await act(async()=>root!.render(createElement(MarkerQuickActionPrototype)));
    const memoTexts=()=>Array.from(container.querySelectorAll('[aria-label="Quick Memo項目"] li')).map(e=>e.textContent);
    const addMemo=async(label='Quick Memo')=>{
      const count=memoTexts().length;
      await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Quick Menuを開く"]')!.click());
      assert.equal(memoTexts().length,count);
      const menu=container.querySelector('[aria-label="Quick Menu"]')!;assert.ok(menu);
      assert.deepEqual(Array.from(menu.querySelectorAll('button')).map(e=>e.textContent),['Quick Memo','Dictionary']);
      const button=Array.from(menu.querySelectorAll('button')).find(e=>e.textContent===label)!;
      await act(async()=>{button.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true,cancelable:true}));button.click();});
      assert.equal(container.querySelector('[aria-label="Quick Menu"]'),null);
    };
    assert.ok(container.querySelector('[aria-label="Quick Memo"]'));assert.deepEqual(memoTexts(),[]);
    const lookup=async(text:string)=>{
      await act(async()=>{const p=container.querySelector('[data-quick-paragraph="0"]')!,node=p.firstChild!,range=dom.window.document.createRange();const start=node.textContent!.indexOf(text);assert.ok(start>=0);range.setStart(node,start);range.setEnd(node,start+text.length);const selection=dom.window.getSelection()!;selection.removeAllRanges();selection.addRange(range);p.dispatchEvent(new dom.window.MouseEvent('mouseup',{bubbles:true}));});
      await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Quick Menuを開く"]')!.click());
      await act(async()=>Array.from(container.querySelectorAll<HTMLButtonElement>('[aria-label="Quick Menu"] button')).find(b=>b.textContent==='Dictionary')!.click());
      assert.equal(container.querySelector('[role="toolbar"]'),null);assert.equal(dom.window.getSelection()!.isCollapsed,true);
      assert.equal(container.querySelector('mark'),null);assert.deepEqual(memoTexts(),[]);
      return container.querySelector('[aria-label="Dictionary"]')!.textContent!;
    };
    assert.equal(loads,0);
    assert.match(await lookup('日本語'),/英単語を1語選択してください/);assert.equal(loads,0);
    assert.match(await lookup('experiment'),/辞書データが未配置/);
    assert.match(container.querySelector('[aria-label="Dictionary"]')!.textContent!,/public\/dictionaries\/ejdict-hand\/ejdict.json/);
    for(const text of ['experiment','EXPERIMENT','  experiment  '])assert.match(await lookup(text),/実験、試み/);
    assert.equal(loads,2);
    assert.match(await lookup('qzxqzxunknown'),/見つかりませんでした/);
    for(const text of ['two words','test123','experiment,'])assert.match(await lookup(text),/英単語を1語選択してください/);

    assert.equal(container.querySelectorAll<HTMLInputElement>('input[name="quick-ui-variant"]').length,2);
    assert.equal(container.querySelector<HTMLElement>('[data-ui-variant]')!.dataset.uiVariant,'d2');
    await act(async()=>container.querySelector<HTMLInputElement>('input[value="a"]')!.click());
    assert.equal(container.querySelector<HTMLElement>('[data-ui-variant]')!.dataset.uiVariant,'a');
    await act(async()=>container.querySelector<HTMLInputElement>('input[value="d2"]')!.click());
    const select=(index:number)=>{const p=container.querySelector<HTMLElement>(`[data-quick-paragraph="${index}"]`)!,node=p.firstChild!;const range=dom.window.document.createRange();range.setStart(node,2);range.setEnd(node,10);const selection=dom.window.getSelection()!;selection.removeAllRanges();selection.addRange(range);p.dispatchEvent(new dom.window.MouseEvent('mouseup',{bubbles:true}));};
    await act(async()=>select(0));
    const toolbar=container.querySelector<HTMLElement>('[role="toolbar"]')!;assert.ok(toolbar);assert.ok(toolbar.matches('[data-signal-header]'));assert.equal(dom.window.getSelection()!.isCollapsed,false);
    assert.equal(container.querySelector<HTMLButtonElement>('[aria-label="Marker Detailを開く"]')!.disabled,true);
    const firstText=dom.window.getSelection()!.toString();
    await addMemo();assert.deepEqual(memoTexts(),[firstText]);assert.equal(container.querySelector('mark'),null);
    assert.equal(container.querySelector('[role="toolbar"]'),null);assert.equal(container.querySelector('[role="dialog"]'),null);assert.equal(dom.window.getSelection()!.isCollapsed,true);
    await act(async()=>select(1));const secondText=dom.window.getSelection()!.toString();await addMemo();
    await act(async()=>select(0));await addMemo();assert.deepEqual(memoTexts(),[firstText,secondText,firstText]);
    let multiText='';
    await act(async()=>{const ps=container.querySelectorAll('[data-quick-paragraph]'),range=dom.window.document.createRange();range.setStart(ps[2].firstChild!,3);range.setEnd(ps[3].firstChild!,30);const selection=dom.window.getSelection()!;selection.removeAllRanges();selection.addRange(range);multiText=selection.toString();ps[3].dispatchEvent(new dom.window.MouseEvent('mouseup',{bubbles:true}));});
    await addMemo();assert.equal(memoTexts().length,4);assert.equal(memoTexts()[3],multiText);assert.equal(container.querySelector('mark'),null);
    await act(async()=>select(0));
    const yellow=container.querySelector<HTMLButtonElement>('[aria-label="yellow Markerを作成"]')!;
    await act(async()=>{yellow.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true,cancelable:true}));});assert.equal(dom.window.getSelection()!.isCollapsed,false);
    await act(async()=>yellow.click());assert.ok(container.querySelector('.quick-floating-compact'));assert.equal(container.querySelector('[role="dialog"]'),null);assert.equal(container.querySelectorAll('mark.quick-mark-yellow').length,1);
    assert.equal(memoTexts().length,4);
    assert.equal(container.querySelector<HTMLButtonElement>('[aria-label="Marker Detailを開く"]')!.disabled,false);
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Marker Detailを開く"]')!.click());
    assert.ok(container.querySelector('[role="dialog"]'));assert.ok(container.querySelector('[role="dialog"] [data-signal-header]'));
    await act(async()=>{dom.window.document.body.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true}));});
    assert.equal(container.querySelector('[role="dialog"]'),null);
    const mark=container.querySelector<HTMLElement>('mark')!;
    await act(async()=>mark.click());
    assert.ok(container.querySelector('.quick-floating-compact'));assert.equal(container.querySelector('[role="dialog"]'),null);
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Quick Menuを開く"]')!.click());
    await act(async()=>Array.from(container.querySelectorAll<HTMLButtonElement>('[aria-label="Quick Menu"] button')).find(b=>b.textContent==='Dictionary')!.click());
    assert.equal(memoTexts().length,4);assert.equal(container.querySelectorAll('mark').length,1);
    assert.match(container.querySelector('[aria-label="Dictionary"]')!.textContent!,/見つかりませんでした/);
    await act(async()=>mark.click());
    await addMemo();assert.equal(memoTexts()[4],firstText);assert.equal(container.querySelectorAll('mark.quick-mark-yellow').length,1);assert.equal(container.querySelector('[role="toolbar"]'),null);
    await act(async()=>mark.click());
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
    await addMemo();assert.equal(memoTexts()[5],firstText);assert.ok(container.querySelector('mark.quick-mark-red'));
    await act(async()=>mark.click());await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Marker Detailを開く"]')!.click());
    assert.deepEqual(Array.from(container.querySelectorAll<HTMLTextAreaElement>('[role="dialog"] textarea')).map(e=>e.value),['参考記録','なぜ必要？']);
    await act(async()=>Array.from(container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(e=>e.textContent==='Markerを削除')!.click());
    assert.equal(container.querySelector('mark'),null);assert.equal(container.querySelector('[role="dialog"]'),null);
    assert.equal(memoTexts().length,6);
    await act(async()=>select(0));await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="yellow Markerを作成"]')!.click());
    await act(async()=>{const mark=container.querySelector('mark')!,range=dom.window.document.createRange();range.selectNodeContents(mark);const selection=dom.window.getSelection()!;selection.removeAllRanges();selection.addRange(range);mark.dispatchEvent(new dom.window.MouseEvent('mouseup',{bubbles:true}));});
    assert.equal(container.querySelector<HTMLButtonElement>('[aria-label="yellow Markerを作成"]')!.disabled,true);
    await addMemo();assert.equal(memoTexts()[6],firstText);assert.equal(container.querySelectorAll('mark').length,1);
    await act(async()=>select(1));assert.ok(container.querySelector('[role="toolbar"]'));
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Quick Menuを開く"]')!.click());
    await act(async()=>{dom.window.document.body.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true}));});
    assert.equal(container.querySelector('[role="toolbar"]'),null);
    assert.equal(container.querySelector('[aria-label="Quick Menu"]'),null);
    await act(async()=>select(2));
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Quick Menuを開く"]')!.click());
    await act(async()=>{dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});assert.equal(container.querySelector('[role="toolbar"]'),null);
    assert.equal(container.querySelector('[aria-label="Quick Menu"]'),null);assert.equal(memoTexts().length,7);
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
