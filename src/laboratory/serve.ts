import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { startLaboratory } from './server.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
try {
  const port = Number(process.env.LAB_PORT ?? 5195);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid LAB_PORT');
  const lab = await startLaboratory({
    port, dataDirectory:resolve(process.env.LAB_DATA ?? resolve(root, 'data/laboratory')),
    distPath:resolve(root, 'dist'),
  });
  console.log(`Laboratory http://127.0.0.1:${lab.port}`);
  process.once('SIGINT', () => void lab.shutdown());
  process.once('SIGTERM', () => void lab.shutdown());
} catch { console.error('Laboratory startup failed; check port and dedicated data directory'); process.exitCode = 1; }
