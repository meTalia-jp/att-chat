import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';

const runtimeModule = pathToFileURL(resolve('electron/runtime.mjs')).href;

test('Electron Skeleton uses isolated ports and database without changing browser scripts', async () => {
  const runtime = await import(runtimeModule);
  const config = runtime.createElectronRuntime(resolve('.'), {});
  assert.equal(config.frontendPort, 5186);
  assert.equal(config.backendPort, 5187);
  assert.match(config.databasePath.replaceAll('\\','/'), /\.cache\/electron-skeleton-v01\.sqlite$/);
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(packageJson.scripts.dev, 'vite --host 127.0.0.1 --port 5180 --strictPort');
  assert.equal(packageJson.scripts.server, 'node --experimental-strip-types src/server/main.ts');
  assert.equal(packageJson.scripts['electron:dev'], 'electron electron/main.mjs');
});

test('Electron Skeleton refuses an occupied port instead of attaching to it', async () => {
  const runtime = await import(runtimeModule);
  const occupied = createServer();
  occupied.listen(0, '127.0.0.1');
  await once(occupied, 'listening');
  const port = (occupied.address() as {port:number}).port;
  try { await assert.rejects(runtime.assertPortAvailable(port), /already in use/); }
  finally { await new Promise<void>((resolvePromise, reject) => occupied.close(error => error ? reject(error) : resolvePromise())); }
});

test('Electron main remains a thin localhost launcher with renderer isolation', () => {
  const source = readFileSync('electron/main.mjs', 'utf8');
  assert.match(source, /src\/server\/main\.ts/);
  assert.match(source, /contextIsolation: true/);
  assert.match(source, /nodeIntegration: false/);
  assert.match(source, /sandbox: true/);
  assert.doesNotMatch(source, /node:sqlite|GenerationService|Repository/);
});
