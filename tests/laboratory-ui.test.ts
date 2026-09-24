import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { JSDOM } from 'jsdom';
import { createElement, act } from 'react';
import type { createRoot as CreateRoot } from 'react-dom/client';
import { experiments } from '../src/laboratory/catalog.ts';
import { derivedExperiment } from './fixtures/derived-experiment.ts';

test('Catalog / Workspace reuse experiments and gate session / generation switching',async()=>{
  const cache=resolve('.cache');await mkdir(cache,{recursive:true});
  const outDir=await mkdtemp(join(cache,'lab-ui-test-'));
  const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost/'});
  const keys=['window','document','HTMLElement','Node','NodeFilter','Range','ResizeObserver','requestAnimationFrame','cancelAnimationFrame','IS_REACT_ACT_ENVIRONMENT','fetch'] as const;
  const saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  let root:ReturnType<typeof CreateRoot>|undefined;
  try{
    await build({configFile:false,logLevel:'silent',build:{ssr:true,outDir,rollupOptions:{input:resolve('src/laboratory/Laboratory.tsx'),output:{entryFileNames:'app.mjs'}}}});
    for(const key of ['window','document','Node','NodeFilter','Range','HTMLElement'] as const)Object.defineProperty(globalThis,key,{configurable:true,value:key==='window'?dom.window:dom.window[key]});
    Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:(fn:FrameRequestCallback)=>setTimeout(()=>fn(0),0),cancelAnimationFrame:(id:number)=>clearTimeout(id)});
    dom.window.matchMedia=(()=>({matches:false,addEventListener(){},removeEventListener(){}})) as unknown as typeof window.matchMedia;
    const {createRoot}=await import('react-dom/client'),{Laboratory}=await import(pathToFileURL(join(outDir,'app.mjs')).href);
    let run:any=null,controller:ReadableStreamDefaultController<Uint8Array>|undefined;
    const calls:string[]=[];
    const emit=(event:unknown)=>controller!.enqueue(new TextEncoder().encode(JSON.stringify(event)+'\n'));
    const conversation={conversation_id:'c',title:'fixture',created_at:'now',updated_at:'now'};
    let session:any=null;
    let requestedExperiment:string|undefined;
    globalThis.fetch=(async(path,init)=>{
      calls.push(String(path));
      if(path==='/api/laboratory/sessions/current')return Response.json(session);
      if(path==='/api/laboratory/sessions'){requestedExperiment=JSON.parse(String(init?.body)).experiment_id;session={run_id:'session',experiment_id:requestedExperiment,conversation_id:'c',status:'running'};return Response.json(session);}
      if(path==='/api/laboratory/sessions/session/finish'){session=null;return Response.json({status:'completed'});}
      if(path==='/api/laboratory/runs/simple')return Response.json([{run_id:'session',status:'completed',validation_status:'not_run',started_at:'start',finished_at:'end',conversation_id:'c',generation_run_ids:['g'],models:['fake']}]);
      if(path==='/api/laboratory/runs/single')return Response.json(run?[run]:[]);
      if(path==='/api/conversations')return Response.json([conversation]);
      if(path==='/api/conversations/c')return Response.json({conversation,turns:[],runs:[]});
      if(path==='/api/conversations/c/highlights')return Response.json([]);
      if(path==='/api/models')return Response.json({models:['fake']});
      if(path==='/api/single/models')return Response.json({models:['fake']});
      if(path==='/api/single/latest')return Response.json(run);
      if(path==='/api/single/runs'){
        run={run_id:'r',status:'running',validation_status:'not_run',output_snapshot:null,partial_output:'part',error:null};
        return new Response(new ReadableStream({start(c){controller=c;emit({type:'started',run_id:'r'});emit({type:'delta',text:'part'});}}));
      }
      if(path==='/api/single/runs/r/stop'){run={...run,status:'cancelled'};emit({type:'terminal',run});controller!.close();return Response.json(run);}
      throw new Error('Unexpected '+path);
    }) as typeof fetch;
    const container=dom.window.document.getElementById('app')!;
    root=createRoot(container);
    const settle=async(fn:()=>void)=>{await act(async()=>{fn();await new Promise(r=>setTimeout(r,15));});};
    const button=(name:string)=>{const b=Array.from(container.querySelectorAll('button')).find(b=>b.textContent===name);assert.ok(b,name);return b;};
    await settle(()=>root!.render(createElement(Laboratory)));
    assert.equal(container.querySelectorAll('[aria-label="Experiment Catalog"] li').length,5);
    assert.deepEqual(calls,['/api/laboratory/sessions/current','/api/conversations']);
    await settle(()=>button('Run').click());
    await settle(()=>button('セッションを開始').click());
    assert.ok(container.querySelector('[aria-label="Conversation一覧"]'));
    assert.equal(button('Single Text Generation').disabled,true);
    await settle(()=>button('セッションを終了').click());
    assert.match(container.querySelector('[aria-label="Results"]')!.textContent!,/Generation count: 1/);
    await settle(()=>button('対応する会話を見る').click());
    assert.ok(container.querySelector('[aria-label="Conversation一覧"]'));
    assert.equal(container.querySelector('textarea'),null);
    assert.equal(button('Single Text Generation').disabled,false);
    await settle(()=>button('Single Text Generation').click());
    assert.ok(container.querySelector('[aria-label="Overview"]')!.textContent!.includes('Conversationなし'));
    await settle(()=>button('Results').click());
    await settle(()=>button('保存Runを確認').click());await settle(()=>{});
    assert.ok(container.querySelector('.single-text-generation'));
    const select=container.querySelector<HTMLSelectElement>('.single-text-generation select')!,input=container.querySelector<HTMLTextAreaElement>('.single-text-generation textarea')!;
    await settle(()=>{select.value='fake';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
    await settle(()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value')!.set!.call(input,'input');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
    await settle(()=>button('Generate').click());
    assert.equal(button('Study P0').disabled,true);
    assert.equal(button('Overview').disabled,true);
    assert.equal(container.querySelector('[aria-label="Output"]')!.textContent,'part');
    await settle(()=>button('Stop').click());
    assert.equal(button('Study P0').disabled,false);
    await settle(()=>button('Results').click());
    assert.ok(container.querySelector('.single-text-generation')); // stays mounted while idle tabs change
    assert.match(container.querySelector('[aria-label="Results"]')!.textContent!,/cancelled/);
    await settle(()=>button('出力を確認').click());
    assert.match(container.querySelector('[aria-label="Results"]')!.textContent!,/part/);
    await settle(()=>button('Study P0').click());
    assert.ok(container.querySelector('[aria-label="Overview"]')!.textContent!.includes('existing-experiment'));
    await settle(()=>button('Run').click());
    assert.ok(container.querySelector('[aria-label="Run"]')!.textContent!.includes('Record only'));
    assert.equal(container.querySelector('.single-text-generation'),null);
    assert.ok(calls.every(path=>!path.includes('study')&&!path.includes('question-')));
    await settle(()=>button('Marker Color Sample').click());
    assert.match(container.querySelector('[aria-label="Overview"]')!.textContent!,/marker-color-sample/);
    await settle(()=>button('Run').click());
    assert.equal(container.querySelectorAll('[data-palette]').length,5);
    assert.deepEqual(Array.from(container.querySelectorAll('[data-palette]')).map(item=>item.getAttribute('data-palette')),
      ['current','vivid-a','vivid-b','pastel','high-contrast']);
    assert.equal(container.querySelectorAll('[aria-label$="miniMAP相当の小さい色点"]').length,5);
    await settle(()=>button('Results').click());
    assert.match(container.querySelector('[aria-label="Results"]')!.textContent!,/自動スコアとRun JSONは作成しません/);
    await settle(()=>button('Marker Quick Action Prototype').click());
    assert.match(container.querySelector('[aria-label="Overview"]')!.textContent!,/marker-quick-action-prototype/);
    await settle(()=>button('Run').click());
    assert.ok(container.querySelector('[aria-label="Marker Quick Action Prototype"]'));
    assert.equal(container.querySelectorAll('[data-quick-paragraph]').length,6);
    assert.equal(container.querySelectorAll('input[name="quick-ui-variant"]').length,2);
    await settle(()=>button('Results').click());
    assert.match(container.querySelector('[aria-label="Results"]')!.textContent!,/メモリ内だけに保持/);
    await settle(()=>root!.render(createElement(Laboratory,{key:'derived',definitions:[...experiments,derivedExperiment]})));
    await settle(()=>button(derivedExperiment.title).click());
    assert.match(container.querySelector('[aria-label="Overview"]')!.textContent!,/fixture-marker-review/);
    assert.match(container.querySelector('[aria-label="Overview"]')!.textContent!,/simple-marker-chat \/ 0.1/);
    await settle(()=>button('Run').click());
    assert.ok(button('セッションを開始')); // same registered Simple entry, no copied Component
    await settle(()=>button('セッションを開始').click());
    assert.equal(requestedExperiment,derivedExperiment.id);
    assert.ok(container.querySelector('[aria-label="Conversation一覧"]'));
  }finally{
    if(root)await act(async()=>root!.unmount());
    for(const[k,d]of saved){if(d)Object.defineProperty(globalThis,k,d);else Reflect.deleteProperty(globalThis,k);}
    dom.window.close();assert.ok(outDir.startsWith(cache));await rm(outDir,{recursive:true,force:true});
  }
});
