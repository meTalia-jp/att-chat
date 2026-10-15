import { app, BrowserWindow, dialog } from 'electron';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChildLifecycle } from './lifecycle.mjs';
import { assertPortAvailable, createElectronRuntime, waitForHttp } from './runtime.mjs';
import { startSingleInstance } from './single-instance.mjs';
import { startDistributionBackend } from './distribution.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let shutdownPromise = null;
let allowQuit = false;
let failureMessage;

const lifecycle = createChildLifecycle({
  onUnexpectedExit: ({ label, code, signal }) => fail(`${label} stopped before Electron shutdown (code=${code}, signal=${signal ?? 'none'}).`),
  onError: ({ label, error }) => fail(`Spawn/child error: ${label} (${error.code ?? 'unknown'}).`),
});

function startChild(label, command, args, env, options = {}) {
  if (lifecycle.stopping) throw new Error('Startup cancelled by shutdown');
  const child = spawn(command, args, { cwd: options.cwd ?? root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', ...(options.ipc ? ['ipc'] : [])] });
  lifecycle.register(label, child);
  if (child.pid) console.info(`CHILD_STARTED ${label} pid=${child.pid}`);
  child.stdout.on('data', chunk => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on('data', chunk => process.stderr.write(`[${label}] ${chunk}`));
  return child;
}

function shutdown({ reason, exitCode = 0, message } = {}) {
  if (message) failureMessage ??= message;
  if (shutdownPromise) return shutdownPromise;
  lifecycle.beginStopping();
  shutdownPromise = Promise.resolve().then(async () => {
    try {
      for (const window of BrowserWindow.getAllWindows()) {
        if (failureMessage) window.destroy(); else window.setEnabled(false);
      }
      const result = await lifecycle.stop(reason);
      if (result.forced.length || result.failed.length) failureMessage ??= 'Backend shutdown failed or timed out. Check console logs before restarting.';
      if (failureMessage) {
        await app.whenReady();
        await dialog.showMessageBox({ type: 'error', title: 'Att-Chat', message: failureMessage });
      }
    } catch {
      failureMessage ??= 'Electron cleanup failed';
      console.error('ELECTRON_CLEANUP_FAILURE');
      await lifecycle.stop(reason).catch(() => {});
    }
    allowQuit = true;
    if (exitCode === 0 && !failureMessage) app.quit();
    else app.exit(exitCode || 1);
  });
  return shutdownPromise;
}

function fail(message) {
  console.error('ELECTRON_FAILURE:', message);
  return shutdown({ reason: 'child-failure', exitCode: 1, message });
}

async function start(setWindow) {
  app.on('before-quit', event => {
    if (allowQuit) return;
    event.preventDefault();
    void shutdown({ reason: 'electron-quit' });
  });
  app.on('window-all-closed', () => app.quit());
  process.once('SIGINT', () => { void shutdown({ reason: 'SIGINT' }); });
  process.once('SIGTERM', () => { void shutdown({ reason: 'SIGTERM' }); });
  const runtime = createElectronRuntime(root, app.isPackaged ? {} : process.env, {
    distributionDataDirectory: app.isPackaged ? resolve(app.getPath('userData'), 'data') : undefined,
  });
  await mkdir(dirname(runtime.databasePath), { recursive: true });
  let windowUrl;
  if (app.isPackaged) {
    windowUrl = await startDistributionBackend(process.resourcesPath, runtime, startChild);
  } else {
    await assertPortAvailable(runtime.backendPort, runtime.host);
    await assertPortAvailable(runtime.frontendPort, runtime.host);

    const node = process.env.ATTCHAT_NODE ?? process.env.npm_node_execpath ?? 'node';
    startChild('backend', node, ['--experimental-strip-types', 'src/server/main.ts'], {
      ...process.env,
      ATTCHAT_DB: runtime.databasePath,
      ATTCHAT_SETTINGS: runtime.settingsPath,
      ATTCHAT_COLLECTIONS: runtime.collectionsPath,
      ATTCHAT_QUICK_MEMO: runtime.quickMemoPath,
      ATTCHAT_PORT: String(runtime.backendPort),
    }, { ipc: true });
    await waitForHttp(`${runtime.backendUrl}/api/conversations`);

    startChild('vite', node, ['node_modules/vite/bin/vite.js', '--config', 'vite.electron.config.mjs'], {
      ...process.env,
      ATTCHAT_ELECTRON_FRONTEND_PORT: String(runtime.frontendPort),
      ATTCHAT_ELECTRON_BACKEND_PORT: String(runtime.backendPort),
    });
    await waitForHttp(runtime.frontendUrl);
    windowUrl = runtime.frontendUrl;
  }

  if (lifecycle.stopping) return;
  const window = new BrowserWindow({
    title: 'Att-Chat — Electron Skeleton v0.1',
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 680,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== new URL(windowUrl).origin) event.preventDefault(); });
  await window.loadURL(windowUrl);
  setWindow(window);
}

try {
  startSingleInstance(app, start, error => { if (!lifecycle.stopping) void fail(error instanceof Error ? error.message : String(error)); });
} catch (error) { void fail(error instanceof Error ? error.message : String(error)); }
