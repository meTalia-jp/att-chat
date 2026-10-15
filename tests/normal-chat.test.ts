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

test('Normal Chat composer reuses send/cancel, preserves partial turn and removes duplicate stream after refresh', async () => {
  const cache=resolve('.cache');await mkdir(cache,{recursive:true});
  const outDir=await mkdtemp(join(cache,'normal-chat-test-'));
  const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost/'});
  const keys=['window','document','Node','NodeFilter','Range','HTMLElement','ResizeObserver','requestAnimationFrame','cancelAnimationFrame','IS_REACT_ACT_ENVIRONMENT','fetch'] as const;
  const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  let root:ReturnType<typeof CreateRoot>|undefined;
  try {
    await build({configFile:false,logLevel:'silent',build:{ssr:true,outDir,rollupOptions:{input:resolve('src/client/Chat.tsx'),output:{entryFileNames:'app.mjs'}}}});
    for(const key of ['window','document','Node','NodeFilter','Range','HTMLElement'] as const)Object.defineProperty(globalThis,key,{configurable:true,value:key==='window'?dom.window:dom.window[key]});
    Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:(fn:FrameRequestCallback)=>setTimeout(()=>fn(0),0),cancelAnimationFrame:(id:number)=>clearTimeout(id)});
    dom.window.matchMedia=(()=>({matches:false,addEventListener(){},removeEventListener(){}})) as unknown as typeof window.matchMedia;
    dom.window.HTMLElement.prototype.scrollIntoView=function(){};
    // Import after installing DOM so React input events use the DOM implementation.
    const {createRoot}=await import('react-dom/client');
    const {Chat,shouldSendComposerKey}=await import(pathToFileURL(join(outDir,'app.mjs')).href);
    const key=(value:Partial<KeyboardEvent>)=>({key:'Enter',ctrlKey:false,metaKey:false,shiftKey:false,isComposing:false,...value});
    assert.equal(shouldSendComposerKey(key({}),'safe'),false);
    assert.equal(shouldSendComposerKey(key({shiftKey:true}),'safe'),false);
    assert.equal(shouldSendComposerKey(key({ctrlKey:true}),'safe'),true);
    assert.equal(shouldSendComposerKey(key({metaKey:true}),'safe'),true);
    assert.equal(shouldSendComposerKey(key({}),'enter'),true);
    assert.equal(shouldSendComposerKey(key({ctrlKey:true}),'enter'),true);
    assert.equal(shouldSendComposerKey(key({shiftKey:true}),'enter'),false);
    assert.equal(shouldSendComposerKey(key({ctrlKey:true,isComposing:true}),'safe'),false);
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
        const body=JSON.parse(String(init!.body));assert.equal(body.model,'fake');assert.equal(body.content,'hello');assert.equal(body.system_prompt,'SYSTEM-TEST');assert.equal(body.user_profile,'Pythonは初心者です');assert.ok(body.request_id);
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
    let immediate:any[]=[{highlightId:'h',turnId:'t',turnNumber:4,quote:'参照するMarker',prefix:'質問',question:'なぜですか？'}];
    const render=()=>root!.render(createElement(Chat,{detail,normalLayout:true,question:null,onCloseQuestion:()=>{},onBusy:()=>{},refresh:async()=>{render();},systemPrompt:{enabled:true,preset:'custom',text:'SYSTEM-TEST'},userProfile:{enabled:true,preset:'custom',text:'Pythonは初心者です'},immediateDrafts:immediate,onChangeImmediateDraft:(highlightId:string,question:string)=>{immediate=immediate.map(item=>item.highlightId===highlightId?{...item,question}:item);render();},onClearImmediateDraft:(highlightId:string)=>{immediate=immediate.filter(item=>item.highlightId!==highlightId);render();}}));
    await settle(render);
    await settle(()=>{});
    assert.match(container.querySelector('[aria-label="参照中"]')!.textContent!,/1\/5件/);
    assert.match(container.querySelector('[aria-label="参照中"]')!.textContent!,/T4/);
    const immediateInput=container.querySelector('[aria-label="Immediate Ask質問 T4"]') as HTMLInputElement;
    await settle(()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(immediateInput,'編集した質問');immediateInput.dispatchEvent(new dom.window.Event('input',{bubbles:true}));immediateInput.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
    assert.equal(immediate[0].question,'編集した質問');
    const preservedDraft=container.querySelector('textarea') as HTMLTextAreaElement;
    await settle(()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value')!.set!.call(preservedDraft,'通常draftを保持');preservedDraft.dispatchEvent(new dom.window.Event('input',{bubbles:true}));preservedDraft.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
    await settle(()=>button('×').click());assert.equal(immediate.length,0);assert.equal((container.querySelector('textarea') as HTMLTextAreaElement).value,'通常draftを保持');
    const select=container.querySelector<HTMLSelectElement>('[aria-label="モデル"]')!;
    await settle(()=>{select.value='fake';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
    const input=container.querySelector('textarea')!;
    const setComposer=async(value:string)=>settle(()=>{
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value')!.set!.call(input,value);
      input.focus(); input.dispatchEvent(new dom.window.Event('input',{bubbles:true})); input.dispatchEvent(new dom.window.Event('change',{bubbles:true})); input.dispatchEvent(new dom.window.KeyboardEvent('keyup',{bubbles:true,key:'o'}));
    });
    await setComposer('1行目\n2行目');
    await settle(()=>input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Enter'})));
    await settle(()=>input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Enter',shiftKey:true})));
    const composing=new dom.window.KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Enter',ctrlKey:true});Object.defineProperty(composing,'isComposing',{value:true});
    await settle(()=>input.dispatchEvent(composing));
    assert.equal(calls.filter(path=>path.endsWith('/chat')).length,0);
    assert.equal(input.value,'1行目\n2行目');
    await setComposer('hello');
    assert.equal(button('送信').disabled,false,container.innerHTML);
    await settle(()=>input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Enter',ctrlKey:true})));
    assert.equal(container.querySelector('[aria-label="streaming本文"]')?.textContent,'partial');
    assert.ok(container.querySelector('.normal-chat-input .chat-controls'));
    assert.equal(button('設定（準備中）').disabled,true);
    assert.equal(button('送信').disabled,true);
    await settle(()=>button('停止').click());
    assert.ok(container.textContent!.includes('キャンセルしました'));
    assert.equal(button('停止').disabled,true);
    assert.equal(container.querySelector('[aria-label="streaming本文"]'),null);
    assert.equal(detail.turns[0].content,'partial');
    assert.equal(container.querySelector('article small'),null);
    await settle(render);
    assert.equal(detail.runs[0].outcome,'cancelled');
    const chatCalls=calls.filter(path=>path.endsWith('/chat')).length;
    await settle(()=>input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Enter',ctrlKey:true})));
    assert.equal(calls.filter(path=>path.endsWith('/chat')).length,chatCalls);
    for(const forbidden of ['Question Keep','Context Compare','Related Turns','GenerationRun（保存確認）','Phase 1A'])assert.ok(!container.textContent!.includes(forbidden));
    assert.ok(calls.every(path=>! /question-keeps|question-runs|related-turns|context-preview|retrieval/.test(path)));
  }finally{
    if(root)await act(async()=>root!.unmount());
    for(const[key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
    dom.window.close();assert.ok(outDir.startsWith(cache));await rm(outDir,{recursive:true,force:true});
  }
});
