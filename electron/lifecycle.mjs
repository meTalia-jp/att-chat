const defaultTimeoutMs = 5_000;

export function createChildLifecycle(options = {}) {
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const onUnexpectedExit = options.onUnexpectedExit ?? (() => {});
  const onError = options.onError ?? (() => {});
  const log = options.log ?? console.info;
  const children = new Map();
  const stoppedFailures = new Set();
  let stopping = false;
  let cleanupPromise = null;

  function register(label, child) {
    let resolveExit;
    const exitPromise = new Promise(resolve => { resolveExit = resolve; });
    const record = { label, child, exited: false, exitPromise, error: false, result: null };
    children.set(child, record);
    const finish = (code, signal) => {
      if (record.exited) return;
      record.exited = true;
      record.result = { code, signal };
      if (stopping && label === 'backend' && (code !== 0 || signal)) stoppedFailures.add(label);
      children.delete(child);
      resolveExit();
    };
    child.on('error', error => {
      record.error = true;
      if (stopping) stoppedFailures.add(label);
      log(`CHILD_ERROR ${label} ${error.code ?? 'unknown'}`);
      if (!child.pid) finish(null, null);
      if (!stopping) onError({ label, error });
    });
    child.once('exit', (code, signal) => {
      finish(code, signal);
      if (!stopping) {
        log(`CHILD_UNEXPECTED_EXIT ${label} code=${code} signal=${signal ?? 'none'}`);
        onUnexpectedExit({ label, code, signal });
      }
    });
    return child;
  }

  function beginStopping() {
    stopping = true;
  }

  function stop(reason = 'electron-quit') {
    if (cleanupPromise) return cleanupPromise;
    stopping = true;
    cleanupPromise = Promise.resolve().then(async () => {
      const active = [...children.values()].filter(record => !record.exited);
      for (const record of active) {
        try {
          if (record.label === 'backend') {
            if (record.child.connected) record.child.send({type:'shutdown'}, error => {
              if (error) { record.error = true; log('BACKEND_SHUTDOWN_SEND_FAILED'); }
            });
          } else record.child.kill('SIGTERM');
        } catch { record.error = true; log(`CHILD_STOP_REQUEST_FAILED ${record.label}`); }
      }
      const wait = async (records, ms) => {
        let timer;
        const complete = await Promise.race([
          Promise.all(records.map(record=>record.exitPromise)).then(()=>true),
          new Promise(resolve=>{timer=setTimeout(()=>resolve(false),ms);}),
        ]);
        clearTimeout(timer); return complete;
      };
      const forced = [];
      if (!await wait(active, timeoutMs)) {
        for (const record of active.filter(record=>!record.exited)) {
          forced.push(record.label); log(`SHUTDOWN_TIMEOUT ${record.label}`);
          try { record.child.kill('SIGKILL'); } catch { record.error = true; }
        }
        await wait(active.filter(record=>!record.exited), options.forceWaitMs ?? 2_000);
      }
      const failed = [...new Set([...stoppedFailures, ...active.filter(record=>record.error || !record.exited || (record.label==='backend' && (record.result?.code!==0 || record.result?.signal))).map(record=>record.label)])];
      log(forced.length || failed.length ? 'CHILD_SHUTDOWN_ERROR' : 'CHILD_SHUTDOWN_SUCCESS');
      return { reason, forced, failed };
    });
    return cleanupPromise;
  }

  return {
    register,
    beginStopping,
    stop,
    get stopping() { return stopping; },
    get activeCount() { return children.size; },
  };
}
