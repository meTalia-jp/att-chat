import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { Repository, InputError } from './storage/repository.ts';
import { GenerationService } from './generation.ts';
import { ProviderError } from './provider.ts';

async function body(req: IncomingMessage, fields: string[]): Promise<Record<string, unknown>> {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new InputError('JSONで送信してください', 415);
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 262144) throw new InputError('リクエストが大きすぎます', 413); chunks.push(chunk); }
  let data; try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new InputError('JSONが不正です'); }
  if (!data || Array.isArray(data) || typeof data !== 'object' || Object.keys(data).some(k => !fields.includes(k))) throw new InputError('リクエストの項目が不正です');
  return data;
}
function send(res: ServerResponse, status: number, data: unknown) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
export function createAppServer(repo: Repository, distPath: string, generation = new GenerationService(repo)) {
  const server = createServer(async (req, res) => {
    try {
      const port = (server.address() as { port: number }).port;
      if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host ?? '')) throw new InputError('Hostが許可されていません', 403);
      const origin = req.headers.origin;
      if (origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`, 'http://127.0.0.1:5180', 'http://localhost:5180'].includes(origin)) throw new InputError('Originが許可されていません', 403);
      const path = new URL(req.url!, 'http://127.0.0.1').pathname;
      if (path === '/api/models' && req.method === 'GET') return send(res, 200, { models: await generation.provider.models() });
      const chat = path.match(/^\/api\/conversations\/([^/]+)\/chat$/);
      const ask = path.match(/^\/api\/conversations\/([^/]+)\/question-keeps\/([^/]+)\/ask$/);
      if ((chat || ask) && req.method === 'POST') {
        const data = await body(req, ask ? ['user_question', 'model', 'request_id'] : ['content', 'model', 'request_id']);
        const run = repo.prepareChat((chat || ask)![1], ask ? data.user_question : data.content, data.model, data.request_id, ask?.[2]);
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
      if (error instanceof ProviderError) return send(res, 502, { error: { code: 'PROVIDER_ERROR', message: error.message } });
      const input = error instanceof InputError;
      const busy = /locked|busy/i.test(error instanceof Error ? error.message : '');
      send(res, input ? error.status : busy ? 503 : 500, { error: { code: input ? 'INVALID_REQUEST' : 'STORAGE_ERROR', message: input ? error.message : '保存・取得に失敗しました。成功扱いにはしていません。' } });
    }
  });
  return server;
}
