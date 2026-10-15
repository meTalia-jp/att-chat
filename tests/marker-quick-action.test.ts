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
    Object.defineProperty(globalThis,'fetch',{configurable:true,value:async(input:RequestInfo|URL,init?:RequestInit)=>{
      if(String(input)==='/api/laboratory/new-chat-handoff'){
        const sent=JSON.parse(String(init?.body));return {ok:true,json:async()=>({...sent,temporaryConversationId:'temporary-test',firstUserMessage:sent.finalFirstUserMessage,assistantResponse:'実モデル相当のfixture回答',model:'google/gemma-4-12b-qat',generationSettings:{temperature:0,max_tokens:2048},messageRoles:['system','user'],oldConversationMessageCount:0,finishReason:'stop',error:null,startedAt:'2026-10-01T00:00:00Z',completedAt:'2026-10-01T00:00:01Z',sourcePositionUnresolved:false,humanReview:'pending'})};
      }
      loads++;if(loads===1)throw new Error('load failed');return {ok:true,json:async()=>({experiment:'実験、試み'})};
    }});
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

    // Immediate Ask is a Lab-only handoff; no request is made by any action below.
    const loadsBeforeAsk=loads;
    const press=async(text:string)=>{await act(async()=>Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent===text)!.click());};
    const field=()=>container.querySelector<HTMLTextAreaElement>('[aria-label="Lab Chat draft"]')!;
    const openAsk=async(id:string)=>{dom.window.getSelection()!.removeAllRanges();await act(async()=>container.querySelector<HTMLElement>(`[data-quick-marker="${id}"]`)!.click());await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Marker Detailを開く"]')!.click());await press('今すぐ質問');};
    const questions=()=>container.querySelectorAll('.ask-question');
    const previewButton=()=>Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent==='送信Preview')!;
    assert.equal(previewButton().disabled,true);
    await press('質問受け渡しfixtureを準備（T10 C / T25 A・B）');
    await openAsk('ask-fixture-0');assert.equal(container.querySelector('[aria-label="質問準備"]'),null);
    await openAsk('ask-fixture-1');await press('質問');await press('確定');
    assert.equal(field().value,'');assert.equal(questions().length,1);assert.equal(previewButton().disabled,false);
    await press('送信Preview');assert.match(container.querySelector('[aria-label="送信Preview結果"]')!.textContent!,/・「月がきれいですね」/);
    await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value')!.set!.call(field(),'先に書いた本文');field().dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
    await openAsk('ask-fixture-2');await press('しかし…');await press('確定');
    assert.equal(questions().length,2);assert.equal(field().value,'先に書いた本文');
    await openAsk('ask-fixture-1');await press('意見');await press('確定');assert.equal(questions().length,2);
    await press('送信Preview');const preview=container.querySelector('[aria-label="送信Preview結果"]')!.textContent!;
    assert.equal((preview.match(/・「/g)||[]).length,2);assert.match(preview,/## メッセージ\n\n先に書いた本文/);assert.doesNotMatch(preview,/ask-fixture|fixture-turn/);
    assert.equal(container.querySelectorAll('.ask-question q input').length,0);
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="再質問を削除 ask-fixture-1"]')!.click());
    assert.equal(questions().length,1);assert.ok(container.querySelector('[data-quick-marker="ask-fixture-1"]'));assert.equal(field().value,'先に書いた本文');
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="再質問を削除 ask-fixture-2"]')!.click());
    assert.equal(container.querySelector('[aria-label="回答への再質問"]'),null);assert.equal(field().value,'先に書いた本文');
    await openAsk('ask-fixture-1');await press('質問');await act(async()=>dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(questions().length,0);
    await openAsk('ask-fixture-1');await press('意見');await act(async()=>dom.window.document.body.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true})));assert.equal(questions().length,0);assert.equal(loads,loadsBeforeAsk);
    await openAsk('ask-fixture-0');await press('後で質問');await press('質問');
    assert.equal(Array.from(container.querySelectorAll('button')).find(b=>b.textContent==='後で質問')!.getAttribute('aria-pressed'),'true');
    await press('確定');assert.equal(container.querySelectorAll('[aria-label="Lab Question Keep"] li').length,1);
    assert.match(container.querySelector('[aria-label="Lab Question Keep"]')!.textContent!,/T10/);
    assert.equal(container.querySelector('[data-quick-marker="ask-fixture-0"]')!.getAttribute('data-question-info'),'true');
    assert.equal(container.querySelector('[data-quick-marker="ask-fixture-2"]')!.getAttribute('data-question-info'),null);
    await openAsk('ask-fixture-2');await press('後で質問');
    assert.equal(Array.from(container.querySelectorAll('button')).find(b=>b.textContent==='今すぐ質問')!.getAttribute('aria-pressed'),'false');
    await press('今すぐ質問');assert.equal(Array.from(container.querySelectorAll('button')).find(b=>b.textContent==='後で質問')!.getAttribute('aria-pressed'),'false');
    await press('後で質問');await press('確定');assert.equal(container.querySelectorAll('[aria-label="Lab Question Keep"] li').length,2);
    assert.equal(field().value,'先に書いた本文');assert.equal(loads,loadsBeforeAsk);

    // Question Box: cross-conversation source restoration is keyed by IDs, not quote text.
    const sidebar=container.querySelector('[aria-label="Lab左Sidebar"]')!;
    const chatTab=sidebar.querySelector<HTMLButtonElement>('[role="tab"][id="question-box-chat-tab"]')!;
    const boxTab=sidebar.querySelector<HTMLButtonElement>('[role="tab"][id="question-box-keeps-tab"]')!;
    assert.equal(chatTab.getAttribute('aria-selected'),'true');
    await press('質問箱fixtureを準備（6会話・20件）');
    const keeps=()=>Array.from(sidebar.querySelectorAll<HTMLElement>('[data-keep-id]'));
    assert.equal(keeps().length,22);
    await press('質問箱fixtureを準備（6会話・20件）');assert.equal(keeps().length,22);
    await act(async()=>boxTab.click());assert.equal(boxTab.getAttribute('aria-selected'),'true');
    const groups=()=>Array.from(sidebar.querySelectorAll<HTMLElement>('[data-question-group]'));
    const headings=()=>groups().map(g=>g.querySelector<HTMLButtonElement>('button')!);
    assert.deepEqual(groups().map(g=>g.dataset.questionGroup),['quick-action-fixture','question-box-f','question-box-e','question-box-d','question-box-c','question-box-b']);
    assert.deepEqual(headings().map(h=>h.getAttribute('aria-expanded')),['true','false','false','false','false','false']);
    assert.deepEqual(headings().map(h=>h.textContent!.match(/\d+件/)![0]),['5件','4件','5件','5件','1件','2件']);
    assert.equal(sidebar.querySelector('[data-question-group="question-box-empty"]'),null);
    assert.deepEqual(Array.from(groups()[5].querySelectorAll<HTMLElement>('[data-keep-id]')).map(k=>k.dataset.keepId),['box-unresolved','box-d']);
    await act(async()=>headings()[1].click());assert.equal(headings()[1].getAttribute('aria-expanded'),'true');
    assert.equal(chatTab.getAttribute('aria-selected'),'false'); // heading is not navigation
    await press('すべて閉じる');assert.ok(headings().every(h=>h.getAttribute('aria-expanded')==='false'));
    await act(async()=>headings()[0].click());assert.equal(headings()[0].getAttribute('aria-expanded'),'true');
    assert.match(keeps()[0].textContent!,/T25/); // user-created Keep remains newer than fixture seeds
    assert.match(sidebar.querySelector('[data-keep-id="box-d"]')!.closest('[data-question-group]')!.textContent!,/Conversation B/);
    assert.equal(sidebar.querySelector('[data-keep-id="box-unresolved"] p'),null);
    const scrolled:Element[]=[];
    Object.defineProperty(dom.window.HTMLElement.prototype,'scrollIntoView',{configurable:true,value:function(this:Element){scrolled.push(this);}});
    const restore=async(id:string)=>{await act(async()=>boxTab.click());const item=sidebar.querySelector<HTMLElement>(`[data-keep-id="${id}"]`)!; const heading=item.closest('[data-question-group]')!.querySelector<HTMLButtonElement>('button')!; if(heading.getAttribute('aria-expanded')!=='true')await act(async()=>heading.click()); await act(async()=>item.querySelector<HTMLButtonElement>('button')!.click());};
    await restore('box-b');
    assert.equal(chatTab.getAttribute('aria-selected'),'true');
    assert.equal(scrolled.at(-1)?.getAttribute('data-quick-marker'),'ask-fixture-2');
    assert.ok(container.querySelector('[data-quick-marker="ask-fixture-2"]')!.classList.contains('question-box-marker-pulse'));
    assert.equal(container.querySelector('[data-quick-marker="ask-fixture-2"]')!.getAttribute('data-question-info'),'true');
    assert.ok(!container.querySelector('[data-quick-marker="ask-fixture-1"]')!.classList.contains('question-box-marker-pulse'));
    await restore('box-d');
    assert.equal(container.querySelector<HTMLElement>('[data-box-conversation="question-box-b"]')!.hidden,false);
    assert.equal(container.querySelector<HTMLElement>('[data-box-conversation="quick-action-fixture"]')!.hidden,true);
    assert.equal(scrolled.at(-1)?.getAttribute('data-quick-marker'),'box-marker-d');
    assert.ok(container.querySelector('[data-quick-marker="box-marker-d"]')!.classList.contains('question-box-marker-pulse'));
    await restore('box-unresolved');
    assert.equal(scrolled.at(-1)?.getAttribute('data-box-turn'),'box-b-turn-9');
    assert.equal(container.querySelectorAll('.question-box-marker-pulse').length,0);
    assert.match(sidebar.textContent!,/Marker位置を確認できません/);
    await act(async()=>new Promise(resolve=>setTimeout(resolve,1850)));
    assert.equal(container.querySelectorAll('.question-box-turn-pulse').length,0);
    await restore('box-c');assert.equal(scrolled.at(-1)?.getAttribute('data-quick-marker'),'ask-fixture-0');
    assert.equal(field().value,'先に書いた本文');
    await openAsk('ask-fixture-2');await press('後で質問');await press('意見');await press('確定');
    await act(async()=>boxTab.click());assert.equal(keeps().length,23);assert.match(keeps()[0].textContent!,/私の考えでは、/);
    assert.equal(sidebar.querySelectorAll('li .question-box-return').length,23);
    const more=()=>sidebar.querySelectorAll<HTMLButtonElement>('.question-box-more');
    await act(async()=>more()[0].click());assert.equal(sidebar.querySelectorAll('.question-box-secondary-actions').length,1);
    await act(async()=>more()[0].click());assert.equal(sidebar.querySelectorAll('.question-box-secondary-actions').length,0);
    await act(async()=>more()[0].click());await act(async()=>more()[1].click());
    assert.equal(more()[0].getAttribute('aria-expanded'),'false');assert.equal(more()[1].getAttribute('aria-expanded'),'true');
    await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    assert.equal(sidebar.querySelectorAll('.question-box-secondary-actions').length,0);
    await act(async()=>more()[0].click());await act(async()=>document.body.dispatchEvent(new dom.window.Event('pointerdown',{bubbles:true})));
    assert.equal(sidebar.querySelectorAll('.question-box-secondary-actions').length,0);
    await act(async()=>more()[0].click());await press('質問する');assert.match(sidebar.textContent!,/質問する：未実装/);
    assert.equal(keeps().length,23);assert.equal(field().value,'先に書いた本文');
    const newChatFor=async(id:string)=>{
      const item=sidebar.querySelector<HTMLElement>(`[data-keep-id="${id}"]`)!;
      await act(async()=>item.querySelector<HTMLButtonElement>('.question-box-more')!.click());
      await act(async()=>Array.from(item.querySelectorAll<HTMLButtonElement>('.question-box-secondary-actions button')).find(b=>b.textContent==='新規チャット')!.click());
      return sidebar.querySelector<HTMLElement>('[aria-label="New Chat Handoff Setup"]')!;
    };
    let setup=await newChatFor('box-b');assert.ok(setup);assert.match(setup.textContent!,/新しいチャットへ/);
    assert.equal(setup.querySelector<HTMLSelectElement>('[aria-label="Experimental Past context"]')!.value,'800');
    assert.equal(setup.querySelector<HTMLSelectElement>('[aria-label="Experimental Future context"]')!.value,'0');
    await act(async()=>Array.from(setup.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent==='準備')!.click());
    let handoffPreview=setup.querySelector<HTMLElement>('[aria-label="New Chat Handoff Preview"]')!;
    assert.match(handoffPreview.textContent!,/Past context800 UTF-16/);assert.match(handoffPreview.textContent!,/Future context0 UTF-16/);
    const firstMessage=handoffPreview.querySelector<HTMLTextAreaElement>('textarea')!;assert.equal(firstMessage.readOnly,false);assert.match(firstMessage.value,/前の会話からの引継ぎ/);
    await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value')!.set!.call(firstMessage,firstMessage.value+'\n\n編集追記');firstMessage.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
    await act(async()=>{Array.from(setup.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent==='新規チャットとして送信')!.click();await new Promise(resolve=>setImmediate(resolve));});
    const newChatResult=setup.querySelector<HTMLElement>('[aria-label="New Chat Result"]')!;assert.match(newChatResult.textContent!,/実モデル相当のfixture回答/);assert.match(newChatResult.textContent!,/system \+ user/);assert.match(newChatResult.querySelector('pre')!.textContent!,/編集追記/);
    await act(async()=>setup.querySelectorAll<HTMLInputElement>('input[name="handoff-enabled"]')[1].click());
    await act(async()=>Array.from(setup.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent==='準備')!.click());
    handoffPreview=setup.querySelector<HTMLElement>('[aria-label="New Chat Handoff Preview"]')!;
    assert.doesNotMatch(handoffPreview.querySelector('textarea')!.value,/前提文脈/);assert.match(handoffPreview.textContent!,/HandoffOFF/);
    await act(async()=>Array.from(setup.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent==='キャンセル')!.click());
    assert.equal(sidebar.querySelector('[aria-label="New Chat Handoff Setup"]'),null);
    setup=await newChatFor('box-b');
    const pastSelect=setup.querySelector<HTMLSelectElement>('[aria-label="Experimental Past context"]')!, futureSelect=setup.querySelector<HTMLSelectElement>('[aria-label="Experimental Future context"]')!;
    await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value')!.set!.call(pastSelect,'1100');pastSelect.dispatchEvent(new dom.window.Event('change',{bubbles:true}));Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value')!.set!.call(futureSelect,'300');futureSelect.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
    await act(async()=>Array.from(setup.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent==='準備')!.click());
    handoffPreview=setup.querySelector<HTMLElement>('[aria-label="New Chat Handoff Preview"]')!;
    assert.match(handoffPreview.textContent!,/Experimental 1100/);assert.match(handoffPreview.textContent!,/Past context1100 UTF-16/);assert.match(handoffPreview.textContent!,/Future context300 UTF-16/);
    await act(async()=>setup.querySelector<HTMLButtonElement>('[aria-label="New Chat Handoffを閉じる"]')!.click());
    setup=await newChatFor('box-unresolved');assert.match(setup.textContent!,/Marker位置未解決/);
    await act(async()=>Array.from(setup.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent==='準備')!.click());assert.match(setup.querySelector('[role="alert"]')!.textContent!,/自動re-anchorは行いません/);
    await act(async()=>setup.querySelectorAll<HTMLInputElement>('input[name="handoff-enabled"]')[1].click());await act(async()=>Array.from(setup.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent==='準備')!.click());
    assert.match(setup.querySelector<HTMLElement>('[aria-label="New Chat Handoff Preview"]')!.textContent!,/Question draft（空）/);
    await act(async()=>Array.from(setup.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent==='キャンセル')!.click());
    await act(async()=>more()[0].click());await act(async()=>headings()[0].click());assert.equal(sidebar.querySelectorAll('.question-box-secondary-actions').length,0);
    await act(async()=>headings()[0].click());await act(async()=>more()[0].click());await press('すべて閉じる');assert.equal(sidebar.querySelectorAll('.question-box-secondary-actions').length,0);
    assert.equal(loads,loadsBeforeAsk);
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
