import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import type { createRoot as CreateRoot } from 'react-dom/client';
import type { Conversation, ConversationDetail, GenerationRun, Highlight, Turn } from '../src/shared/contracts.ts';

async function uiFixture(work: (value: { container: HTMLElement; modules: Record<string, any>; render: (node: React.ReactNode) => Promise<void> }) => Promise<void>) {
  const cache = resolve('.cache'); await mkdir(cache, { recursive:true });
  const out = await mkdtemp(join(cache, 'ui-center-test-'));
  const dom = new JSDOM('<div id="app"></div>', { url:'http://localhost/' });
  const keys = ['window','document','Node','NodeFilter','Range','HTMLElement','ResizeObserver','requestAnimationFrame','cancelAnimationFrame','IS_REACT_ACT_ENVIRONMENT','fetch'] as const;
  const saved = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let root: ReturnType<typeof CreateRoot> | undefined;
  try {
    await build({ configFile:false, logLevel:'silent', build:{ ssr:true, outDir:out, rollupOptions:{ input:{ MarkerCore:resolve('src/client/MarkerCore.tsx'), HandoffPresentation:resolve('src/client/HandoffPresentation.tsx'), Chat:resolve('src/client/Chat.tsx') }, output:{ entryFileNames:'[name].mjs' } } } });
    for (const key of ['window','document','Node','NodeFilter','Range','HTMLElement'] as const) Object.defineProperty(globalThis, key, { configurable:true, value:key === 'window' ? dom.window : dom.window[key] });
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT:true, ResizeObserver:class { observe(){} disconnect(){} }, requestAnimationFrame:(callback:FrameRequestCallback)=>setTimeout(()=>callback(0), 0), cancelAnimationFrame:(id:number)=>clearTimeout(id) });
    dom.window.matchMedia = (() => ({ matches:true, addEventListener(){}, removeEventListener(){} })) as unknown as typeof window.matchMedia;
    dom.window.HTMLElement.prototype.scrollIntoView = function(){};
    const { createRoot } = await import('react-dom/client');
    const modules = {
      ...(await import(pathToFileURL(join(out, 'MarkerCore.mjs')).href)),
      ...(await import(pathToFileURL(join(out, 'HandoffPresentation.mjs')).href)),
      ...(await import(pathToFileURL(join(out, 'Chat.mjs')).href)),
    };
    const container = dom.window.document.getElementById('app')!; root = createRoot(container);
    const render = async (node: React.ReactNode) => { await act(async () => { root!.render(node); await new Promise(done => setTimeout(done, 100)); }); };
    await work({ container, modules, render });
  } finally {
    if (root) await act(async () => root!.unmount());
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    dom.window.close(); await rm(out, { recursive:true, force:true });
  }
}

test('center Turn presentation keeps roles, sequence, status and readable Markdown with Marker', async () => uiFixture(async ({ container, modules, render }) => {
  const assistantContent = '説明の**重要**部分です。\n\n- 項目A\n- 項目B\n\n```ts\nconst value = 1;\n```\n\n|列|値|\n|---|---|\n|A|1|';
  const start = assistantContent.indexOf('重要');
  const turns: Turn[] = [
    { turn_id:'u', conversation_id:'c', sequence_no:0, role:'user', content:'質問です', status:'completed', created_at:'x', finalized_at:'x' },
    { turn_id:'a', conversation_id:'c', sequence_no:1, role:'assistant', content:assistantContent, status:'completed', created_at:'x', finalized_at:'x' },
    { turn_id:'g', conversation_id:'c', sequence_no:2, role:'assistant', content:'生成途中', status:'generating', created_at:'x', finalized_at:null },
  ];
  const highlight: Highlight = { highlight_id:'h', turn_id:'a', start_offset:start, end_offset:start + 2, source_text:'重要', target_text:'重要', color:'red', note:'', created_at:'x', updated_at:'x', status:'resolved', reason:null };
  globalThis.fetch = (async input => String(input).endsWith('/highlights') ? Response.json([highlight]) : Promise.reject(new Error(`Unexpected ${input}`))) as typeof fetch;
  await render(createElement(modules.MarkerCore, { conversationId:'c', turns, reloadToken:0, presentation:'conversation', showMarkerManagement:false }));
  assert.equal(container.querySelectorAll('.conversation-turn').length, 3);
  assert.match(container.querySelector('[data-turn="u"] .turn-heading')!.textContent!, /You.*T1/);
  assert.match(container.querySelector('[data-turn="a"] .turn-heading')!.textContent!, /Assistant.*T2/);
  assert.doesNotMatch(container.querySelector('[data-turn="u"] .turn-heading')!.textContent!, /完了/);
  assert.equal(container.querySelector('[data-turn="a"] .turn-status'), null);
  assert.match(container.querySelector('[data-turn="g"] .turn-heading')!.textContent!, /Assistant.*T3.*生成中/);
  assert.equal(container.querySelectorAll('[data-turn="a"] mark[data-highlight="h"]').length, 1);
  assert.ok(container.querySelector('[data-turn="a"] ul'));
  assert.ok(container.querySelector('[data-turn="a"] pre code'));
  assert.ok(container.querySelector('[data-turn="a"] table'));
}));

test('handoff presentation shows only the question while retaining origin identifiers for the source label', async () => uiFixture(async ({ container, modules, render }) => {
  const raw = '## 前の会話からの参考文脈\n\n[T1 / User]\n前提\n\n## 質問対象\n\n引用\n\n## 質問\n\nこれは何ですか？';
  const run = { run_id:'r', conversation_id:'new', user_turn_id:'u', assistant_turn_id:'a', retry_of_run_id:null, kind:'highlight_question', model_id:'m', provider:'lm_studio', context_strategy:'turn_based_handoff', strategy_version:'2', request_snapshot:{}, started_at:'x', finished_at:'x', outcome:'succeeded', error:null, reference_snapshot:{ highlight_id:'h', source_turn_id:'source-turn', start_offset:0, end_offset:2, source_text:'引用', target_text:'引用', snapshot_version:2, source_conversation_id:'source' } } satisfies GenerationRun;
  const turn = { turn_id:'u', conversation_id:'new', sequence_no:0, role:'user', content:raw, status:'completed', created_at:'x', finalized_at:'x' } satisfies Turn;
  assert.equal(modules.turnContentForDisplay(turn, [run]), 'これは何ですか？');
  assert.equal(turn.content, raw);
  const source: ConversationDetail = { conversation:{ conversation_id:'source', title:'量子について', created_at:'x', updated_at:'x' }, turns:[{ ...turn, turn_id:'source-turn', conversation_id:'source', sequence_no:7 }], runs:[] };
  const detail: ConversationDetail = { conversation:{ conversation_id:'new', title:'分岐', created_at:'x', updated_at:'x' }, turns:[turn], runs:[run] };
  const list: Conversation[] = [detail.conversation, source.conversation];
  globalThis.fetch = (async input => String(input) === '/api/conversations/source' ? Response.json(source) : Promise.reject(new Error(`Unexpected ${input}`))) as typeof fetch;
  await render(createElement(modules.HandoffOrigin, { detail, conversations:list }));
  assert.equal(container.querySelector('[aria-label="引継ぎ元"]')?.textContent, '元の会話「量子について」 / T8 から引継ぎ');
}));

test('Composer hides an empty reference area, auto-grows, and keeps five Immediate Ask references compact', async () => uiFixture(async ({ container, modules, render }) => {
  globalThis.fetch = (async input => String(input) === '/api/models' ? Response.json({ models:[] }) : Promise.reject(new Error(`Unexpected ${input}`))) as typeof fetch;
  const detail: ConversationDetail = { conversation:{ conversation_id:'c', title:'fixture', created_at:'x', updated_at:'x' }, turns:[], runs:[] };
  const immediateDrafts = Array.from({ length:5 }, (_, index) => ({ highlightId:`h${index}`, turnId:'a', turnNumber:10, quote:`Marker ${index + 1}`, prefix:'質問' as const, question:`質問 ${index + 1}` }));
  await render(createElement(modules.Chat, { detail, normalLayout:true, question:null, immediateDrafts, onCloseQuestion:()=>{}, onBusy:()=>{}, refresh:async()=>{} }));
  const foundation = container.querySelector('.immediate-reference-foundation');
  assert.ok(foundation?.classList.contains('immediate-reference-count-3'));
  assert.equal(foundation?.querySelectorAll('article').length, 5);
  assert.match(foundation!.textContent!, /5\/5件/);
  const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
  Object.defineProperty(textarea, 'scrollHeight', { configurable:true, value:220 });
  modules.resizeComposerTextarea(textarea);
  assert.equal(textarea.style.height, '136px');
  assert.equal(textarea.style.overflowY, 'auto');
  await render(createElement(modules.Chat, { detail, normalLayout:true, question:null, immediateDrafts:[], onCloseQuestion:()=>{}, onBusy:()=>{}, refresh:async()=>{} }));
  assert.equal(container.querySelector('.immediate-reference-foundation'), null);
  const stop = [...container.querySelectorAll('button')].find(button => button.textContent === '停止');
  assert.equal(stop?.disabled, true);
}));

test('center CSS bounds Marker Detail, Immediate Ask lists and collapsible previews', async () => {
  const [css, chat, main] = await Promise.all([readFile('src/client/normal-chat.css', 'utf8'), readFile('src/client/Chat.tsx', 'utf8'), readFile('src/client/main.tsx', 'utf8')]);
  assert.match(css, /\.production-marker-detail\{[^}]*position:fixed[^}]*width:min\(352px,calc\(100vw - 16px\)\)[^}]*max-width:calc\(100vw - 16px\)[^}]*max-height:calc\(100vh - 16px\)[^}]*overflow:auto/);
  assert.doesNotMatch(css, /\.production-marker-detail\{[^}]*(?:right|max\(16px,calc\(var\(--right-sidebar\))/);
  assert.match(css, /\.production-marker-question textarea\{min-height:94px;max-height:184px;overflow:auto/);
  assert.match(css, /\.production-marker-memo textarea\{min-height:46px;max-height:96px;overflow:auto/);
  assert.match(css, /@media\(max-width:1099px\)[^\n]*\.production-marker-detail\{width:min\(340px,calc\(100vw - 24px\)\)/);
  assert.match(css, /\.immediate-reference-list\{max-height:132px;overflow:auto/);
  assert.match(css, /\.production-preview-body\{max-height:176px;overflow:auto/);
  assert.match(css, /\.conversation-turns\{width:100%;max-width:980px/);
  assert.match(css, /\.right-sidebar-is-collapsed\{--right-sidebar:32px\}/);
  assert.match(css, /\.right-sidebar-toggle\{[^}]*left:4px[^}]*top:8px/);
  assert.match(css, /\.right-sidebar-collapsed \.right-sidebar-toggle\{left:2px/);
  assert.match(css, /\.quick-tools>\[role=tablist\]\{[^}]*margin-left:34px/);
  assert.match(css, /\.chat-controls textarea\{height:42px;min-height:42px;max-height:136px;resize:none/);
  assert.match(css, /\.normal-chat-conversation\{display:flex;flex-direction:column;overflow:hidden\}/);
  assert.match(css, /\.normal-chat \.app-heading\{[^}]*flex:0 0 36px[^}]*border-bottom:/);
  assert.match(css, /\.normal-chat>\.layout\{[^}]*flex:1[^}]*min-height:0[^}]*overflow:hidden/);
  assert.match(css, /\.normal-chat \.layout>main\{[^}]*overflow-y:auto[^}]*padding-right:0/);
  assert.match(css, /\.normal-chat \.layout>\.right-sidebar\{position:relative[^}]*align-self:stretch[^}]*min-height:0/);
  assert.match(main, /<header className="app-heading"[\s\S]*?<div className="layout">/);
  assert.match(main, /normal-chat-conversation/);
  assert.doesNotMatch(main, /新規チャットのタイトル|タイトル（任意）/);
  assert.match(main, /className="conversation-create"[^>]*onClick=\{\(\) => void action\(\(\) => createConversation\(\)\)\}/);
  assert.match(chat, /production-handoff-preview[^\n]*<details open>/);
  assert.match(chat, /immediate-reference-count-/);
  assert.match(chat, /immediateDrafts\.length > 0/);
});

test('normal generation status hides success while retaining actionable outcomes', async () => uiFixture(async ({ modules }) => {
  assert.equal(modules.visibleGenerationStatus('succeeded'), '');
  assert.equal(modules.visibleGenerationStatus('failed'), '生成に失敗しました');
  assert.equal(modules.visibleGenerationStatus('cancelled'), 'キャンセルしました');
  assert.equal(modules.visibleGenerationStatus('interrupted'), '中断しました');
}));
