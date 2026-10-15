import type { ChildProcess } from 'node:child_process';

export async function stopWorker(child: ChildProcess | undefined, timeoutMs = 500): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
  if (child.connected) {
    try { child.send({type:'shutdown'}, () => {}); } catch { /* force fallback below */ }
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wait = () => Promise.race([exited.then(()=>true),new Promise<false>(resolve=>{timer=setTimeout(()=>resolve(false),timeoutMs);})]).finally(()=>clearTimeout(timer));
  if (await wait()) return;
  console.error('SEMANTIC_SHUTDOWN_TIMEOUT');
  child.kill('SIGKILL');
  if (!await wait()) throw new Error('Semantic worker exit unconfirmed');
}

type ShutdownOptions = {
  drain: () => Promise<unknown>;
  stores: { flush(): Promise<void> }[];
  closeDatabase: () => void;
  stopWorker: () => Promise<void>;
  exit: (code: number) => void;
  log?: (event: string) => void;
  timeoutMs?: number;
};

export function createBackendShutdown(options: ShutdownOptions) {
  let pending: Promise<void> | undefined;
  return function shutdown() {
    if (pending) return pending;
    const log = options.log ?? console.info;
    pending = Promise.resolve().then(async () => {
      let timedOut = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const work = async () => {
        let failed = false;
        try {
          await options.drain();
          const saves = await Promise.allSettled(options.stores.map(store=>store.flush()));
          failed = saves.some(result=>result.status==='rejected');
          if (failed) log('BACKEND_SHUTDOWN_SAVE_FAILED');
          if (!timedOut) { options.closeDatabase(); log('BACKEND_DB_CLOSED'); }
        } catch { failed = true; log('BACKEND_SHUTDOWN_FAILED'); }
        await options.stopWorker().catch(()=>{failed=true;log('BACKEND_WORKER_STOP_FAILED');});
        return failed ? 1 : 0;
      };
      const code = await Promise.race([
        work(),
        new Promise<number>(resolve=>{timer=setTimeout(()=>{timedOut=true;log('BACKEND_SHUTDOWN_TIMEOUT');resolve(1);},options.timeoutMs ?? 4_000);}),
      ]);
      clearTimeout(timer);
      if (timedOut) await options.stopWorker().catch(()=>log('BACKEND_WORKER_STOP_FAILED'));
      log(code===0?'BACKEND_SHUTDOWN_SUCCESS':'BACKEND_SHUTDOWN_ERROR');
      options.exit(code);
    });
    return pending;
  };
}
