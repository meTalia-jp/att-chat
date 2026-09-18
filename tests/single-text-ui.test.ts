import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { JSDOM } from 'jsdom';
import { createElement, act } from 'react';
import type { createRoot as CreateRoot } from 'react-dom/client';

test('Single Text UI streams, disables duplicate send, stops, restores and displays timeout',async()=>{
  const cache=resolve('.cache');await mkdir(cache,{recursive:true});
  const outDir=await mkdtemp(join(cache,'single-ui-test-'));
  const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost/'});
  const keys=['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT','fetch'] as const;
  const saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  let root:ReturnType<typeof CreateRoot>|undefined;
  try {
    await build({configFile:false,logLevel:'silent',build:{ssr:true,outDir,rollupOptions:{input:resolve('src/laboratory/single-text/SingleTextGeneration.tsx'),output:{entryFileNames:'app.mjs'}}}});
    Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
    const {createRoot}=await import('react-dom/client');
    const {SingleTextGeneration}=await import(pathToFileURL(join(outDir,'app.mjs')).href);
    let run:any=null,controller:ReadableStreamDefaultController<Uint8Array>|undefined,timeout=false;
    const calls:string[]=[];
    const emit=(value:unknown)=>controller!.enqueue(new TextEncoder().encode(JSON.stringify(value)+'\n'));
    globalThis.fetch=(async(path,init)=>{
      calls.push(String(path));
      if(path==='/api/single/models')return Response.json({models:['fake']});
      if(path==='/api/single/latest')return Response.json(run);
      if(path==='/api/single/runs'){
        const body=JSON.parse(String(init!.body));assert.equal(body.text,'input');assert.equal(body.model,'fake');
        run={run_id:'id',status:'running',validation_status:'not_run',partial_output:'partial',output_snapshot:null,error:null};
        return new Response(new ReadableStream({start(c){
          controller=c;emit({type:'started',run_id:'id'});emit({type:'delta',text:'partial'});
          if(timeout){run={...run,status:'failed',error:{code:'TIMEOUT',message:'生成がタイムアウトしました'}};emit({type:'terminal',run});c.close();}
        }}));
      }
      if(path==='/api/single/runs/id/stop'){run={...run,status:'cancelled'};emit({type:'terminal',run});controller!.close();return Response.json(run);}
      throw new Error('Unexpected API '+path);
    }) as typeof fetch;
    const container=dom.window.document.getElementById('app')!;
    root=createRoot(container);
    const settle=async(fn:()=>void)=>{await act(async()=>{fn();await new Promise(r=>setTimeout(r,15));});};
    const button=(name:string)=>{const b=Array.from(container.querySelectorAll('button')).find(b=>b.textContent===name);assert.ok(b);return b;};
    await settle(()=>root!.render(createElement(SingleTextGeneration)));await settle(()=>{});
    const select=container.querySelector('select')!,input=container.querySelector('textarea')!;
    await settle(()=>{select.value='fake';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
    await settle(()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value')!.set!.call(input,'input');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
    assert.equal(button('Generate').disabled,false);
    await settle(()=>button('Generate').click());
    assert.equal(container.querySelector('[aria-label="Output"]')!.textContent,'partial');
    assert.equal(button('Generate').disabled,true);
    await settle(()=>button('Stop').click());
    assert.ok(container.textContent!.includes('cancelled'));
    await settle(()=>button('保存Runを再読込').click());
    assert.equal(container.querySelector('[aria-label="Output"]')!.textContent,'partial');
    timeout=true;await settle(()=>button('Generate').click());
    assert.ok(container.querySelector('[role="alert"]')!.textContent!.includes('タイムアウト'));
    assert.ok(container.textContent!.includes('failed'));
    assert.ok(calls.every(path=>path.startsWith('/api/single/')));
  }finally{
    if(root)await act(async()=>root!.unmount());
    for(const[k,d]of saved){if(d)Object.defineProperty(globalThis,k,d);else Reflect.deleteProperty(globalThis,k);}
    dom.window.close();assert.ok(outDir.startsWith(cache));await rm(outDir,{recursive:true,force:true});
  }
});
