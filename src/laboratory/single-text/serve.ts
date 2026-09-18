import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { RunFiles } from './run-files.ts';
import { SingleTextService } from './service.ts';
import { createSingleTextServer } from './server.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
let files: RunFiles | undefined;
try {
  const port = Number(process.env.LAB_SINGLE_PORT ?? 5194);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid LAB_SINGLE_PORT');
  files = new RunFiles(resolve(process.env.LAB_SINGLE_RUNS ?? resolve(root, 'data/laboratory/single-text-runs')));
  const service = new SingleTextService(files);
  const server = createSingleTextServer(service, resolve(root, 'dist'));
  let closing = false;
  const stop = async () => {
    if (closing) return; closing = true;
    await service.shutdown();
    server.closeAllConnections(); server.close(() => files!.close());
  };
  server.once('error', () => { console.error('Single Text Generation server could not start'); files!.close(); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Single Text Generation http://127.0.0.1:${port}`));
  process.once('SIGINT', () => void stop()); process.once('SIGTERM', () => void stop());
} catch { files?.close(); console.error('Single Text Generation startup failed; check Run directory and configuration'); process.exitCode = 1; }
