import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { JSDOM } from 'jsdom';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';

test('Production Marker Quick Action exposes direct memo/dictionary actions and preserves positioning and close rules', async () => {
  const cache=resolve('.cache');await mkdir(cache,{recursive:true});const out=await mkdtemp(join(cache,'marker-quick-production-'));
  const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost/'});
  const keys=['window','document','Node','HTMLElement','IS_REACT_ACT_ENVIRONMENT'] as const;
  const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  let root:ReturnType<typeof createRoot>|undefined;
  try{
    await build({configFile:false,logLevel:'silent',build:{ssr:true,outDir:out,rollupOptions:{input:{bar:resolve('src/client/MarkerQuickActionBar.tsx'),position:resolve('src/client/marker-quick-action.ts')},output:{entryFileNames:'[name].mjs'}}}});
    for(const key of ['window','document','Node','HTMLElement'] as const)Object.defineProperty(globalThis,key,{configurable:true,value:key==='window'?dom.window:dom.window[key]});
    Object.defineProperty(dom.window,'innerWidth',{configurable:true,value:320});Object.defineProperty(dom.window,'innerHeight',{configurable:true,value:200});Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
    const {MarkerQuickActionBar}=await import(pathToFileURL(join(out,'bar.mjs')).href) as typeof import('../src/client/MarkerQuickActionBar.tsx');
    const position=await import(pathToFileURL(join(out,'position.mjs')).href) as typeof import('../src/client/marker-quick-action.ts');
    Object.defineProperty(dom.window.Range.prototype,'getClientRects',{configurable:true,value:function(this:Range){const x=100+this.startOffset*10;return [{left:x,right:x,top:this.startOffset>5?60:30,bottom:this.startOffset>5?80:50,width:0,height:20}];}});
    Object.defineProperty(dom.window.Range.prototype,'getBoundingClientRect',{configurable:true,value:function(this:Range){const x=100+this.startOffset*10;return {left:x,right:x,top:30,bottom:50,width:0,height:20};}});
    const selectionHost=dom.window.document.createElement('p'),selectionText=dom.window.document.createTextNode('0123456789');selectionHost.append(selectionText);dom.window.document.body.append(selectionHost);const selection=dom.window.getSelection()!;
    selection.setBaseAndExtent(selectionText,1,selectionText,8);const shortStart=position.selectionFocusInteractionAnchor(selection,dom.window.document);selection.setBaseAndExtent(selectionText,4,selectionText,8);const longStart=position.selectionFocusInteractionAnchor(selection,dom.window.document);
    assert.deepEqual(shortStart,longStart);assert.equal(shortStart?.x,180);assert.equal(shortStart?.lineTop,60);selection.setBaseAndExtent(selectionText,8,selectionText,1);const backward=position.selectionFocusInteractionAnchor(selection,dom.window.document);assert.equal(backward?.x,110);assert.equal(backward?.lineTop,30);
    assert.deepEqual(position.pointerInteractionAnchor([{left:20,right:80,top:10,bottom:30},{left:20,right:60,top:40,bottom:60}],52,48),{x:52,y:48,lineTop:40,lineBottom:60});
    assert.deepEqual(position.markerQuickActionPosition(position.markerInteractionAnchor({left:300,right:319,top:170,bottom:195} as DOMRect),320,200),{left:36,top:116});
    assert.deepEqual(position.markerQuickActionPosition({x:120,y:60,lineTop:40,lineBottom:60},640,480),{left:120,top:70});assert.deepEqual(position.markerDetailPosition({x:120,y:60,lineTop:40,lineBottom:60},640,480,320,240),{left:120,top:70});assert.deepEqual(position.markerDetailPosition({x:600,y:460,lineTop:440,lineBottom:460},640,480,320,240),{left:312,top:190});assert.deepEqual(position.markerQuickActionPosition({x:120,y:-4,lineTop:-25,lineBottom:-4},640,480),{left:120,top:8});assert.deepEqual(position.markerDetailPosition({x:120,y:-4,lineTop:-25,lineBottom:-4},640,480,320,240),{left:120,top:8});
    const container=dom.window.document.getElementById('app')!;root=createRoot(container);let closed=0,repositioned=0,detail=0,feedback='';const memos:string[]=[],dictionaries:string[]=[];
    const props={position:{left:36,top:118},markerReady:false,selectedColor:undefined,busy:false,targetText:'quantum',onColor:()=>{},onOpenDetail:()=>{detail+=1;},onMemo:async(text:string)=>{memos.push(text);},onDictionary:async(text:string)=>{dictionaries.push(text);},onClose:()=>{closed+=1;},onReposition:()=>{repositioned+=1;},onFeedback:(text:string)=>{feedback=text;}};
    await act(async()=>{root!.render(createElement(MarkerQuickActionBar,props));});assert.equal((container.querySelector('[aria-label="Marker詳細"]') as HTMLButtonElement).disabled,true);assert.deepEqual(Array.from(container.querySelectorAll('button')).map(button=>button.textContent),['▽','','','','','メモ','辞書']);assert.equal(container.querySelector('[aria-label="Quick Action"]'),null);assert.equal(container.querySelector('[role="menu"]'),null);assert.equal(container.textContent?.includes('コピー'),false);
    await act(async()=>{(Array.from(container.querySelectorAll('button')).find(button=>button.textContent==='メモ') as HTMLButtonElement).click();await Promise.resolve();});assert.deepEqual(memos,['quantum']);assert.equal(feedback,'Quickメモへ追加しました');assert.equal(closed,1);
    closed=0;feedback='';await act(async()=>{root!.render(createElement(MarkerQuickActionBar,{...props,key:'memo-failure',markerReady:true,onMemo:async()=>{throw new Error('メモ保存に失敗しました');}}));});await act(async()=>{(Array.from(container.querySelectorAll('button')).find(button=>button.textContent==='メモ') as HTMLButtonElement).click();await Promise.resolve();});assert.equal(container.querySelector('[role="alert"]')?.textContent,'メモ保存に失敗しました');assert.equal(closed,0);assert.ok(container.querySelector('[aria-label="Marker Quick Action"]'));
    Object.defineProperty(dom.window,'innerWidth',{configurable:true,value:640});await act(async()=>{root!.render(createElement(MarkerQuickActionBar,{...props,key:'dictionary',markerReady:true,position:{left:8,top:20}}));});await act(async()=>{(container.querySelector('[aria-label="Marker詳細"]') as HTMLButtonElement).click();});assert.equal(detail,1);await act(async()=>{(Array.from(container.querySelectorAll('button')).find(button=>button.textContent==='辞書') as HTMLButtonElement).click();await Promise.resolve();});assert.deepEqual(dictionaries,['quantum']);assert.equal(closed,1);
    closed=0;await act(async()=>{root!.render(createElement(MarkerQuickActionBar,{...props,key:'close-rules',markerReady:true}));});dom.window.dispatchEvent(new dom.window.Event('scroll'));dom.window.dispatchEvent(new dom.window.Event('resize'));assert.equal(repositioned,2);assert.ok(container.querySelector('[aria-label="Marker Quick Action"]'));dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(closed,1);closed=0;dom.window.document.body.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true}));assert.equal(closed,1);
  }finally{if(root)await act(async()=>root!.unmount());for(const[key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}dom.window.close();await rm(out,{recursive:true,force:true});}
});
