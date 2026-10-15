import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const lifecycleModule = pathToFileURL(resolve('electron/lifecycle.mjs')).href;

class FakeChild extends EventEmitter {
  pid: number | undefined = 123;
  connected = true;
  messages: unknown[] = [];
  signals: string[] = [];
  exitOnTerm = false;
  send(message: unknown, callback: (error?:Error)=>void) {
    this.messages.push(message); callback();
    if (this.exitOnTerm) queueMicrotask(()=>this.emit('exit',0,null));
  }

  kill(signal = 'SIGTERM') {
    this.signals.push(signal);
    if (signal === 'SIGTERM' && this.exitOnTerm) queueMicrotask(() => this.emit('exit', 0, signal));
    if (signal === 'SIGKILL') queueMicrotask(() => this.emit('exit', null, signal));
    return true;
  }
}

function nextImmediate() {
  return new Promise<void>(resolvePromise => setImmediate(resolvePromise));
}

test('window close, Ctrl+C and Electron quit share one graceful cleanup', async () => {
  const { createChildLifecycle } = await import(lifecycleModule);
  const lifecycle = createChildLifecycle({ timeoutMs: 100 });
  const backend = new FakeChild();
  const vite = new FakeChild();
  backend.exitOnTerm = true;
  vite.exitOnTerm = true;
  lifecycle.register('backend', backend);
  lifecycle.register('vite', vite);

  const windowClose = lifecycle.stop('window-close');
  const ctrlC = lifecycle.stop('SIGINT');
  const electronQuit = lifecycle.stop('electron-quit');
  assert.strictEqual(windowClose, ctrlC);
  assert.strictEqual(ctrlC, electronQuit);
  assert.deepEqual(await windowClose, { reason: 'window-close', forced: [], failed: [] });
  assert.deepEqual(backend.signals, []);
  assert.deepEqual(backend.messages, [{type:'shutdown'}]);
  assert.deepEqual(vite.signals, ['SIGTERM']);
  assert.equal(lifecycle.activeCount, 0);
});

test('normal shutdown suppresses child-exit errors while unexpected exits remain visible', async () => {
  const { createChildLifecycle } = await import(lifecycleModule);
  for (const label of ['backend', 'vite']) for (const code of [0,1]) {
    const unexpected: unknown[] = [];
    const lifecycle = createChildLifecycle({ timeoutMs: 100, onUnexpectedExit: (event: unknown) => unexpected.push(event) });
    const child = new FakeChild();
    lifecycle.register(label, child);
    child.emit('exit', code, null);
    await nextImmediate();
    assert.deepEqual(unexpected, [{ label, code, signal: null }]);
  }

  const stoppingEvents: unknown[] = [];
  const stoppingLifecycle = createChildLifecycle({ timeoutMs: 100, onUnexpectedExit: (event: unknown) => stoppingEvents.push(event) });
  const vite = new FakeChild();
  vite.exitOnTerm = true;
  stoppingLifecycle.register('vite', vite);
  await stoppingLifecycle.stop('electron-quit');
  await nextImmediate();
  assert.deepEqual(stoppingEvents, []);
});

test('cleanup timeout force-kills only children that are still running', async () => {
  const { createChildLifecycle } = await import(lifecycleModule);
  const lifecycle = createChildLifecycle({ timeoutMs: 10 });
  const backend = new FakeChild();
  const vite = new FakeChild();
  backend.exitOnTerm = true;
  lifecycle.register('backend', backend);
  lifecycle.register('vite', vite);

  assert.deepEqual(await lifecycle.stop('electron-quit'), { reason: 'electron-quit', forced: ['vite'], failed: [] });
  assert.deepEqual(backend.signals, []);
  assert.deepEqual(vite.signals, ['SIGTERM', 'SIGKILL']);
});

test('backend IPC timeout forces only after grace period and awaits actual exit', async()=>{
  const {createChildLifecycle}=await import(lifecycleModule);
  const child=new FakeChild(),events:string[]=[];
  const lifecycle=createChildLifecycle({timeoutMs:20,log:(event:string)=>events.push(event)});
  lifecycle.register('backend',child);
  const stopped=lifecycle.stop();
  await nextImmediate();assert.deepEqual(child.signals,[]);
  const result=await stopped;
  assert.deepEqual(result.forced,['backend']);assert.deepEqual(result.failed,['backend']);
  assert.deepEqual(child.signals,['SIGKILL']);assert.equal(lifecycle.activeCount,0);
  assert.ok(events.includes('SHUTDOWN_TIMEOUT backend'));
});

test('spawn error is handled without exit event and stopping backend failure remains an error result',async()=>{
  const {createChildLifecycle}=await import(lifecycleModule);
  const errors:unknown[]=[];
  const lifecycle=createChildLifecycle({onError:(event:unknown)=>errors.push(event)});
  const child=new FakeChild();child.pid=undefined;
  lifecycle.register('backend',child);
  child.emit('error',Object.assign(new Error('spawn failed'),{code:'ENOENT'}));
  assert.equal(errors.length,1);assert.equal(lifecycle.activeCount,0);await lifecycle.stop();
  const failure=createChildLifecycle();const backend=new FakeChild();failure.register('backend',backend);
  const stopping=failure.stop();await nextImmediate();backend.emit('exit',1,null);
  assert.deepEqual((await stopping).failed,['backend']);
  const early=createChildLifecycle();const closing=new FakeChild();early.register('backend',closing);
  early.beginStopping();closing.emit('exit',1,null);
  assert.deepEqual((await early.stop()).failed,['backend']);
});

test('Electron main routes app quit and process signals through lifecycle cleanup', () => {
  const source = readFileSync('electron/main.mjs', 'utf8');
  assert.match(source, /app\.on\('before-quit'/);
  assert.match(source, /app\.on\('window-all-closed'/);
  assert.match(source, /process\.once\('SIGINT'/);
  assert.match(source, /process\.once\('SIGTERM'/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /lifecycle\.beginStopping\(\)/);
});
