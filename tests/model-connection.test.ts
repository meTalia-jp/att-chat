import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { openDatabase } from '../src/server/storage/database.ts';
import { Repository } from '../src/server/storage/repository.ts';
import { GenerationService } from '../src/server/generation.ts';
import { createAppServer } from '../src/server/http.ts';
import { LMStudioProvider, normalizeLMStudioBaseUrl, type GenerationDiagnostics } from '../src/server/provider.ts';

const diagnostic: GenerationDiagnostics = { finish_reason:'stop', completion_tokens:1, prompt_tokens:1, total_tokens:2, content_chars:1, reasoning_chars:0, duration_ms:1, terminal_chunk_received:true };

test('LM Studio詳細URLはZ690とprivate networkだけを許可し危険なURLを拒否する', () => {
  assert.equal(normalizeLMStudioBaseUrl('http://Z690:1234/v1'), 'http://z690:1234/v1');
  assert.equal(normalizeLMStudioBaseUrl('http://192.168.1.20:1234/v1/'), 'http://192.168.1.20:1234/v1');
  assert.equal(normalizeLMStudioBaseUrl('http://attchat.local:1234/v1'), 'http://attchat.local:1234/v1');
  for (const value of [
    'https://Z690:1234/v1', 'ftp://Z690:1234/v1', 'file:///tmp/model', 'data:text/plain,x',
    'http://user:pass@Z690:1234/v1', 'http://Z690:1234/v1?q=1', 'http://Z690:1234/v1#x',
    'http://Z690/v1', 'http://example.com:1234/v1', 'http://8.8.8.8:1234/v1',
  ]) assert.throws(() => normalizeLMStudioBaseUrl(value));
});

test('接続確認成功だけがapplied Providerを更新し失敗・redirectでは既存接続を維持する', async () => {
  const hits = { firstModels:0, secondModels:0, secondChat:0 };
  const upstream = (name: 'first' | 'second') => createServer(async (req,res) => {
    if (req.url === '/v1/models') {
      if (name === 'first') hits.firstModels += 1; else hits.secondModels += 1;
      res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({data:[{id:`${name}-model`}]})); return;
    }
    if (req.url === '/v1/chat/completions' && name === 'second') {
      hits.secondChat += 1;
      let body=''; for await (const chunk of req) body += chunk;
      assert.equal(JSON.parse(body).model,'second-model');
      res.writeHead(200,{'Content-Type':'text/event-stream'});
      res.write(`data: ${JSON.stringify({choices:[{index:0,delta:{content:'B'},finish_reason:'stop'}]})}\n\n`);
      res.write(`data: ${JSON.stringify({choices:[],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}})}\n\n`);
      res.end('data: [DONE]\n\n'); return;
    }
    res.writeHead(500); res.end();
  });
  const failed = createServer((_req,res) => { res.writeHead(503); res.end(); });
  const redirected = createServer((_req,res) => { res.writeHead(302,{Location:'http://example.com/v1/models'}); res.end(); });
  const first=upstream('first'),second=upstream('second');
  first.listen(0,'127.0.0.1');second.listen(0,'127.0.0.1');failed.listen(0,'127.0.0.1');redirected.listen(0,'127.0.0.1');
  await Promise.all([once(first,'listening'),once(second,'listening'),once(failed,'listening'),once(redirected,'listening')]);
  const firstUrl=`http://127.0.0.1:${(first.address() as {port:number}).port}/v1`;
  const secondUrl=`http://127.0.0.1:${(second.address() as {port:number}).port}/v1`;
  const failedUrl=`http://127.0.0.1:${(failed.address() as {port:number}).port}/v1`;
  const redirectedUrl=`http://127.0.0.1:${(redirected.address() as {port:number}).port}/v1`;
  const db=openDatabase(':memory:'),repo=new Repository(db),conversation=repo.createConversation('connection');
  const service=new GenerationService(repo,new LMStudioProvider(firstUrl));
  const app=createAppServer(repo,'dist',service);app.listen(0,'127.0.0.1');await once(app,'listening');
  const base=`http://127.0.0.1:${(app.address() as {port:number}).port}`;
  try {
    const initial=await (await fetch(base+'/api/model-connection')).json();
    assert.deepEqual(initial,{mode:'lm_studio_advanced',applied_base_url:firstUrl});
    const appliedResponse=await fetch(base+'/api/model-connection/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'lm_studio_advanced',base_url:secondUrl})});
    assert.equal(appliedResponse.status,200);
    assert.deepEqual(await appliedResponse.json(),{mode:'lm_studio_advanced',applied_base_url:secondUrl,models:['second-model']});
    assert.deepEqual(await (await fetch(base+'/api/models')).json(),{models:['second-model']});

    const rejected=await fetch(base+'/api/model-connection/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'lm_studio_advanced',base_url:secondUrl+'?unsafe=1'})});
    assert.equal(rejected.status,400);
    assert.deepEqual(await (await fetch(base+'/api/model-connection')).json(),{mode:'lm_studio_advanced',applied_base_url:secondUrl});

    for (const rejectedUrl of [failedUrl,redirectedUrl]) {
      const connectionFailure=await fetch(base+'/api/model-connection/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'lm_studio_advanced',base_url:rejectedUrl})});
      assert.equal(connectionFailure.status,502);
      assert.deepEqual(await (await fetch(base+'/api/model-connection')).json(),{mode:'lm_studio_advanced',applied_base_url:secondUrl});
    }

    const response=await fetch(`${base}/api/conversations/${conversation.conversation_id}/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:'q',model:'second-model',request_id:crypto.randomUUID()})});
    assert.equal(response.status,201);await response.text();
    const run=repo.listRuns(conversation.conversation_id)[0];
    assert.equal(repo.getTurn(conversation.conversation_id,run.assistant_turn_id).content,'B');
    assert.equal('base_url' in run.request_snapshot,false);
    assert.equal(hits.secondChat,1);assert.ok(hits.secondModels>=2);assert.equal(hits.firstModels,0);
  } finally {
    app.closeAllConnections();first.closeAllConnections();second.closeAllConnections();failed.closeAllConnections();redirected.closeAllConnections();
    await Promise.all([new Promise<void>(r=>app.close(()=>r())),new Promise<void>(r=>first.close(()=>r())),new Promise<void>(r=>second.close(()=>r())),new Promise<void>(r=>failed.close(()=>r())),new Promise<void>(r=>redirected.close(()=>r()))]);db.close();
  }
});

test('Run開始時のProviderをcaptureし接続変更は次Runから使う', async () => {
  let entered!:()=>void,release!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve}),gate=new Promise<void>(resolve=>{release=resolve});
  class FixtureProvider extends LMStudioProvider {
    calls=0;
    readonly output:string;private readonly wait:boolean;
    constructor(output:string,wait=false){super(`http://${output.toLowerCase()}.lan:1234/v1`);this.output=output;this.wait=wait;}
    override async models(){return [this.output];}
    override async generate(_snapshot:Record<string,unknown>,_signal:AbortSignal,onText:(text:string)=>void,onDiagnostics?:(value:GenerationDiagnostics)=>void){
      this.calls+=1;if(this.wait){entered();await gate;}onText(this.output);onDiagnostics?.({...diagnostic,content_chars:this.output.length});
    }
  }
  const db=openDatabase(':memory:'),repo=new Repository(db),firstConversation=repo.createConversation('first'),secondConversation=repo.createConversation('second');
  const first=new FixtureProvider('FIRST',true),second=new FixtureProvider('SECOND');
  const service=new GenerationService(repo,first);
  try {
    const firstRun=repo.prepareChat(firstConversation.conversation_id,'q','FIRST',crypto.randomUUID());
    const executing=service.execute(firstRun,()=>{});await started;
    service.replaceProvider(second);release();await executing;
    assert.equal(repo.getTurn(firstConversation.conversation_id,firstRun.assistant_turn_id).content,'FIRST');
    const secondRun=repo.prepareChat(secondConversation.conversation_id,'q','SECOND',crypto.randomUUID());
    await service.execute(secondRun,()=>{});
    assert.equal(repo.getTurn(secondConversation.conversation_id,secondRun.assistant_turn_id).content,'SECOND');
    assert.equal(first.calls,1);assert.equal(second.calls,1);
  } finally {db.close();}
});
