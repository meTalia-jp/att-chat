import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { JSDOM } from 'jsdom';
import { createElement, act } from 'react';
import type { createRoot as CreateRoot } from 'react-dom/client';
import type { ConversationDetail } from '../src/shared/contracts.ts';

test('Simple Marker Chat composes existing Chat: stream, stop, reload, no extension APIs or debug UI', async () => {
  const cache=resolve('.cache');await mkdir(cache,{recursive:true});
  const outDir=await mkdtemp(join(cache,'simple-marker-test-'));
  const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost/'});
  const keys=['window','document','Node','NodeFilter','Range','HTMLElement','ResizeObserver','requestAnimationFrame','cancelAnimationFrame','IS_REACT_ACT_ENVIRONMENT','fetch'] as const;
  const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  let root:ReturnType<typeof CreateRoot>|undefined;
  try {
    await build({configFile:false,logLevel:'silent',build:{ssr:true,outDir,rollupOptions:{input:resolve('src/client/SimpleMarkerChat.tsx'),output:{entryFileNames:'app.mjs'}}}});
    for(const key of ['window','document','Node','NodeFilter','Range','HTMLElement'] as const)Object.defineProperty(globalThis,key,{configurable:true,value:key==='window'?dom.window:dom.window[key]});
    Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:(fn:FrameRequestCallback)=>setTimeout(()=>fn(0),0),cancelAnimationFrame:(id:number)=>clearTimeout(id)});
    dom.window.matchMedia=(()=>({matches:false,addEventListener(){},removeEventListener(){}})) as unknown as typeof window.matchMedia;
    dom.window.HTMLElement.prototype.scrollIntoView=function(){};
    // Import after installing DOM so React input events use the DOM implementation.
    const {createRoot}=await import('react-dom/client');
    const {SimpleMarkerChat}=await import(pathToFileURL(join(outDir,'app.mjs')).href);
    let detail:ConversationDetail={conversation:{conversation_id:'c',title:'fixture',created_at:'x',updated_at:'x'},turns:[],runs:[]};
    const calls:string[]=[];
    let controller:ReadableStreamDefaultController<Uint8Array>|undefined;
    const emit=(event:unknown)=>controller!.enqueue(new TextEncoder().encode(JSON.stringify(event)+'\n'));
    globalThis.fetch=(async(input,init)=>{
      const path=String(input);calls.push(path);
      if(path==='/api/models')return Response.json({models:['fake']});
      if(path==='/api/conversations')return Response.json([detail.conversation]);
      if(path.endsWith('/highlights'))return Response.json([]);
      if(path.endsWith('/chat')){
        const body=JSON.parse(String(init!.body));assert.equal(body.model,'fake');assert.equal(body.content,'hello');assert.ok(body.request_id);
        const run={run_id:'r',conversation_id:'c',outcome:'running'} as ConversationDetail['runs'][number];
        detail={...detail,runs:[run]};
        return new Response(new ReadableStream<Uint8Array>({start(c){controller=c;emit({type:'prepared',run});emit({type:'running'});emit({type:'delta',text:'partial'});}}));
      }
      if(path.endsWith('/runs/r/cancel')){
        detail={...detail,runs:[{...detail.runs[0],outcome:'cancelled'}],turns:[{turn_id:'a',conversation_id:'c',role:'assistant',sequence_no:1,content:'partial',status:'cancelled',created_at:'x',finalized_at:'x'}]};
        emit({type:'terminal',outcome:'cancelled'});controller!.close();return Response.json(detail.runs[0]);
      }
      if(path==='/api/conversations/c')return Response.json(detail);
      throw new Error('Unexpected API '+path);
    }) as typeof fetch;
    const container=dom.window.document.getElementById('app')!;
    root=createRoot(container);
    const settle=async(fn:()=>void)=>{await act(async()=>{fn();await new Promise(r=>setTimeout(r,20));});};
    const button=(name:string)=>{const result=Array.from(container.querySelectorAll('button')).find(b=>b.textContent===name);assert.ok(result,name);return result;};
    await settle(()=>root!.render(createElement(SimpleMarkerChat)));
    await settle(()=>{});
    const select=container.querySelector('select')!;
    await settle(()=>{select.value='fake';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
    const input=container.querySelector('textarea')!;
    await settle(()=>{
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value')!.set!.call(input,'hello');
      input.focus(); input.dispatchEvent(new dom.window.Event('input',{bubbles:true})); input.dispatchEvent(new dom.window.Event('change',{bubbles:true})); input.dispatchEvent(new dom.window.KeyboardEvent('keyup',{bubbles:true,key:'o'}));
    });
    assert.equal(button('送信').disabled,false,container.innerHTML);
    await settle(()=>button('送信').click());
    assert.equal(container.querySelector('[aria-label="streaming本文"]')?.textContent,'partial');
    assert.equal(button('fixture').disabled,true);
    assert.equal(button('送信').disabled,true);
    await settle(()=>button('停止').click());
    assert.ok(container.textContent!.includes('cancelled'));
    assert.equal(button('fixture').disabled,false);
    assert.equal(container.querySelector('article small'),null);
    await settle(()=>button('再読込').click());
    assert.ok(container.querySelector('article')?.textContent?.includes('partial'));
    for(const forbidden of ['Question Keep','Context Compare','Related Turns','GenerationRun（保存確認）','Phase 1A'])assert.ok(!container.textContent!.includes(forbidden));
    assert.ok(calls.every(path=>! /question-keeps|question-runs|related-turns|context-preview|retrieval/.test(path)));
  }finally{
    if(root)await act(async()=>root!.unmount());
    for(const[key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
    dom.window.close();assert.ok(outDir.startsWith(cache));await rm(outDir,{recursive:true,force:true});
  }
});
