import { app, BrowserWindow, dialog } from 'electron';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPortAvailable, createElectronRuntime, waitForHttp } from './runtime.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtime = createElectronRuntime(root);
const children = new Set();
let stopping = false;

function startChild(label, command, args, env) {
  const child = spawn(command, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  child.stdout.on('data', chunk => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on('data', chunk => process.stderr.write(`[${label}] ${chunk}`));
  child.once('exit', (code, signal) => {
    children.delete(child);
    if (!stopping && code !== 0) void fail(`${label} stopped before Electron shutdown (code=${code}, signal=${signal ?? 'none'}).`);
  });
  return child;
}

function stopChildren() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  children.clear();
}

async function fail(message) {
  stopChildren();
  console.error(message);
  if (app.isReady()) await dialog.showMessageBox({ type: 'error', title: 'Att-Chat Electron Skeleton', message });
  app.exit(1);
}

async function start() {
  await mkdir(dirname(runtime.databasePath), { recursive: true });
  await assertPortAvailable(runtime.backendPort, runtime.host);
  await assertPortAvailable(runtime.frontendPort, runtime.host);

  const node = process.env.ATTCHAT_NODE ?? process.env.npm_node_execpath ?? 'node';
  startChild('backend', node, ['--experimental-strip-types', 'src/server/main.ts'], {
    ...process.env,
    ATTCHAT_DB: runtime.databasePath,
    ATTCHAT_PORT: String(runtime.backendPort),
  });
  await waitForHttp(`${runtime.backendUrl}/api/conversations`);

  startChild('vite', node, ['node_modules/vite/bin/vite.js', '--config', 'vite.electron.config.mjs'], {
    ...process.env,
    ATTCHAT_ELECTRON_FRONTEND_PORT: String(runtime.frontendPort),
    ATTCHAT_ELECTRON_BACKEND_PORT: String(runtime.backendPort),
  });
  await waitForHttp(runtime.frontendUrl);

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
  window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(runtime.frontendUrl)) event.preventDefault(); });
  await window.loadURL(runtime.frontendUrl);
}

app.on('before-quit', stopChildren);
app.on('window-all-closed', () => app.quit());
app.whenReady().then(start).catch(error => void fail(error instanceof Error ? error.message : String(error)));
