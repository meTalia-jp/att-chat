import { createServer, type IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { SingleTextError } from './contracts.ts';
import { SingleTextService } from './service.ts';

async function readBody(req: IncomingMessage) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new SingleTextError('JSON_REQUIRED', 'JSONが必要です', 415);
  const chunks: Buffer[] = []; let size = 0;
  for await (const part of req) { size += part.length; if (size > 500000) throw new SingleTextError('INPUT_TOO_LARGE', '入力が大きすぎます', 413); chunks.push(part); }
  let value: unknown;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new SingleTextError('INVALID_JSON', 'JSONが不正です'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SingleTextError('INVALID_INPUT', '入力が不正です');
  return value as Record<string, unknown>;
}
export function createSingleTextServer(service: SingleTextService, distPath: string) {
  const server = createServer(async (req, res) => {
    const send = (status: number, value: unknown) => {
      if (res.destroyed) return;
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value));
    };
    try {
      const port = (server.address() as { port: number }).port, hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!hosts.includes(req.headers.host ?? '') || (req.headers.origin && !hosts.map(h => 'http://' + h).includes(req.headers.origin))) throw new SingleTextError('ORIGIN_REJECTED', '許可されていない接続元です', 403);
      const path = new URL(req.url!, 'http://localhost').pathname;
      if (path === '/api/single/models' && req.method === 'GET') return send(200, { models: await service.provider.models() });
      if (path === '/api/single/latest' && req.method === 'GET') return send(200, service.latest());
      if (path === '/api/single/runs' && req.method === 'POST') {
        const run = service.reserve(await readBody(req));
        res.writeHead(201, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' });
        const closed = () => { if (!res.writableEnded) service.disconnect(run.run_id); };
        res.once('close', closed);
        try {
          await service.execute(run.run_id, event => {
            if (!res.destroyed) {
              res.write(JSON.stringify(event) + '\n');
              if (res.writableLength > 2000000) res.destroy();
            }
          });
          if (!res.destroyed) res.end();
        } finally { res.off('close', closed); }
        return;
      }
      const match = path.match(/^\/api\/single\/runs\/([0-9a-f-]{36})(\/stop)?$/i);
      if (match && !match[2] && req.method === 'GET') return send(200, service.read(match[1]));
      if (match && match[2] && req.method === 'POST') {
        if (Object.keys(await readBody(req)).length) throw new SingleTextError('INVALID_INPUT', '停止に追加パラメータは不要です');
        return send(200, await service.stop(match[1]));
      }
      if (req.method !== 'GET' || !(path === '/' || path === '/single-text-generation.html' || path.startsWith('/assets/'))) throw new SingleTextError('NOT_FOUND', '見つかりません', 404);
      const root = resolve(distPath), file = resolve(root, path === '/' ? 'single-text-generation.html' : '.' + path);
      if (!file.startsWith(root + sep)) throw new SingleTextError('NOT_FOUND', '見つかりません', 404);
      let data: Buffer;
      try { data = await readFile(file); } catch { throw new SingleTextError('NOT_FOUND', 'ビルドした画面がありません', 404); }
      res.writeHead(200, { 'Content-Type': ({ '.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css' } as Record<string,string>)[extname(file)] ?? 'application/octet-stream', 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff' });
      res.end(data);
    } catch (e) {
      if (res.headersSent) { res.destroy(); return; }
      send(e instanceof SingleTextError ? e.status : 502, { error: { code: e instanceof SingleTextError ? e.code : 'RUNTIME_ERROR', message: e instanceof Error ? e.message : '実行失敗' } });
    }
  });
  return server;
}
