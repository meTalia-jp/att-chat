import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openDatabase } from './storage/database.ts';
import { Repository } from './storage/repository.ts';
import { createAppServer } from './http.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
try {
  const dbPath = resolve(process.env.ATTCHAT_DB ?? resolve(root, 'data/attchat.sqlite'));
  const port = Number(process.env.ATTCHAT_PORT ?? 5181);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid ATTCHAT_PORT');
  const db = openDatabase(dbPath);
  const repo = new Repository(db);
  const server = createAppServer(repo, resolve(root, 'dist'));
  server.once('error', error => { console.error('起動失敗:', error.message); db.close(); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => {
    try { repo.recoverInterrupted(); }
    catch (error) { console.error('中断Runを整理できないため起動を停止します:', error); server.close(() => db.close()); process.exitCode = 1; return; }
    const actual = (server.address() as { port: number }).port;
    console.log(`Att-Chat Phase 2A http://127.0.0.1:${actual} DB=${dbPath}`);
    process.send?.({ port: actual });
  });
  let closing = false;
  const stop = () => { if (closing) return; closing = true; repo.recoverInterrupted(); server.closeAllConnections(); server.close(() => { db.close(); process.exit(0); }); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
} catch (error) { console.error('DBを開けないため起動しません:', error instanceof Error ? error.message : error); process.exitCode = 1; }
