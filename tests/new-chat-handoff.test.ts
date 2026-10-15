import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNewChatHandoffPreview, buildNewChatHandoffRequest, handoffLevelLabel,
  newChatHandoffExperimentSources, newChatHandoffGeneration, newChatHandoffSystemPrompt,
  questionBoxHandoffMarkerStart, questionBoxHandoffSource, type HandoffSource,
} from '../src/laboratory/new-chat-handoff.ts';
import {allNewChatHandoffPreviews} from '../src/laboratory/new-chat-handoff-experiment.ts';

const resolved: HandoffSource = {
  conversationId: 'quick-action-fixture', conversationTitle: 'Conversation A',
  turnId: 'fixture-turn-25', turnNumber: 25, markerId: 'marker-a',
  markerSourceText: '月がきれいですね', questionDraft: 'なぜこの方式なのか確認',
  sourceTurnText: questionBoxHandoffSource, markerStartOffset: questionBoxHandoffMarkerStart,
  markerEndOffset: questionBoxHandoffMarkerStart + '月がきれいですね'.length,
};

test('New Chat Handoff: ONはpast中心、preset・future・構造化座標をPreviewへ保持', () => {
  for (const amount of [300, 800, 1500] as const) {
    const result = buildNewChatHandoffPreview(resolved, true, amount, 0);
    assert.equal(result.status, 'ready');
    if (result.status !== 'ready') continue;
    const p = result.preview;
    assert.equal(p.handoff, true); assert.equal(p.pastContextUtf16, amount);
    assert.equal(p.futureContextUtf16, 0); assert.equal(p.handoffLevel, handoffLevelLabel(amount));
    assert.deepEqual(p.range, { start: questionBoxHandoffMarkerStart - amount, end: resolved.markerEndOffset });
    assert.equal(p.marker.status, 'resolved'); assert.equal(p.marker.startOffset, questionBoxHandoffMarkerStart);
    assert.match(p.finalFirstUserMessage, /## 前の会話からの引継ぎ/);
    assert.match(p.finalFirstUserMessage, /【参照箇所開始】月がきれいですね【参照箇所終了】/);
    assert.match(p.finalFirstUserMessage, /なぜこの方式なのか確認/);
  }
  const experimental = buildNewChatHandoffPreview(resolved, true, 1100, 300);
  assert.equal(experimental.status, 'ready');
  if (experimental.status === 'ready') {
    assert.equal(experimental.preview.handoffLevel, 'Experimental 1100');
    assert.equal(experimental.preview.pastContextUtf16, 1100);
    assert.equal(experimental.preview.futureContextUtf16, 300);
  }
});

test('New Chat Handoff: OFFはMarkerとdraftだけ、空draftを生成補完しない', () => {
  const result = buildNewChatHandoffPreview({...resolved, questionDraft: ''}, false, 1500, 800);
  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') return;
  assert.equal(result.preview.handoff, false); assert.equal(result.preview.range, null);
  assert.equal(result.preview.pastContextUtf16, 0); assert.equal(result.preview.futureContextUtf16, 0);
  assert.equal(result.preview.questionDraft, '');
  assert.equal(result.preview.finalFirstUserMessage, '[参照箇所]\n月がきれいですね\n\n[質問]\n');
  assert.doesNotMatch(result.preview.finalFirstUserMessage, /前提文脈|質問です/);
});

test('New Chat Handoff: grapheme境界・Source端・unresolvedを安全に扱う', () => {
  const text = '前'.repeat(302) + '👩‍🔬e\u0301' + '対象' + '後'.repeat(302);
  const markerStart = text.indexOf('対象');
  const source = {...resolved, sourceTurnText: text, markerSourceText: '対象', markerStartOffset: markerStart, markerEndOffset: markerStart + 2};
  const ready = buildNewChatHandoffPreview(source, true, 300, 300);
  assert.equal(ready.status, 'ready');
  if (ready.status === 'ready') {
    const points = new Set([0, ...Array.from(new Intl.Segmenter('ja',{granularity:'grapheme'}).segment(text), p => p.index + p.segment.length)]);
    assert.ok(points.has(ready.preview.range!.start)); assert.ok(points.has(ready.preview.range!.end));
    assert.ok(ready.preview.range!.start >= 0 && ready.preview.range!.end <= text.length);
    assert.equal(text.slice(ready.preview.marker.startOffset!, ready.preview.marker.endOffset!), '対象');
  }
  const unresolved = {...resolved, unresolved: true, sourceTurnText: undefined, markerStartOffset: undefined, markerEndOffset: undefined};
  assert.equal(buildNewChatHandoffPreview(unresolved, true, 800, 0).status, 'blocked');
  const off = buildNewChatHandoffPreview(unresolved, false, 800, 0);
  assert.equal(off.status, 'ready');
  if (off.status === 'ready') {
    assert.equal(off.preview.marker.status, 'unresolved');
    assert.match(off.warning!, /保存済みMarker本文/);
  }
});

test('New Chat Handoff v0.2: new chat requestは固定system + 編集済みuserだけで開始する',()=>{
  const edited='[参照箇所]\n編集済みMarker\n\n[質問]\n編集した質問';
  const request=buildNewChatHandoffRequest(edited);
  assert.equal(request.model,'google/gemma-4-12b-qat');
  assert.deepEqual(request.messages,[{role:'system',content:newChatHandoffSystemPrompt},{role:'user',content:edited}]);
  assert.equal(request.messages.length,2);assert.equal(request.temperature,0);assert.equal(request.max_tokens,2048);
  assert.equal(newChatHandoffGeneration.stream,true);
});

test('New Chat Handoff v0.2: 2 Keep x OFF/300/800/1500はfuture 0で独立Previewになる',()=>{
  const cases=newChatHandoffExperimentSources.flatMap(source=>[
    buildNewChatHandoffPreview(source,false,300,0),
    ...([300,800,1500] as const).map(level=>buildNewChatHandoffPreview(source,true,level,0)),
  ]);
  assert.equal(cases.length,8);
  for(const value of cases){assert.equal(value.status,'ready');if(value.status!=='ready')continue;
    assert.equal(value.preview.futureContextUtf16,0);
    assert.equal(buildNewChatHandoffRequest(value.preview.finalFirstUserMessage).messages.length,2);
    if(value.preview.handoff){
      assert.ok(value.preview.range);assert.equal(value.preview.marker.status,'resolved');
      assert.match(value.preview.finalFirstUserMessage,/前の会話からの引継ぎ/);
    }else{
      assert.equal(value.preview.pastContextUtf16,0);assert.doesNotMatch(value.preview.finalFirstUserMessage,/前提文脈/);
    }
  }
});

test('New Chat Handoff v0.2: 8 Run PreviewのAutomatic checksが成立する',()=>{
  const previews=allNewChatHandoffPreviews();assert.equal(previews.length,8);
  assert.equal(new Set(previews.map(value=>`${value.fixture}-${value.condition}`)).size,8);
  for(const preview of previews){
    assert.ok(Object.values(preview.automatic).every(value=>Array.isArray(value)?value.join(',')==='system,user':value===true));
    assert.equal(preview.request.messages.length,2);assert.equal(preview.future_context_utf16,0);
  }
});
