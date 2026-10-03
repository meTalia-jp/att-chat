import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { JSDOM } from 'jsdom';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Highlight, Turn } from '../src/shared/contracts.ts';

test('MarkerCore runtime dependencies exclude Att-Chat extensions and experimental code', () => {
  const seen = new Set<string>();
  function walk(file: string) {
    file = resolve(file); if (seen.has(file)) return; seen.add(file);
    assert.doesNotMatch(file, /QuestionKeeps|RelatedTurns|ContextCompare|study-poc|experiments|RpenProof|server[/\\]/);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:import|export)\s+(?!type\b)[^;\n]*?from\s*['"]([^'"]+)['"]/g)) {
      if (match[1].startsWith('.')) walk(resolve(dirname(file), match[1]));
    }
  }
  walk('src/client/MarkerCore.tsx');
  for (const name of ['MiniMap.tsx','marker.ts','marker-list.ts','TurnMarkdown.tsx']) {
    assert.ok([...seen].some(file => file.endsWith(name)));
  }
});

test('MarkerCore standalone and Att-Chat composition preserve marker and extension interactions', async () => {
  const cache = resolve('.cache'); await mkdir(cache, { recursive: true });
  const outDir = await mkdtemp(join(cache, 'marker-core-test-'));
  const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost/' });
  const globals = ['window','document','Node','NodeFilter','Range','HTMLElement','ResizeObserver','requestAnimationFrame','cancelAnimationFrame','IS_REACT_ACT_ENVIRONMENT','fetch'] as const;
  const saved = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis,key)]));
  let root: ReturnType<typeof createRoot> | undefined;
  try {
    await build({ configFile:false, logLevel:'silent', build:{ ssr:true, outDir,
      rollupOptions:{ input:{ MarkerCore:resolve('src/client/MarkerCore.tsx'),MarkedTurns:resolve('src/client/MarkedTurns.tsx') }, output:{entryFileNames:'[name].mjs'} } } });
    const { MarkerCore } = await import(pathToFileURL(join(outDir,'MarkerCore.mjs')).href) as typeof import('../src/client/MarkerCore.tsx');
    const { MarkedTurns } = await import(pathToFileURL(join(outDir,'MarkedTurns.mjs')).href) as typeof import('../src/client/MarkedTurns.tsx');
    for (const key of ['window','document','Node','NodeFilter','Range','HTMLElement'] as const) Object.defineProperty(globalThis,key,{configurable:true,value:key==='window'?dom.window:dom.window[key]});
    Object.assign(globalThis, {
      IS_REACT_ACT_ENVIRONMENT:true,
      ResizeObserver:class { observe(){} disconnect(){} },
      requestAnimationFrame:(callback:FrameRequestCallback)=>setTimeout(()=>callback(0),0),
      cancelAnimationFrame:(id:number)=>clearTimeout(id),
    });
    dom.window.matchMedia = (()=>({matches:true,addEventListener(){},removeEventListener(){}})) as unknown as typeof window.matchMedia;
    let scrolled:Element|null = null;
    dom.window.HTMLElement.prototype.scrollIntoView = function(){scrolled=this;};
    const content='日本語👩🏽‍💻e\u0301 '.repeat(20).trimEnd();
    const turns = [
      {turn_id:'a',conversation_id:'c',role:'assistant',status:'completed',sequence_no:1,content},
      {turn_id:'b',conversation_id:'c',role:'assistant',status:'completed',sequence_no:2,content},
    ] as Turn[];
    let highlights:Highlight[] = ['yellow','red','green','blue'].map((color,i)=>({
      highlight_id:'h'+i,turn_id:i%2?'b':'a',start_offset:i<2?0:7,end_offset:i<2?content.length:10,
      source_text:i<2?content:content.slice(7,10),target_text:i<2?content:content.slice(7,10),color,
      note:'memo '+i,status:i===3?'unresolved':'resolved',reason:i===3?'source_text不一致':null,created_at:'x',updated_at:'x',
    } as Highlight));
    // Use distinct valid ranges per Turn for drawing.
    highlights[2]={...highlights[2],turn_id:'b',start_offset:0,end_offset:3,source_text:content.slice(0,3),target_text:content.slice(0,3),status:'unresolved',reason:'test'};
    const original=JSON.stringify(highlights);
    const calls:Array<{path:string;method:string;body:any}>=[];
    let keeps:any[]=[];
    globalThis.fetch = (async (input, init) => {
      const path=String(input), method=init?.method??'GET', body=init?.body?JSON.parse(String(init.body)):undefined;
      calls.push({path,method,body});
      if(path.endsWith('/question-runs'))return Response.json([]);
      if(path.includes('/question-keeps')){
        if(method==='POST'){const k={...body,keep_id:keeps.length?`k${keeps.length+1}`:'k',status:'pending',memo:body.memo,question_draft:body.question_draft};keeps.push(k);return Response.json(k);}
        return Response.json(keeps);
      }
      if(path.endsWith('/related-turns'))return Response.json({coverage:{ready:0,total_completed:0,pending:0,failed:0,stale:0,missing:0,input_too_long:0},space_id:'fixture',query_text:'fixture',results:[],timings:{query_embedding_ms:0,vector_load_ms:0,similarity_ms:0,total_ms:0,ready_vector_count:0,invalid_vectors:0}});
      if(path.endsWith('/context-preview'))return Response.json({sections:[],total_utf16:0,content_utf16:0,before_returned:0,after_returned:0,request_preview:'preview fixture response'});
      if(method==='PATCH'){const h=highlights.find(h=>path.endsWith('/'+h.highlight_id))!;Object.assign(h,body);return Response.json(h);}
      if(method==='DELETE'){highlights=highlights.filter(h=>!path.endsWith('/'+h.highlight_id));return new Response(null,{status:204});}
      if(method==='POST'){const h={...body,highlight_id:'new',status:'resolved',reason:null,created_at:'x',updated_at:'x'};highlights.push(h);return Response.json(h);}
      return Response.json(highlights);
    }) as typeof fetch;
    const container=dom.window.document.getElementById('app')!;
    root=createRoot(container);
    const settle=async(fn:()=>void)=>{await act(async()=>{fn();await new Promise(r=>setTimeout(r,20));});};
    const click=async(element:Element|null)=>{assert.ok(element);await settle(()=>element.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));};
    const button=(text:string,within:Element=container)=>Array.from(within.querySelectorAll('button')).find(e=>e.textContent===text)??null;
    const row=(id:string)=>container.querySelector('[data-list-highlight="'+id+'"]')!;
    const props={conversationId:'c',turns,reloadToken:0};
    await settle(()=>root!.render(createElement(MarkerCore,props)));
    assert.ok(container.querySelector('.minimap'));
    assert.equal(container.querySelectorAll('[data-list-highlight]').length,4);
    assert.equal(container.querySelector('[aria-label="Question Keep"]'),null);
    assert.equal(button('Context Compare'),null);
    assert.ok(calls.every(c=>c.path.endsWith('/highlights')));
    assert.ok(row('h0').querySelector('blockquote')!.textContent!.endsWith('…'));
    await click(button('全文表示',row('h0')));
    assert.equal(row('h0').querySelector('blockquote')!.textContent,content);
    await click(button('閉じる',row('h0')));
    assert.equal(JSON.stringify(highlights),original);
    await click(button('このマーカーへジャンプ',row('h1')));
    assert.equal(dom.window.document.activeElement?.closest('[data-turn]')?.getAttribute('data-turn'),'b');
    assert.ok(dom.window.document.activeElement?.classList.contains('marker-jump-active'));
    await click(container.querySelector('.minimap-dot'));
    assert.ok((scrolled as Element | null)?.matches('mark[data-highlight]'));
    assert.ok((button('ジャンプ不可',row('h3')) as HTMLButtonElement).disabled);
    await click(button('すべて非表示'));
    assert.equal(container.querySelectorAll('[data-list-highlight]').length,0);
    await click(button('すべて表示'));
    await click(button('編集',row('h0')));
    const select=container.querySelector('.marker-editor select') as HTMLSelectElement;
    await settle(()=>{select.value='blue';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
    await click(button('更新'));
    assert.equal(highlights[0].color,'blue');
    assert.equal(highlights[0].source_text,content);
    await settle(()=>root!.render(createElement(MarkerCore,{...props,reloadToken:1})));
    assert.equal(row('h0').querySelector('strong')!.textContent,'blue');
    await click(button('削除',row('h0')));
    assert.equal(row('h0'),null);

    // Standalone selection and registration use the same real Markdown/anchor code.
    const text=container.querySelector('article[data-turn="a"] [data-s="0"]')!.firstChild!;
    const range=dom.window.document.createRange();range.setStart(text,0);range.setEnd(text,3);
    const selection=dom.window.getSelection()!;selection.removeAllRanges();selection.addRange(range);
    await settle(()=>text.parentElement!.dispatchEvent(new dom.window.MouseEvent('mouseup',{bubbles:true})));
    await click(button('登録'));
    const registered=highlights.find(h=>h.highlight_id==='new')!;
    assert.equal(registered.source_text,content.slice(0,3));
    assert.equal(registered.start_offset,0);assert.equal(registered.end_offset,3);

    const asked:any[]=[];
    await settle(()=>root!.render(createElement(MarkedTurns,{...props,runs:[],sending:false,onAsk:(...args:any[])=>asked.push(args),onRelatedJump:async()=>{}})));
    assert.ok(container.querySelector('[aria-label="Question Keep"]'));
    await click(button('質問キープ',row('h1')));
    assert.ok(container.querySelector('[aria-label="Question Keep"] form'));
    await click(button('キープ保存'));
    assert.equal(keeps[0].highlight_id,'h1');
    await click(button('このチャットで聞く'));
    assert.equal(asked[0][0].keep_id,'k');
    await click(button('Related Turns',row('h1')));
    assert.ok(container.querySelector('[aria-label="Related Turns"]'));
    await click(button('Search'));
    assert.ok(calls.some(c=>c.path.endsWith('/h1/related-turns')));
    assert.ok(container.textContent!.includes('条件に合う検索結果はありません'));
    await click(button('Context Compare',row('h1')));
    assert.ok(calls.some(c=>c.path.endsWith('/h1/context-preview')));
    assert.ok(container.textContent!.includes('preview fixture response'));
    for(const label of ['質問キープ','Related Turns','Context Compare'])assert.ok((button(label,row('h3')) as HTMLButtonElement).disabled);
    await click(button('このマーカーへジャンプ',row('h1')));
    assert.equal(dom.window.document.activeElement?.closest('[data-turn]')?.getAttribute('data-turn'),'b');
    await settle(()=>root!.render(createElement(MarkedTurns,{...props,reloadToken:2,runs:[],sending:false,onAsk:()=>{},onRelatedJump:async()=>{}})));
    assert.equal(container.querySelector('[aria-label="Context Compare"]'),null);
    assert.equal(container.querySelector('[aria-label="Related Turns"]'),null);
    assert.equal(container.querySelector('[aria-label="Question Keep"] form'),null);
    assert.ok(row('h1'));

    // Production conversation presentation keeps management UI collapsed and opens Detail from the exact inline Marker.
    const immediateDrafts:any[]=[],createdKeeps:any[]=[];
    await settle(()=>root!.render(createElement(MarkedTurns,{...props,reloadToken:2,runs:[],sending:false,onAsk:()=>{},onRelatedJump:async()=>{},compact:true,onImmediatePrepared:(draft:any)=>immediateDrafts.push(draft),onKeepCreated:(keep:any)=>createdKeeps.push(keep)})));
    const debug=container.querySelector('details.marker-debug-tools') as HTMLDetailsElement;
    assert.ok(debug);assert.equal(debug.open,false);assert.ok(debug.querySelector('.marker-editor'));assert.ok(debug.querySelector('.marker-list'));
    await click(container.querySelector('[data-highlight="h1"]'));
    let detail=container.querySelector('[aria-label="Marker Detail"]')!;
    assert.ok(detail);assert.equal((button('今すぐ質問',detail) as HTMLButtonElement).disabled,false);
    await click(button('質問',detail));
    assert.equal((detail.querySelector('input') as HTMLInputElement).value,'質問です。 ');
    await click(button('Composerへ準備',detail));
    assert.equal(immediateDrafts.length,1);assert.equal(immediateDrafts[0].highlightId,'h1');assert.equal(immediateDrafts[0].turnNumber,3);
    assert.equal(container.querySelector('[aria-label="Marker Detail"]'),null);

    await click(container.querySelector('[data-highlight="new"]'));
    detail=container.querySelector('[aria-label="Marker Detail"]')!;
    assert.equal((button('今すぐ質問',detail) as HTMLButtonElement).disabled,true);
    assert.match(detail.textContent!,/最新のcompleted Assistant Turnだけ/);
    await click(button('後で質問',detail));
    const deferredInput=detail.querySelector('input') as HTMLInputElement;
    await settle(()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(deferredInput,'あとで確認');deferredInput.dispatchEvent(new dom.window.Event('input',{bubbles:true}));deferredInput.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
    await click(button('質問箱へ保存',detail));
    assert.equal(createdKeeps.length,1);assert.equal(createdKeeps[0].highlight_id,'new');

    await click(container.querySelector('[data-highlight="h1"]'));
    detail=container.querySelector('[aria-label="Marker Detail"]')!;
    const detailColor=detail.querySelector('[aria-label="Marker色"]') as HTMLSelectElement;
    await settle(()=>{detailColor.value='yellow';detailColor.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
    await click(button('Markerを更新',detail));
    assert.equal(highlights.find(h=>h.highlight_id==='h1')?.color,'yellow');assert.equal(highlights.find(h=>h.highlight_id==='h1')?.note,'memo 1');

    const externalJumpResults:boolean[]=[];
    await settle(()=>root!.render(createElement(MarkedTurns,{...props,reloadToken:3,runs:[],sending:false,onAsk:()=>{},onRelatedJump:async()=>{},markerJump:{highlightId:'h1',request:1},onMarkerJumpResult:(found:boolean)=>externalJumpResults.push(found)})));
    assert.equal(externalJumpResults.at(-1),true);
    assert.ok(container.querySelector('[data-highlight="h1"]')?.classList.contains('marker-jump-active'));
    await settle(()=>root!.render(createElement(MarkedTurns,{...props,reloadToken:3,runs:[],sending:false,onAsk:()=>{},onRelatedJump:async()=>{},markerJump:{highlightId:'h2',request:2},onMarkerJumpResult:(found:boolean)=>externalJumpResults.push(found)})));
    assert.equal(externalJumpResults.at(-1),false);
  } finally {
    if(root)await act(async()=>root!.unmount());
    for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
    dom.window.close();
    // mkdtemp creates a dedicated directory directly under the workspace cache.
    assert.equal(resolve(outDir).startsWith(cache + '\\') || resolve(outDir).startsWith(cache + '/'),true);
    await rm(outDir,{recursive:true,force:true});
  }
});
