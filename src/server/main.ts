import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openDatabase } from './storage/database.ts';
import { Repository } from './storage/repository.ts';
import { createAppServer } from './http.ts';
import { launchSemanticWorker } from '../semantic/launch.ts';
import { createSemanticSearch } from '../semantic/search-runtime.ts';
import { RetrievalRepository } from '../retrieval/repository.ts';
import { RetrievalService } from '../retrieval/service.ts';
import { ContextPreviewService } from '../context-preview/service.ts';
import { QuickMemoStore } from './quick-memo.ts';
import { SettingsStore } from './settings.ts';
import { CollectionStore } from './collections.ts';
import { LMStudioProvider } from './provider.ts';
import { GenerationService } from './generation.ts';
import { LMStudioConnectionRuntime } from './model-connection.ts';
import { createBackendShutdown, stopWorker } from './shutdown.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
let shutdownRequested = false;
let stop: (() => Promise<void>) | undefined;
let openedDatabase: ReturnType<typeof openDatabase> | undefined;
const requestStop = () => { shutdownRequested = true; void stop?.(); };
process.on('message', message => { if (message && typeof message === 'object' && 'type' in message && message.type === 'shutdown') requestStop(); });
process.once('disconnect', requestStop);
process.once('SIGINT', requestStop); process.once('SIGTERM', requestStop);
try {
  const dbPath = resolve(process.env.ATTCHAT_DB ?? resolve(root, 'data/attchat.sqlite'));
  const quickMemoPath = resolve(process.env.ATTCHAT_QUICK_MEMO ?? resolve(root, 'data/quick-memo.md'));
  const settings = new SettingsStore(resolve(process.env.ATTCHAT_SETTINGS ?? resolve(root, 'data/settings.json')));
  const loadedSettings = await settings.load();
  for (const warning of loadedSettings.warnings) console.warn(warning);
  const port = Number(process.env.ATTCHAT_PORT ?? 5181);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid ATTCHAT_PORT');
  const db = openDatabase(dbPath);
  openedDatabase = db;
  const repo = new Repository(db);
  const collections = new CollectionStore(resolve(process.env.ATTCHAT_COLLECTIONS ?? resolve(root, 'data/collections.json')), () => repo.listConversations().map(c => c.conversation_id));
  for (const warning of (await collections.load()).warnings) console.warn(warning);
  const retrieval=new RetrievalService(new RetrievalRepository(db));
  const generation = new GenerationService(repo, new LMStudioProvider(loadedSettings.settings.model.lm_studio_base_url));
  const connection = new LMStudioConnectionRuntime(generation, settings);
  const quickMemo = new QuickMemoStore(quickMemoPath);
  const server = createAppServer(repo, resolve(process.env.ATTCHAT_FRONTEND ?? resolve(root, 'dist')), generation, createSemanticSearch(db,repo), retrieval, new ContextPreviewService(db,retrieval), quickMemo, connection, settings, collections);
  let semanticWorker: ReturnType<typeof launchSemanticWorker>;
  let startupFailed = false;
  stop = createBackendShutdown({
    drain: () => {
      const requests = server.drainRequests();
      const closed = new Promise<void>((resolveClosed, reject) => server.close(error => {
        if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') reject(error); else resolveClosed();
      }));
      return Promise.all([requests, closed]);
    },
    stores: [settings, collections, quickMemo],
    closeDatabase: () => { repo.recoverInterrupted(); db.close(); openedDatabase = undefined; },
    stopWorker: () => stopWorker(semanticWorker),
    exit: code => process.exit(startupFailed ? 1 : code),
  });
  server.once('error', () => { console.error('BACKEND_STARTUP_FAILURE'); startupFailed = true; requestStop(); });
  if (shutdownRequested) requestStop();
  else server.listen(port, '127.0.0.1', () => {
    if (shutdownRequested) return;
    try { repo.recoverInterrupted(); }
    catch { console.error('BACKEND_RECOVERY_FAILURE'); startupFailed = true; requestStop(); return; }
    const actual = (server.address() as { port: number }).port;
    console.log(`Att-Chat Phase 3B-2 http://127.0.0.1:${actual} DB=${dbPath}`);
    if (process.connected) process.send?.({ port: actual }, (error: Error | null) => { if (error) requestStop(); });
    semanticWorker=launchSemanticWorker(dbPath);
  });
} catch (error) {
  console.error('BACKEND_STARTUP_FAILURE:', error instanceof Error ? error.message : 'unknown');
  openedDatabase?.close();
  if (process.connected) process.disconnect();
  process.exitCode = 1;
}
