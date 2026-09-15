import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Called after server startup. Optional indexing is isolated from the chat error boundary. */
export function launchSemanticWorker(dbPath: string): ChildProcess | undefined {
  if (!process.env.ATTCHAT_EMBEDDING_MODEL_DIR || dbPath===':memory:') return;
  try {
    const child=spawn(process.execPath,['--experimental-strip-types',fileURLToPath(new URL('./worker.ts',import.meta.url))],{
      windowsHide:true,
      env:{...process.env,ATTCHAT_DB:dbPath}, stdio:['ignore','ignore','inherit','ipc'],
    });
    child.on('error',()=>console.error('SEMANTIC_WORKER_START_FAILED'));
    child.on('exit',code=>{ if (code) console.error('SEMANTIC_WORKER_STOPPED'); });
    return child;
  } catch { console.error('SEMANTIC_WORKER_START_FAILED'); return; }
}
