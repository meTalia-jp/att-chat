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

test('same-chat Keep確認は標準Contextを初期選択し、Preview後だけ明示送信できる',async()=>{
  const cache=resolve('.cache');await mkdir(cache,{recursive:true});const outDir=await mkdtemp(join(cache,'keep-context-ui-'));
  const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost/'}),keys=['window','document','Node','NodeFilter','Range','HTMLElement','ResizeObserver','requestAnimationFrame','cancelAnimationFrame','IS_REACT_ACT_ENVIRONMENT','fetch'] as const;
  const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));let root:ReturnType<typeof CreateRoot>|undefined;
  try{
    await build({configFile:false,logLevel:'silent',build:{ssr:true,outDir,rollupOptions:{input:resolve('src/client/Chat.tsx'),output:{entryFileNames:'app.mjs'}}}});
    for(const key of ['window','document','Node','NodeFilter','Range','HTMLElement'] as const)Object.defineProperty(globalThis,key,{configurable:true,value:key==='window'?dom.window:dom.window[key]});
    Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:(fn:FrameRequestCallback)=>setTimeout(()=>fn(0),0),cancelAnimationFrame:(id:number)=>clearTimeout(id)});
    dom.window.HTMLElement.prototype.scrollIntoView=function(){};
    const {createRoot}=await import('react-dom/client'),{Chat}=await import(pathToFileURL(join(outDir,'app.mjs')).href);
    const detail:ConversationDetail={conversation:{conversation_id:'c',title:'fixture',created_at:'x',updated_at:'x'},turns:[],runs:[]};
    const keep:any={keep_id:'k',highlight_id:'h',question_draft:'なぜですか？',memo:'',status:'pending',created_at:'x',updated_at:'x',asked_at:null};
    const requests:Array<{path:string;body:any}>=[];
    globalThis.fetch=(async(input,init)=>{
      const path=String(input),body=init?.body?JSON.parse(String(init.body)):undefined;requests.push({path,body});
      if(path==='/api/models')return Response.json({models:['fake']});
      if(path.endsWith('/highlights'))return Response.json([{highlight_id:'h',turn_id:'t',start_offset:0,end_offset:2,source_text:'引用',target_text:'引用',color:'blue',note:'',created_at:'x',updated_at:'x',status:'resolved',reason:null}]);
      if(path.endsWith('/context-preview'))return Response.json({source_conversation_id:'c',source_turn_id:'t',source_turn_number:8,source_highlight_id:'h',marker_target_text:'引用',context_level:body.context_level,previous_turn_limit:3,included_turn_ids:['a','t'],included_turns:[{turn_id:'a',turn_number:7,role:'user'},{turn_id:'t',turn_number:8,role:'assistant'}],first_user_message:'## 参考文脈\nfixture',context_strategy:'turn_based_keep_context',strategy_version:'1'});
      throw new Error('Unexpected API '+path);
    }) as typeof fetch;
    const container=dom.window.document.getElementById('app')!;root=createRoot(container);
    await act(async()=>{root!.render(createElement(Chat,{detail,normalLayout:true,question:keep,onCloseQuestion:()=>{},onBusy:()=>{},refresh:async()=>{}}));for(let attempt=0;attempt<20;attempt+=1){await new Promise(resolve=>setTimeout(resolve,10));if(container.querySelector('option[value="fake"]'))break}});
    const radios=Array.from(container.querySelectorAll<HTMLInputElement>('input[type=radio]'));assert.equal(radios.length,3);assert.equal(radios[1].checked,true);
    const buttons=()=>Array.from(container.querySelectorAll('button'));
    const button=(name:string)=>{const found=buttons().find(item=>item.textContent===name);assert.ok(found,name);return found};
    const select=container.querySelector<HTMLSelectElement>('[aria-label="モデル"]')!;await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value')!.set!.call(select,'fake');select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,40))});
    assert.equal(button('送信').disabled,true);
    await act(async()=>{button('Preview').click();await new Promise(resolve=>setTimeout(resolve,100))});
    const call=requests.find(request=>request.path.endsWith('/context-preview'));assert.deepEqual(call?.body,{user_question:'なぜですか？',context_level:'standard'});
    assert.match(container.querySelector('[aria-label="Keep Context Preview"]')!.textContent!,/T7, T8/);assert.equal(button('送信').disabled,false);
  }finally{
    if(root)await act(async()=>root!.unmount());for(const[key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key)}
    dom.window.close();assert.ok(outDir.startsWith(cache));await rm(outDir,{recursive:true,force:true});
  }
});

test('accepted送信だけPreviewを消しvalidation失敗とPreview-onlyでは保持する',async()=>{
  const cache=resolve('.cache');await mkdir(cache,{recursive:true});const outDir=await mkdtemp(join(cache,'preview-clear-ui-'));
  const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost/'}),keys=['window','document','Node','NodeFilter','Range','HTMLElement','ResizeObserver','requestAnimationFrame','cancelAnimationFrame','IS_REACT_ACT_ENVIRONMENT','fetch'] as const;
  const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));let root:ReturnType<typeof CreateRoot>|undefined;
  try{
    await build({configFile:false,logLevel:'silent',build:{ssr:true,outDir,rollupOptions:{input:resolve('src/client/Chat.tsx'),output:{entryFileNames:'app.mjs'}}}});
    for(const key of ['window','document','Node','NodeFilter','Range','HTMLElement'] as const)Object.defineProperty(globalThis,key,{configurable:true,value:key==='window'?dom.window:dom.window[key]});
    Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:(fn:FrameRequestCallback)=>setTimeout(()=>fn(0),0),cancelAnimationFrame:(id:number)=>clearTimeout(id)});
    dom.window.HTMLElement.prototype.scrollIntoView=function(){};
    const {createRoot}=await import('react-dom/client'),{Chat}=await import(pathToFileURL(join(outDir,'app.mjs')).href);
    const detail:ConversationDetail={conversation:{conversation_id:'c',title:'fixture',created_at:'x',updated_at:'x'},turns:[],runs:[]};
    const keep:any={keep_id:'k',highlight_id:'h',question_draft:'なぜですか？',memo:'',status:'pending',created_at:'x',updated_at:'x',asked_at:null};
    const requests:Array<{path:string;body:any}>=[],refreshIds:string[]=[];let rejectSend=true,closeCount=0,runNo=0;
    globalThis.fetch=(async(input,init)=>{
      const path=String(input),body=init?.body?JSON.parse(String(init.body)):undefined;requests.push({path,body});
      if(path==='/api/models')return Response.json({models:['fake']});
      if(path.endsWith('/highlights'))return Response.json([{highlight_id:'h',turn_id:'t',start_offset:0,end_offset:5,source_text:'干渉**は',target_text:'干渉は',color:'yellow',note:'',created_at:'x',updated_at:'x',status:'resolved',reason:null}]);
      if(path.endsWith('/context-preview'))return Response.json({source_conversation_id:'c',source_turn_id:'t',source_turn_number:8,source_highlight_id:'h',marker_target_text:'干渉は',context_level:body.context_level,previous_turn_limit:3,included_turn_ids:['a','t'],included_turns:[{turn_id:'a',turn_number:7,role:'user'},{turn_id:'t',turn_number:8,role:'assistant'}],first_user_message:'## 質問対象\n\n干渉は',context_strategy:'turn_based_keep_context',strategy_version:'1'});
      if(path.endsWith('/handoff-preview'))return Response.json({source_conversation_id:'c',source_turn_id:'t',source_turn_number:8,source_highlight_id:'h',marker_source_text:'干渉**は',marker_target_text:'干渉は',handoff_level:body.handoff_level,previous_turn_limit:3,included_turn_ids:['a','t'],included_turns:[{turn_id:'a',turn_number:7,role:'user'},{turn_id:'t',turn_number:8,role:'assistant'}],first_user_message:'## 質問対象\n\n干渉**は',display_first_user_message:'## 質問対象\n\n干渉は'});
      if(path.endsWith('/ask')||path.endsWith('/handoff-new')){
        if(rejectSend)return Response.json({error:{message:'validation failed'}},{status:400});
        const conversationId=path.endsWith('/handoff-new')?'new-c':'c',run={run_id:`r${++runNo}`,conversation_id:conversationId,outcome:'preparing'};
        return new Response(`${JSON.stringify({type:'prepared',run})}\n${JSON.stringify({type:'running'})}\n${JSON.stringify({type:'terminal',outcome:'succeeded'})}\n`,{status:201,headers:{'Content-Type':'application/x-ndjson'}});
      }
      throw new Error('Unexpected API '+path);
    }) as typeof fetch;
    const container=dom.window.document.getElementById('app')!;root=createRoot(container);
    const render=(question:any)=>root!.render(createElement(Chat,{detail,normalLayout:true,question,onCloseQuestion:()=>{closeCount+=1},onBusy:()=>{},refresh:async(id?:string)=>{refreshIds.push(id??'c')}}));
    const settle=async(fn:()=>void,delay=60)=>{await act(async()=>{fn();await new Promise(resolve=>setTimeout(resolve,delay))})};
    const button=(name:string)=>{const found=Array.from(container.querySelectorAll('button')).find(item=>item.textContent===name);assert.ok(found,name);return found};
    await settle(()=>render(keep));
    const select=container.querySelector<HTMLSelectElement>('[aria-label="モデル"]')!;await settle(()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value')!.set!.call(select,'fake');select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});

    await settle(()=>button('Preview').click());
    assert.ok(container.querySelector('[aria-label="Keep Context Preview"]'));assert.equal(requests.filter(item=>item.path.endsWith('/ask')).length,0);
    await settle(()=>button('送信').click());
    assert.ok(container.querySelector('[aria-label="Keep Context Preview"]'),'validation failureではsame-chat Previewを保持する');
    rejectSend=false;await settle(()=>button('送信').click());
    assert.equal(container.querySelector('[aria-label="Keep Context Preview"]'),null,'prepared後はsame-chat Previewを消す');assert(closeCount>0);

    const handoffKeep={...keep,newConversation:true};await settle(()=>render(handoffKeep));
    await settle(()=>button('Preview').click());
    const handoffPreview=container.querySelector('[aria-label="New Chat Handoff Preview"]')!;
    assert.match(handoffPreview.textContent!,/干渉は/);assert(!handoffPreview.textContent!.includes('干渉**は'));assert.equal(requests.filter(item=>item.path.endsWith('/handoff-new')).length,0);
    rejectSend=true;await settle(()=>button('新規チャットとして送信').click());
    assert.ok(container.querySelector('[aria-label="New Chat Handoff Preview"]'),'validation failureではHandoff Previewを保持する');
    rejectSend=false;await settle(()=>button('新規チャットとして送信').click(),100);
    assert.equal(container.querySelector('[aria-label="New Chat Handoff Preview"]'),null,'prepared後はHandoff Previewを消す');assert(refreshIds.includes('new-c'));
  }finally{
    if(root)await act(async()=>root!.unmount());for(const[key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key)}
    dom.window.close();assert.ok(outDir.startsWith(cache));await rm(outDir,{recursive:true,force:true});
  }
});
