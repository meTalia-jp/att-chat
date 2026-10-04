import { createServer } from 'node:net';
import { resolve } from 'node:path';

export const electronSkeletonDefaults = Object.freeze({
  host: '127.0.0.1',
  frontendPort: 5186,
  backendPort: 5187,
  database: '.cache/electron-skeleton-v01.sqlite',
});

function parsePort(value, fallback, name) {
  const port = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${name} must be an integer from 1 to 65535`);
  return port;
}

export function createElectronRuntime(root, env = process.env) {
  const frontendPort = parsePort(env.ATTCHAT_ELECTRON_FRONTEND_PORT, electronSkeletonDefaults.frontendPort, 'ATTCHAT_ELECTRON_FRONTEND_PORT');
  const backendPort = parsePort(env.ATTCHAT_ELECTRON_BACKEND_PORT, electronSkeletonDefaults.backendPort, 'ATTCHAT_ELECTRON_BACKEND_PORT');
  if (frontendPort === backendPort) throw new Error('Electron frontend and backend ports must differ');
  const databasePath = resolve(root, env.ATTCHAT_ELECTRON_DB ?? electronSkeletonDefaults.database);
  return {
    root,
    host: electronSkeletonDefaults.host,
    frontendPort,
    backendPort,
    databasePath,
    frontendUrl: `http://${electronSkeletonDefaults.host}:${frontendPort}/`,
    backendUrl: `http://${electronSkeletonDefaults.host}:${backendPort}`,
  };
}

export function assertPortAvailable(port, host = electronSkeletonDefaults.host) {
  return new Promise((resolvePromise, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once('error', error => reject(new Error(`Port ${port} is already in use; Electron Skeleton did not attach to an unknown process.`, { cause: error })));
    probe.listen({ port, host, exclusive: true }, () => probe.close(error => error ? reject(error) : resolvePromise()));
  });
}

export async function waitForHttp(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const intervalMs = options.intervalMs ?? 100;
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(Math.min(1_000, timeoutMs)) });
      if (response.ok) return;
      lastError = new Error(`${url} returned HTTP ${response.status}`);
    } catch (error) { lastError = error; }
    await new Promise(resolvePromise => setTimeout(resolvePromise, intervalMs));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}
