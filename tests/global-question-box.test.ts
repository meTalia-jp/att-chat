import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { JSDOM } from 'jsdom';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import type { GlobalQuestionKeep } from '../src/shared/question-keep.ts';

function item(id:string,conversationId:string,title:string,turn:number,created:string,status:'resolved'|'unresolved'='resolved'):GlobalQuestionKeep {
  return {
    conversation:{conversation_id:conversationId,title},
    keep:{keep_id:id,highlight_id:`h-${id}`,question_draft:`質問 ${id}`,memo:id==='k2'?'':'メモ',status:'pending',created_at:created,updated_at:created,asked_at:null},
    highlight:{highlight_id:`h-${id}`,status,reason:status==='unresolved'?'source_text不一致':null,source_text:`source ${id}`,target_text:`表示引用 ${id}`},
    source_turn:{turn_id:`t-${id}`,sequence_no:turn-1},
  };
}

test('Global Question BoxはKeepのあるConversationだけを新着group表示し既存actionへ委譲する',async()=>{
  const cache=resolve('.cache');await mkdir(cache,{recursive:true});
  const outDir=await mkdtemp(join(cache,'global-question-box-test-'));
  const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost/'});
  const globals=['window','document','Node','HTMLElement','IS_REACT_ACT_ENVIRONMENT','fetch'] as const;
  const saved=new Map(globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  let root:ReturnType<typeof createRoot>|undefined;
  try{
    await build({configFile:false,logLevel:'silent',build:{ssr:true,outDir,rollupOptions:{input:resolve('src/client/GlobalQuestionBox.tsx'),output:{entryFileNames:'app.mjs'}}}});
    for(const key of ['window','document','Node','HTMLElement'] as const)Object.defineProperty(globalThis,key,{configurable:true,value:key==='window'?dom.window:dom.window[key]});
    Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
    const rows=[
      item('k1','c-new','新しい会話',12,'2026-10-02T02:00:00.000Z'),
      item('k2','c-new','新しい会話',8,'2026-10-02T01:00:00.000Z'),
      item('k3','c-old','古い会話',3,'2026-10-01T01:00:00.000Z','unresolved'),
    ];
    globalThis.fetch=(async input=>{assert.equal(String(input),'/api/question-box');return Response.json(rows)}) as typeof fetch;
    const {GlobalQuestionBox}=await import(pathToFileURL(join(outDir,'app.mjs')).href) as typeof import('../src/client/GlobalQuestionBox.tsx');
    const returned:string[]=[],asked:Array<[string,boolean]>=[];
    const container=dom.window.document.getElementById('app')!;root=createRoot(container);
    const settle=async(fn:()=>void)=>{await act(async()=>{fn();await new Promise(resolve=>setTimeout(resolve,20))})};
    const click=async(element:Element|null)=>{assert.ok(element);await settle(()=>element.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})))};
    const buttons=(text:string)=>Array.from(container.querySelectorAll('button')).filter(button=>button.textContent===text);
    await settle(()=>root!.render(createElement(GlobalQuestionBox,{reloadToken:0,disabled:false,onReturn:(value:GlobalQuestionKeep)=>{returned.push(value.keep.keep_id)},onAsk:(value:GlobalQuestionKeep,newConversation:boolean)=>{asked.push([value.keep.keep_id,newConversation])}})));

    assert.equal(container.querySelectorAll('.global-question-group').length,2);
    assert.equal(container.querySelectorAll('.global-question-group')[0].querySelector('.global-question-group-toggle')?.textContent,'▼ 新しい会話2件');
    assert.equal(container.querySelectorAll('.global-question-group')[1].querySelector('.global-question-group-toggle')?.textContent,'▶ 古い会話1件');
    assert.deepEqual(Array.from(container.querySelectorAll('.global-question-group:first-of-type li strong')).map(node=>node.textContent),['T12','T8']);
    assert.ok(container.textContent!.includes('表示引用 k1'));
    assert.ok(!container.textContent!.includes('source k1'));
    assert.equal(container.textContent!.includes('Keepなし'),false);

    await click(buttons('元へ戻る')[0]);assert.deepEqual(returned,['k1']);
    await click(container.querySelector('[aria-label="T12のその他の操作"]'));
    await click(buttons('質問する')[0]);assert.deepEqual(asked,[['k1',false]]);
    await click(container.querySelector('[aria-label="T12のその他の操作"]'));
    await click(buttons('新規チャット')[0]);assert.deepEqual(asked,[['k1',false],['k1',true]]);

    await click(container.querySelectorAll('.global-question-group-toggle')[1]);
    assert.ok(container.textContent!.includes('Marker位置未解決'));
    await click(buttons('すべて閉じる')[0]);
    assert.equal(container.querySelectorAll('.global-question-group li').length,0);
  }finally{
    if(root)await act(async()=>root!.unmount());
    for(const[key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key)}
    dom.window.close();await rm(outDir,{recursive:true,force:true});
  }
});
