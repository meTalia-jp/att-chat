import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { Repository, InputError } from './storage/repository.ts';
import { GenerationService } from './generation.ts';
import { ProviderError } from './provider.ts';
import { SearchError, type SemanticSearchService } from '../semantic/search.ts';
import { RetrievalError, type RetrievalService } from '../retrieval/service.ts';
import { PreviewError, type ContextPreviewService } from '../context-preview/service.ts';
import type { QuickMemoStore } from './quick-memo.ts';
import { LMStudioConnectionRuntime } from './model-connection.ts';
import type { SettingsStore } from './settings.ts';
import type { CollectionStore } from './collections.ts';

async function body(req: IncomingMessage, fields: string[]): Promise<Record<string, unknown>> {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new InputError('JSONで送信してください', 415);
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 262144) throw new InputError('リクエストが大きすぎます', 413); chunks.push(chunk); }
  let data; try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new InputError('JSONが不正です'); }
  if (!data || Array.isArray(data) || typeof data !== 'object' || Object.keys(data).some(k => !fields.includes(k))) throw new InputError('リクエストの項目が不正です');
  return data;
}
function send(res: ServerResponse, status: number, data: unknown) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
export function createAppServer(repo: Repository, distPath: string, generation = new GenerationService(repo), semantic?:SemanticSearchService, retrieval?:RetrievalService, preview?:ContextPreviewService, quickMemo?:QuickMemoStore, modelConnection = new LMStudioConnectionRuntime(generation), settings?: SettingsStore, collections?: CollectionStore) {
  let accepting = true;
  const active = new Set<Promise<void>>();
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const port = (server.address() as { port: number }).port;
      if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host ?? '')) throw new InputError('Hostが許可されていません', 403);
      const origin = req.headers.origin;
      if (origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`, 'http://127.0.0.1:5180', 'http://localhost:5180'].includes(origin)) throw new InputError('Originが許可されていません', 403);
      const requestUrl = new URL(req.url!, 'http://127.0.0.1'), path=requestUrl.pathname;
      const collectionRoute = path.match(/^\/api\/collections(?:\/([a-zA-Z0-9_-]+)(?:\/conversations\/([a-zA-Z0-9_-]+))?)?$/);
      if (collectionRoute) {
        if (!collections) throw new InputError('Collectionsは利用できません', 503);
        const [, collectionId, conversationId] = collectionRoute;
        if (!collectionId && req.method === 'GET') return send(res, 200, collections.get());
        if (!collectionId && req.method === 'POST') return send(res, 201, await collections.create((await body(req, ['name'])).name));
        if (collectionId && !conversationId && req.method === 'PATCH') return send(res, 200, await collections.rename(collectionId, (await body(req, ['name'])).name));
        if (collectionId && !conversationId && req.method === 'DELETE') { await body(req, []); return send(res, 200, await collections.deleteCollection(collectionId)); }
        if (collectionId && conversationId && req.method === 'PUT') { await body(req, []); return send(res, 200, await collections.assign(collectionId, conversationId)); }
        if (collectionId && conversationId && req.method === 'DELETE') { await body(req, []); return send(res, 200, await collections.unassign(collectionId, conversationId)); }
        throw new InputError('未対応のCollection操作です', 405);
      }
      if (path === '/api/settings') {
        if (!settings) throw new InputError('Settingsは利用できません', 503);
        if (req.method === 'GET') return send(res, 200, settings.get());
        if (req.method === 'PATCH') {
          const data = await body(req, ['general','model','ui','profiles']);
          if (data.model && (typeof data.model !== 'object' || Array.isArray(data.model) || Object.keys(data.model).some(key => key !== 'selected_model'))) throw new InputError('接続設定は接続確認から適用してください');
          try { settings.validate(data); } catch (error) { throw new InputError((error as Error).message); }
          return send(res, 200, await settings.update(data));
        }
      }
      const compare=path.match(/^\/api\/conversations\/([^/]+)\/highlights\/([^/]+)\/context-preview$/);
      if(compare&&req.method==='POST'){
        if(!preview)throw new PreviewError('PREVIEW_UNAVAILABLE','Previewは利用できません',503);
        return send(res,200,preview.build(compare[1],compare[2],await body(req,['strategy','local_budget','local_ratio','before_turns','after_turns'])));
      }
      const retrievalMatch=path.match(/^\/api\/retrieval\/turns\/([^/]+)(\/context)?$/);
      if(retrievalMatch&&req.method==='GET') {
        if(!retrieval)throw new RetrievalError('CONVERSATION_INCONSISTENT','Retrievalは利用できません',503);
        let turnId:string;try{turnId=decodeURIComponent(retrievalMatch[1]);}catch{throw new RetrievalError('TURN_NOT_FOUND','turn_idが不正です',400);}
        if(!retrievalMatch[2])return send(res,200,retrieval.getTurn(turnId));
        const allowed=new Set(['before','after']);if([...requestUrl.searchParams.keys()].some(key=>!allowed.has(key)))throw new RetrievalError('INVALID_WINDOW','検索項目が不正です');
        const parse=(name:'before'|'after')=>{const values=requestUrl.searchParams.getAll(name);if(values.length>1)throw new RetrievalError('INVALID_WINDOW',`${name}が重複しています`);if(!values.length)return undefined;if(!/^\d+$/.test(values[0]))throw new RetrievalError('INVALID_WINDOW',`${name}は0〜10の整数で指定してください`);return Number(values[0]);};
        return send(res,200,retrieval.getTurnContext(turnId,parse('before'),parse('after')));
      }
      const related=path.match(/^\/api\/conversations\/([^/]+)\/highlights\/([^/]+)\/related-turns$/);
      if(related && req.method==='POST') {
        const data=await body(req,['variant','role','scope','top_k']);
        if(!semantic)throw new SearchError('意味検索は未設定です');
        const controller=new AbortController();
        const timeout=setTimeout(()=>controller.abort(),30000);
        const closed=()=>{if(!res.writableEnded)controller.abort();}; res.once('close',closed);
        try {return send(res,200,await semantic.search(related[1],related[2],data,controller.signal));}
        finally {clearTimeout(timeout);res.off('close',closed);}
      }
      if (path === '/api/model-connection' && req.method === 'GET') return send(res, 200, modelConnection.current());
      if (path === '/api/model-connection/apply' && req.method === 'POST') {
        const data = await body(req, ['mode','base_url']);
        if (!['lm_studio_simple','lm_studio_advanced'].includes(String(data.mode))) throw new InputError('接続方式が不正です');
        try { return send(res, 200, await modelConnection.checkAndApply(data.mode as 'lm_studio_simple' | 'lm_studio_advanced', data.base_url)); }
        catch (error) {
          if (error instanceof ProviderError) throw error;
          throw new InputError(error instanceof Error ? error.message : '接続設定が不正です');
        }
      }
      if (path === '/api/models' && req.method === 'GET') return send(res, 200, { models: await modelConnection.models() });
      if (path === '/api/quick-memo') {
        if (!quickMemo) throw new InputError('Quickメモは利用できません', 503);
        if (req.method === 'GET') return send(res, 200, await quickMemo.read());
        if (req.method === 'POST') {
          const data = await body(req, ['text']);
          if (typeof data.text !== 'string' || !data.text.trim() || data.text.length > 10_000) throw new InputError('Quickメモ本文が不正です');
          return send(res, 201, await quickMemo.append(data.text));
        }
      }
      if (path === '/api/question-box' && req.method === 'GET') return send(res, 200, repo.questionKeeps.listGlobal());
      const chat = path.match(/^\/api\/conversations\/([^/]+)\/chat$/);
      const immediateAsk = path.match(/^\/api\/conversations\/([^/]+)\/immediate-ask$/);
      const keepContextPreview = path.match(/^\/api\/conversations\/([^/]+)\/question-keeps\/([^/]+)\/context-preview$/);
      if (keepContextPreview && req.method === 'POST') {
        const data = await body(req, ['user_question', 'context_level']);
        return send(res, 200, repo.previewKeepContextCorrection(keepContextPreview[1], keepContextPreview[2], data.user_question, data.context_level));
      }
      const handoffPreview = path.match(/^\/api\/conversations\/([^/]+)\/question-keeps\/([^/]+)\/handoff-preview$/);
      if (handoffPreview && req.method === 'POST') {
        const data = await body(req, ['user_question', 'handoff_level']);
        return send(res, 200, repo.previewNewChatHandoff(handoffPreview[1], handoffPreview[2], data.user_question, data.handoff_level));
      }
      const ask = path.match(/^\/api\/conversations\/([^/]+)\/question-keeps\/([^/]+)\/(ask|ask-new|handoff-new)$/);
      if ((chat || ask || immediateAsk) && req.method === 'POST') {
        const handoff = ask?.[3] === 'handoff-new';
        const sameChatKeep = ask?.[3] === 'ask';
        const data = await body(req, immediateAsk ? ['main_draft','marker_questions','model','request_id','system_prompt','user_profile'] : ask ? ['user_question', 'model', 'request_id', 'system_prompt', 'user_profile', ...(handoff ? ['handoff_level'] : []), ...(sameChatKeep ? ['context_level'] : [])] : ['content', 'model', 'request_id', 'system_prompt', 'user_profile']);
        const run = immediateAsk
          ? repo.prepareImmediateAsk(immediateAsk[1],data.main_draft,data.marker_questions,data.model,data.request_id,data.system_prompt,data.user_profile)
          : repo.prepareChat((chat || ask)![1], ask ? data.user_question : data.content, data.model, data.request_id, ask?.[2], ask ? ask[3] !== 'ask' : false, handoff ? data.handoff_level : undefined, sameChatKeep ? data.context_level : undefined, data.system_prompt, data.user_profile);
        res.writeHead(201, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        const emit = (event: Record<string, unknown>) => {
          if (!res.destroyed) {
            res.write(JSON.stringify(event) + '\n');
            if (res.writableLength > 2_000_000) res.destroy();
          }
        };
        res.once('close', () => { if (!res.writableEnded) generation.disconnect(run.run_id); });
        emit({ type: 'prepared', run });
        await generation.execute(run, emit);
        res.end(); return;
      }
      const cancel = path.match(/^\/api\/conversations\/([^/]+)\/runs\/([^/]+)\/cancel$/);
      if (cancel && req.method === 'POST') { await body(req, []); return send(res, 200, await generation.cancel(cancel[1], cancel[2])); }
      const highlights = path.match(/^\/api\/conversations\/([^/]+)\/highlights(?:\/([^/]+))?$/);
      const questionRuns = path.match(/^\/api\/conversations\/([^/]+)\/question-runs$/);
      if (questionRuns && req.method === 'GET') return send(res,200,repo.listQuestionRuns(questionRuns[1]));
      const keeps = path.match(/^\/api\/conversations\/([^/]+)\/question-keeps(?:\/([^/]+))?$/);
      if (keeps) {
        const id=keeps[1],keepId=keeps[2];
        if(!keepId && req.method==='GET') return send(res,200,repo.questionKeeps.list(id));
        if(!keepId && req.method==='POST') return send(res,201,repo.questionKeeps.create(id,await body(req,['highlight_id','question_draft','memo'])));
        if(keepId && req.method==='PATCH') return send(res,200,repo.questionKeeps.update(id,keepId,await body(req,['question_draft','memo','status'])));
        if(keepId && req.method==='DELETE') { repo.questionKeeps.delete(id,keepId); res.writeHead(204); res.end(); return; }
      }
      if (highlights) {
        const id = highlights[1], highlightId = highlights[2];
        if (!highlightId && req.method === 'GET') return send(res, 200, repo.listHighlights(id));
        if (!highlightId && req.method === 'POST') return send(res, 201, repo.createHighlight(id, await body(req, ['turn_id','start_offset','end_offset','source_text','target_text','color','note'])));
        if (highlightId && req.method === 'PATCH') return send(res, 200, repo.updateHighlight(id, highlightId, await body(req, ['color','note'])));
        if (highlightId && req.method === 'DELETE') { repo.deleteHighlight(id, highlightId); res.writeHead(204, { 'Cache-Control': 'no-store' }); res.end(); return; }
      }
      if (path === '/api/conversations') {
        if (req.method === 'GET') return send(res, 200, repo.listConversations());
        if (req.method === 'POST') return send(res, 201, repo.createConversation((await body(req, ['title'])).title));
      }
      const match = path.match(/^\/api\/conversations\/([^/]+)(?:\/(turns|mock-runs|runs\/([^/]+)\/retry))?$/);
      if (match) {
        const id = match[1];
        if (!match[2] && req.method === 'GET') return send(res, 200, repo.detail(id));
        if (!match[2] && req.method === 'PATCH') return send(res, 200, repo.updateConversationTitle(id, (await body(req, ['title'])).title));
        if (match[2] === 'turns') {
          if (req.method === 'GET') return send(res, 200, repo.listTurns(id));
          if (req.method === 'POST') return send(res, 201, repo.addUserTurn(id, (await body(req, ['content'])).content));
        }
        if (match[2] === 'mock-runs' && req.method === 'POST') {
          const data = await body(req, ['user_turn_id', 'content']);
          if (typeof data.user_turn_id !== 'string') throw new InputError('user_turn_idが必要です');
          return send(res, 201, repo.addMockRun(id, data.user_turn_id, data.content));
        }
        if (match[3] && req.method === 'POST') return send(res, 201, repo.retryMockRun(id, match[3], (await body(req, ['content'])).content));
      }
      if (path.startsWith('/api/')) throw new InputError('APIがありません', 404);
      if (req.method !== 'GET') throw new InputError('操作が許可されていません', 405);
      const file = resolve(distPath, path === '/' ? 'index.html' : `.${path}`);
      if (!file.startsWith(resolve(distPath) + sep)) throw new InputError('パスが不正です', 403);
      let data; try { data = await readFile(file); } catch { throw new InputError('UIがありません。npm run buildを実行してください', 404); }
      res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' } as Record<string, string>)[extname(file)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' }); res.end(data);
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      if(error instanceof PreviewError)return send(res,error.status,{error:{code:error.code,message:error.message}});
      if(error instanceof RetrievalError)return send(res,error.status,{error:{code:error.code,message:error.message}});
      if(error instanceof SearchError)return send(res,error.status,{error:{code:'SEMANTIC_SEARCH_ERROR',message:error.message}});
      if (error instanceof ProviderError) return send(res, 502, { error: { code: 'PROVIDER_ERROR', message: error.message } });
      const input = error instanceof InputError;
      const busy = /locked|busy/i.test(error instanceof Error ? error.message : '');
      send(res, input ? error.status : busy ? 503 : 500, { error: { code: input ? 'INVALID_REQUEST' : 'STORAGE_ERROR', message: input ? error.message : '保存・取得に失敗しました。成功扱いにはしていません。' } });
    }
  };
  const server = createServer((req, res) => {
    if (!accepting) { res.setHeader('Connection','close'); send(res,503,{error:{code:'SHUTTING_DOWN',message:'終了処理中です'}}); return; }
    const request = handle(req,res);
    active.add(request);
    // Track handler completion, not socket close: disconnected clients may still have pending writes.
    void request.then(() => active.delete(request), () => active.delete(request));
  });
  return Object.assign(server, {
    drainRequests() {
      accepting = false;
      return Promise.allSettled([...active]).then(() => undefined);
    },
  });
}
