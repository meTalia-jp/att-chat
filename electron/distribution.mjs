import { resolve } from 'node:path';
import { waitForHttp } from './runtime.mjs';

export function distributionResources(resourcesPath) {
  return {
    node: resolve(resourcesPath, 'node/node.exe'),
    backend: resolve(resourcesPath, 'backend/server/main.js'),
    frontend: resolve(resourcesPath, 'frontend'),
    migrations: resolve(resourcesPath, 'migrations'),
    cwd: resolve(resourcesPath),
  };
}

// Register listeners immediately after spawn; the existing backend IPC reports its actual port.
export function waitForBackendPort(child, timeoutMs = 20_000) {
  return new Promise((resolvePort, reject) => {
    const done = (error, port) => {
      clearTimeout(timer);
      child.off('message', message); child.off('error', failed); child.off('exit', exited);
      if (error) reject(error); else resolvePort(port);
    };
    const message = value => {
      if (Number.isInteger(value?.port) && value.port > 0 && value.port <= 65535) done(null, value.port);
    };
    const failed = error => done(error);
    const exited = code => done(new Error(`Distribution backend exited before ready (${code})`));
    const timer = setTimeout(() => done(new Error('Distribution backend readiness timed out')), timeoutMs);
    child.on('message', message); child.once('error', failed); child.once('exit', exited);
  });
}

export async function startDistributionBackend(resourcesPath, storage, startChild, env = process.env) {
  const assets = distributionResources(resourcesPath);
  const backendEnv = {
    ...env,
    ATTCHAT_DB: storage.databasePath,
    ATTCHAT_SETTINGS: storage.settingsPath,
    ATTCHAT_COLLECTIONS: storage.collectionsPath,
    ATTCHAT_QUICK_MEMO: storage.quickMemoPath,
    ATTCHAT_FRONTEND: assets.frontend,
    ATTCHAT_MIGRATIONS: assets.migrations,
    ATTCHAT_PORT: '0',
  };
  // This staging flavor does not ship optional semantic models/native dependencies.
  delete backendEnv.ATTCHAT_EMBEDDING_MODEL_DIR;
  delete backendEnv.NODE_OPTIONS;
  delete backendEnv.NODE_PATH;
  const child = startChild('backend', assets.node, [assets.backend], backendEnv, { cwd: assets.cwd, ipc: true });
  const port = await waitForBackendPort(child);
  const url = `http://127.0.0.1:${port}/`;
  await waitForHttp(`${url}api/conversations`);
  await waitForHttp(url);
  return url;
}
