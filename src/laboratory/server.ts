import { createServer, request, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { openDatabase } from '../server/storage/database.ts';
import { Repository } from '../server/storage/repository.ts';
import { GenerationService } from '../server/generation.ts';
import { LMStudioProvider } from '../server/provider.ts';
import { createAppServer } from '../server/http.ts';
import { RunFiles } from './single-text/run-files.ts';
import { SingleTextService } from './single-text/service.ts';
import { createSingleTextServer } from './single-text/server.ts';
import { SimpleSessions } from './simple-sessions.ts';
import type { SimpleRun } from './run-contracts.ts';
import { SingleTextError } from './single-text/contracts.ts';
import { experiments, type ExperimentDefinition } from './catalog.ts';
import {
  buildNewChatHandoffRequest, newChatHandoffGeneration,
  type NewChatHandoffRun, type NewChatHandoffSendInput,
} from './new-chat-handoff.ts';

function newChatHandoffInput(value: unknown): NewChatHandoffSendInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SingleTextError('INVALID_INPUT','入力が不正です');
  const item=value as Record<string,unknown>;
  const keys=['sourceConversation','sourceConversationId','sourceTurn','markerId','markerSourceText','markerStatus','handoff','handoffLevel','pastContextUtf16','futureContextUtf16','finalFirstUserMessage'];
  if (Object.keys(item).some(key=>!keys.includes(key)) || keys.some(key=>!(key in item))) throw new SingleTextError('INVALID_INPUT','入力項目が不正です');
  for(const key of ['sourceConversation','sourceConversationId','sourceTurn','markerId','markerSourceText','handoffLevel','finalFirstUserMessage'] as const) {
    if(typeof item[key]!=='string') throw new SingleTextError('INVALID_INPUT',`${key}が不正です`);
  }
  if(typeof item.handoff!=='boolean' || !['resolved','unresolved'].includes(String(item.markerStatus))) throw new SingleTextError('INVALID_INPUT','引継ぎ状態が不正です');
  if(!Number.isInteger(item.pastContextUtf16) || !Number.isInteger(item.futureContextUtf16) || Number(item.pastContextUtf16)<0 || Number(item.futureContextUtf16)<0) throw new SingleTextError('INVALID_INPUT','Context量が不正です');
  if(!(item.finalFirstUserMessage as string).trim() || (item.finalFirstUserMessage as string).length>12000) throw new SingleTextError('INVALID_INPUT','最初のUser Messageが不正です');
  if(item.handoff && item.markerStatus==='unresolved') throw new SingleTextError('INVALID_INPUT','Marker位置未解決のため引継ぎありでは送信できません');
  if(!item.handoff && (item.pastContextUtf16!==0 || item.futureContextUtf16!==0)) throw new SingleTextError('INVALID_INPUT','引継ぎなしへContextを含められません');
  return item as NewChatHandoffSendInput;
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => { server.off('error', fail); ok((server.address() as {port:number}).port); });
  });
}
async function close(server: Server) {
  server.closeAllConnections();
  if (server.listening) await new Promise<void>(done => server.close(() => done()));
}

// A fixed loopback gateway to the two existing HTTP implementations plus one
// memory-only New Chat Handoff experiment endpoint. It never stores that run.
export async function startLaboratory(options: { port: number; dataDirectory: string; distPath: string; provider?: LMStudioProvider; definitions?: readonly ExperimentDefinition[] }) {
  const definitions = options.definitions ?? experiments;
  const directory = resolve(options.dataDirectory);
  const files = new RunFiles(join(directory, 'single-text-runs'));
  let sessionFiles: RunFiles<SimpleRun> | undefined, sessions: SimpleSessions | undefined;
  let db: ReturnType<typeof openDatabase> | undefined;
  let chatServer: Server | undefined, singleServer: Server | undefined, gateway: Server | undefined;
  let single: SingleTextService | undefined, generation: GenerationService | undefined, repo: Repository | undefined;
  let closing = false;
  async function shutdown() {
    if (closing) return; closing = true;
    await single?.shutdown();
    if (repo && generation) {
      for (const conversation of repo.listConversations()) {
        const run = repo.activeRun(conversation.conversation_id);
        if (run) try { await generation.cancel(conversation.conversation_id, run.run_id); } catch { /* recovery below */ }
      }
    }
    if (gateway) await close(gateway);
    if (singleServer) await close(singleServer);
    if (chatServer) await close(chatServer);
    try { sessions?.shutdown(); } finally { repo?.recoverInterrupted(); db?.close(); sessionFiles?.close(); files.close(); }
  }
  try {
    const provider = options.provider ?? new LMStudioProvider();
    db = openDatabase(join(directory, 'simple-marker.sqlite'));
    repo = new Repository(db); repo.recoverInterrupted();
    sessionFiles = new RunFiles<SimpleRun>(join(directory, 'simple-session-runs'), definitions.filter(e => e.execution?.entry === 'simple-marker-chat').map(e => e.id));
    sessions = new SimpleSessions(sessionFiles, repo, provider.baseUrl, definitions);
    generation = new GenerationService(repo, provider);
    single = new SingleTextService(files, provider);
    chatServer = createAppServer(repo, options.distPath, generation);
    singleServer = createSingleTextServer(single, options.distPath);
    const chatPort = await listen(chatServer, 0), singlePort = await listen(singleServer, 0);
    let generating = false, sessionStorageError = false, markerWrites = 0;
    gateway = createServer(async (req, res) => {
      const port = (gateway!.address() as {port:number}).port;
      const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      const send = (status: number, message: string) => { res.writeHead(status, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:{message}})); };
      if (closing) { send(503, 'Laboratory終了処理中です'); return; }
      if (!hosts.includes(req.headers.host ?? '') || (req.headers.origin && !hosts.map(h => 'http://' + h).includes(req.headers.origin))) { send(403, '接続元が許可されていません'); return; }
      const url = new URL(req.url!, 'http://localhost');
      if (url.pathname.startsWith('/api/laboratory/')) {
        try {
          const json = (value: unknown) => { res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(value)); };
          if (req.method === 'POST' && url.pathname === '/api/laboratory/new-chat-handoff') {
            if (generating) return send(409,'Laboratoryで生成中です');
            let body='',size=0;
            for await (const chunk of req) { size+=chunk.length; if(size>16384) throw new SingleTextError('INVALID_INPUT','入力が大きすぎます'); body+=chunk; }
            const input=newChatHandoffInput(JSON.parse(body));
            const available=await provider.models();
            if(!available.includes(newChatHandoffGeneration.model)) {
              res.writeHead(409,{'Content-Type':'application/json','Cache-Control':'no-store'});
              res.end(JSON.stringify({error:{message:`固定モデル ${newChatHandoffGeneration.model} を利用できません`,available_models:available}}));
              return;
            }
            generating=true;
            let answer='',finishReason:'stop'|'length'|null=null,error:string|null=null;
            const startedAt=new Date().toISOString(),requestBody=buildNewChatHandoffRequest(input.finalFirstUserMessage);
            try {
              await provider.generate(requestBody,AbortSignal.timeout(240000),delta=>{answer+=delta;},value=>{finishReason=value.finish_reason;});
              if(!answer.trim()) throw new Error('回答本文が空です');
            } catch(cause) { error=String(cause instanceof Error ? cause.message : cause); }
            finally { generating=false; }
            const run:NewChatHandoffRun={...input,temporaryConversationId:randomUUID(),firstUserMessage:input.finalFirstUserMessage,
              assistantResponse:answer,model:newChatHandoffGeneration.model,
              generationSettings:{temperature:newChatHandoffGeneration.temperature,max_tokens:newChatHandoffGeneration.max_tokens},
              messageRoles:['system','user'],oldConversationMessageCount:0,finishReason,error,
              startedAt,completedAt:new Date().toISOString(),sourcePositionUnresolved:input.markerStatus==='unresolved',humanReview:'pending'};
            return json(run);
          }
          if (req.method === 'GET' && url.pathname === '/api/laboratory/sessions/current') return json(sessions!.current());
          if (req.method === 'GET' && url.pathname === '/api/laboratory/runs/simple') {
            if (sessionStorageError) { sessions!.checkpoint(); sessionStorageError = false; }
            return json(sessions!.list());
          }
          if (req.method === 'GET' && url.pathname === '/api/laboratory/runs/single') return json(files.all().sort((a,b) => b.started_at.localeCompare(a.started_at)));
          if (req.method !== 'POST') return send(404, '見つかりません');
          if (generating || markerWrites) return send(409, '生成またはMarker保存中です');
          let body = '', size = 0;
          for await (const chunk of req) { size += chunk.length; if (size > 4096) throw new SingleTextError('INVALID_INPUT', '入力が大きすぎます'); body += chunk; }
          const input = JSON.parse(body);
          if (!input || typeof input !== 'object' || Array.isArray(input)) return send(400, '入力が不正です');
          // Recheck after awaiting the body so concurrent requests cannot bypass the gate.
          if (generating || markerWrites) return send(409, '生成またはMarker保存中です');
          if (url.pathname === '/api/laboratory/sessions' && Object.keys(input).every(key => ['conversation_id','experiment_id'].includes(key)) && typeof input.conversation_id === 'string' && (input.experiment_id === undefined || typeof input.experiment_id === 'string')) return json(sessions!.start(input.conversation_id, input.experiment_id));
          const end = url.pathname.match(/^\/api\/laboratory\/sessions\/([0-9a-f-]{36})\/finish$/i);
          if (end && !Object.keys(input).length) return json(sessions!.finish(end[1]));
          return send(400, '入力が不正です');
        } catch (error) { return send(error instanceof SingleTextError ? error.status : error instanceof SyntaxError ? 400 : 500, error instanceof SingleTextError ? error.message : 'Run記録を読み書きできませんでした'); }
      }
      const generationRequest = req.method === 'POST' && (url.pathname === '/api/single/runs' || /^\/api\/conversations\/[^/]+\/chat$/.test(url.pathname));
      if (generationRequest && generating) { send(409, 'Laboratoryで生成中です'); return; }
      let session: SimpleRun | null;
      try { session = sessions!.current(); } catch { send(500, 'セッション記録を確認できません'); return; }
      if (generationRequest && !session && url.pathname !== '/api/single/runs') { send(409, '実験セッションを開始してください'); return; }
      if (generationRequest && session && url.pathname !== `/api/conversations/${session.conversation_id}/chat`) { send(409, 'Simpleセッションを終了してください'); return; }
      if (generationRequest) generating = true;
      const markerPath = url.pathname.match(/^\/api\/conversations\/([^/]+)\/highlights(?:\/([^/]+))?$/);
      const markerOperation = markerPath && !markerPath[2] && req.method === 'POST' ? 'created' : markerPath?.[2] && req.method === 'PATCH' ? 'edited' : markerPath?.[2] && req.method === 'DELETE' ? 'deleted' : null;
      const markerRun = markerOperation && session?.conversation_id === markerPath?.[1] ? session : null;
      if (markerRun) markerWrites++;
      let markerReleased = false;
      const releaseMarker = () => { if (markerRun && !markerReleased) { markerReleased = true; markerWrites--; } };
      const targetPort = url.pathname.startsWith('/api/single/') ? singlePort : chatPort;
      const targetHost = `127.0.0.1:${targetPort}`;
      const upstream = request({
        hostname:'127.0.0.1',port:targetPort,method:req.method,
        path:url.pathname === '/' ? '/laboratory.html' : req.url,
        headers:{...req.headers,host:targetHost,...(req.headers.origin ? {origin:'http://' + targetHost} : {})},
      }, response => {
        if (markerRun && markerOperation) {
          // Only inspect successful existing Highlight responses; mutation stays in Core.
          const chunks: Buffer[] = [];
          response.on('data', chunk => chunks.push(chunk));
          response.once('error', () => { releaseMarker(); if (!res.destroyed) send(502, 'Marker応答の確認に失敗しました'); });
          response.once('end', () => {
            const body = Buffer.concat(chunks);
            try {
              if ((response.statusCode ?? 500) >= 200 && response.statusCode! < 300) {
                const id = markerOperation === 'created' ? JSON.parse(body.toString('utf8')).highlight_id : markerPath![2];
                if (typeof id !== 'string') throw new Error('Missing Highlight ID');
                sessions!.markerEvent(markerRun.run_id, markerOperation, id);
              }
              if (!res.destroyed) { res.writeHead(response.statusCode ?? 502, response.headers); res.end(body); }
            } catch {
              sessionStorageError = true;
              if (!res.destroyed) send(500, 'Marker本体は保存済みですが、Run操作記録の保存に失敗しました。再登録せず一覧を再読込し、Resultsで記録を再確認してください');
            } finally { releaseMarker(); }
          });
          return;
        }
        res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res);
      });
      let released = false;
      const release = () => { if (generationRequest && !released) { released = true; generating = false; try { sessions!.checkpoint(); sessionStorageError = false; } catch { sessionStorageError = true; } } };
      upstream.once('error', () => { release(); releaseMarker(); if (!res.headersSent && !res.destroyed) send(502, '実験サーバーへ接続できません'); else res.destroy(); });
      res.once('finish', release);
      res.once('close', () => { release(); if (!res.writableEnded && !markerRun) upstream.destroy(); });
      req.once('aborted', () => upstream.destroy());
      req.pipe(upstream);
    });
    const port = await listen(gateway, options.port);
    return { port, shutdown };
  } catch (error) { await shutdown(); throw error; }
}
