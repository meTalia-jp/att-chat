import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { openDatabase } from '../src/server/storage/database.ts';
import { Repository } from '../src/server/storage/repository.ts';
import { GenerationService } from '../src/server/generation.ts';
import { LMStudioProvider } from '../src/server/provider.ts';
import { createAppServer } from '../src/server/http.ts';
import { keepContextStrategy, keepContextStrategyVersion, type KeepContextLevel } from '../src/shared/production-keep-context.ts';

function seed() {
  const db=openDatabase(':memory:'),repo=new Repository(db),conversationId=repo.createConversation('Context補正').conversation_id;
  for(let index=1;index<=4;index+=1){
    const user=repo.addUserTurn(conversationId,`User ${index} の理解`);
    repo.addMockRun(conversationId,user.turn_id,index===4?'Target全文: 固有Markerを説明する回答':`Assistant ${index} の説明`);
  }
  const target=repo.listTurns(conversationId).at(-1)!,markerText='固有Marker',start=target.content.indexOf(markerText);
  const highlight=repo.createHighlight(conversationId,{turn_id:target.turn_id,start_offset:start,end_offset:start+markerText.length,source_text:markerText,target_text:markerText,color:'blue',note:''});
  const keep=repo.questionKeeps.create(conversationId,{highlight_id:highlight.highlight_id,question_draft:'これは何ですか？',memo:'保持'});
  return {db,repo,conversationId,target,markerText,highlight,keep};
}

test('Keep Context Previewは少なめ/標準/多めを前方Turnだけで組み、DBを書き換えない',()=>{
  const fixture=seed();try{
    const before=JSON.parse(JSON.stringify({detail:fixture.repo.detail(fixture.conversationId),keep:fixture.repo.questionKeeps.get(fixture.conversationId,fixture.keep.keep_id)}));
    const counts:Record<KeepContextLevel,number>={minimal:2,standard:4,wide:6};
    for(const level of ['minimal','standard','wide'] as const){
      const preview=fixture.repo.previewKeepContextCorrection(fixture.conversationId,fixture.keep.keep_id,'なぜですか？',level);
      assert.equal(preview.context_level,level);assert.equal(preview.context_strategy,keepContextStrategy);assert.equal(preview.strategy_version,keepContextStrategyVersion);
      assert.equal(preview.included_turn_ids.length,counts[level]);assert.equal(preview.included_turn_ids.at(-1),fixture.target.turn_id);
      assert.equal(preview.included_turn_ids.filter(id=>id===fixture.target.turn_id).length,1);
      assert(preview.included_turns.every((turn,index,turns)=>index===0||turns[index-1].turn_number<turn.turn_number));
      assert.equal(preview.first_user_message.split(fixture.target.content).length-1,1);
      assert.match(preview.first_user_message,/## 参考文脈/);assert.match(preview.first_user_message,/## 質問対象\n\n固有Marker/);assert.match(preview.first_user_message,/## 質問\n\nなぜですか？/);
    }
    assert.deepEqual(JSON.parse(JSON.stringify({detail:fixture.repo.detail(fixture.conversationId),keep:fixture.repo.questionKeeps.get(fixture.conversationId,fixture.keep.keep_id)})),before);
  }finally{fixture.db.close()}
});

test('Conversation先頭ではclampし、Target以後の未来Turnを含めない',()=>{
  const fixture=seed();try{
    const target=fixture.repo.listTurns(fixture.conversationId)[1],markerText='Assistant',start=target.content.indexOf(markerText);
    const highlight=fixture.repo.createHighlight(fixture.conversationId,{turn_id:target.turn_id,start_offset:start,end_offset:start+markerText.length,source_text:markerText,target_text:markerText,color:'green',note:''});
    const keep=fixture.repo.questionKeeps.create(fixture.conversationId,{highlight_id:highlight.highlight_id,question_draft:'先頭'});
    const preview=fixture.repo.previewKeepContextCorrection(fixture.conversationId,keep.keep_id,'先頭ですか？','wide');
    assert.deepEqual(preview.included_turns.map(turn=>turn.turn_number),[1,2]);
    assert(!preview.first_user_message.includes('User 2 の理解'));
  }finally{fixture.db.close()}
});

test('Keep Contextは装飾境界Markerのtarget_textを表示しsnapshotへcanonical sourceも残す',()=>{
  const fixture=seed();try{
    const user=fixture.repo.addUserTurn(fixture.conversationId,'装飾境界を確認する');
    fixture.repo.addMockRun(fixture.conversationId,user.turn_id,'説明では **干渉**は重要です。');
    const target=fixture.repo.listTurns(fixture.conversationId).at(-1)!,sourceText='干渉**は',targetText='干渉は',start=target.content.indexOf('干渉');
    const highlight=fixture.repo.createHighlight(fixture.conversationId,{turn_id:target.turn_id,start_offset:start,end_offset:start+sourceText.length,source_text:sourceText,target_text:targetText,color:'yellow',note:''});
    const keep=fixture.repo.questionKeeps.create(fixture.conversationId,{highlight_id:highlight.highlight_id,question_draft:'なぜ重要ですか？',memo:''});
    const preview=fixture.repo.previewKeepContextCorrection(fixture.conversationId,keep.keep_id,'なぜ重要ですか？','standard');
    assert.equal(preview.marker_target_text,targetText);assert.match(preview.first_user_message,/## 質問対象\n\n干渉は/);assert.equal(preview.first_user_message.split('## 質問対象\n\n')[1].split('\n\n## 質問')[0],targetText);
    const run=fixture.repo.prepareChat(fixture.conversationId,'なぜ重要ですか？','test-model',crypto.randomUUID(),keep.keep_id,false,undefined,'standard');
    assert.equal(run.reference_snapshot?.source_text,sourceText);assert.equal(run.reference_snapshot?.target_text,targetText);
  }finally{fixture.db.close()}
});

async function withProvider(mode:'success'|'failure',callback:(fixture:ReturnType<typeof seed>&{service:GenerationService;requests:any[]})=>Promise<void>){
  const fixture=seed(),requests:any[]=[];
  const upstream=createServer(async(request,response)=>{
    let body='';for await(const chunk of request)body+=chunk;requests.push(JSON.parse(body));
    if(mode==='failure'){response.writeHead(503);response.end('provider unavailable');return}
    response.writeHead(200,{'Content-Type':'text/event-stream'});
    response.end(`data: ${JSON.stringify({choices:[{index:0,delta:{content:'Context回答'},finish_reason:'stop'}]})}\n\ndata: [DONE]\n\n`);
  });
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const service=new GenerationService(fixture.repo,new LMStudioProvider(`http://127.0.0.1:${(upstream.address() as {port:number}).port}/v1`));
  try{await callback({...fixture,service,requests})}
  finally{upstream.closeAllConnections();await new Promise<void>(resolve=>upstream.close(()=>resolve()));fixture.db.close()}
}

test('明示送信で2-message request・Run参照を固定し、開始時にKeepをaskedへ移す',async()=>withProvider('success',async fixture=>{
  const run=fixture.repo.prepareChat(fixture.conversationId,'編集した質問','test-model',crypto.randomUUID(),fixture.keep.keep_id,false,undefined,'standard');
  assert.equal(fixture.repo.questionKeeps.get(fixture.conversationId,fixture.keep.keep_id).status,'pending');
  assert.equal(run.context_strategy,keepContextStrategy);assert.equal(run.strategy_version,keepContextStrategyVersion);
  assert.equal(run.reference_snapshot?.context_strategy,keepContextStrategy);assert.equal(run.reference_snapshot?.strategy_version,keepContextStrategyVersion);assert.equal(run.reference_snapshot?.context_level,'standard');assert.equal(run.reference_snapshot?.included_turn_ids?.length,4);
  const messages=run.request_snapshot.messages as Array<{role:string;content:string}>;
  assert.deepEqual(messages.map(message=>message.role),['system','user']);assert.equal(messages.length,2);
  assert.equal(messages[1].content.split(fixture.target.content).length-1,1);
  assert(!messages[1].content.includes('User 1 の理解'));
  await fixture.service.execute(run,()=>{});
  assert.deepEqual(fixture.requests,[run.request_snapshot]);
  assert.equal(fixture.repo.questionKeeps.get(fixture.conversationId,fixture.keep.keep_id).status,'asked');
  assert.equal(fixture.repo.run(fixture.conversationId,run.run_id).outcome,'succeeded');
}));

test('生成失敗でもRun/referenceを保持し、送信開始済みKeepはaskedを維持する',async()=>withProvider('failure',async fixture=>{
  const run=fixture.repo.prepareChat(fixture.conversationId,'失敗確認','test-model',crypto.randomUUID(),fixture.keep.keep_id,false,undefined,'minimal');
  await fixture.service.execute(run,()=>{});
  const saved=fixture.repo.run(fixture.conversationId,run.run_id);
  assert.equal(fixture.requests.length,1);assert.equal(saved.outcome,'failed');assert.equal(saved.context_strategy,keepContextStrategy);
  assert.equal(saved.reference_snapshot?.context_level,'minimal');assert.equal(fixture.repo.questionKeeps.get(fixture.conversationId,fixture.keep.keep_id).status,'asked');
}));

test('HTTP Previewは非書込みで、context_level付きaskだけがRunを作る',async()=>withProvider('success',async fixture=>{
  const app=createAppServer(fixture.repo,'dist',fixture.service);app.listen(0,'127.0.0.1');await once(app,'listening');
  const base=`http://127.0.0.1:${(app.address() as {port:number}).port}`;
  try{
    const before=fixture.repo.detail(fixture.conversationId);
    const preview=await fetch(`${base}/api/conversations/${fixture.conversationId}/question-keeps/${fixture.keep.keep_id}/context-preview`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_question:'API質問',context_level:'standard'})});
    assert.equal(preview.status,200);assert.deepEqual(fixture.repo.detail(fixture.conversationId),before);assert.equal(fixture.repo.questionKeeps.get(fixture.conversationId,fixture.keep.keep_id).status,'pending');
    const missing=await fetch(`${base}/api/conversations/${fixture.conversationId}/question-keeps/${fixture.keep.keep_id}/ask`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_question:'API質問',model:'test-model',request_id:crypto.randomUUID()})});
    assert.equal(missing.status,400);assert.deepEqual(fixture.repo.detail(fixture.conversationId),before);
    const send=await fetch(`${base}/api/conversations/${fixture.conversationId}/question-keeps/${fixture.keep.keep_id}/ask`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_question:'API質問',context_level:'standard',model:'test-model',request_id:crypto.randomUUID()})});
    assert.equal(send.status,201);const events=(await send.text()).trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(events[0].run.context_strategy,keepContextStrategy);assert.equal(events.at(-1).outcome,'succeeded');
  }finally{app.closeAllConnections();await new Promise<void>(resolve=>app.close(()=>resolve()))}
}));
