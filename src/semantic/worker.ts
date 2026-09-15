import { openDatabase } from '../server/storage/database.ts';
import { SemanticIndexRepository } from './index-repository.ts';
import { BackgroundIndexer } from './indexer.ts';
import { BuiltinEmbeddingProvider, spec } from './builtin-provider.ts';

// Dedicated process: errors and native runtime failures cannot change chat Turn/Run outcomes.
async function main() {
  const modelDir=process.env.ATTCHAT_EMBEDDING_MODEL_DIR;
  const dbPath=process.env.ATTCHAT_DB;
  if (!modelDir || !dbPath || dbPath===':memory:') throw new Error('SEMANTIC_CONFIG_REQUIRED');
  const db=openDatabase(dbPath);
  let provider: BuiltinEmbeddingProvider | undefined;
  try {
    const repo=new SemanticIndexRepository(db), space=repo.registerSpace(spec);
    const command=process.argv[2]??'run';
    if (command==='stats') { console.log(JSON.stringify({space_id:space,...repo.counts(space)})); return; }
    if (command==='rebuild') { console.log(JSON.stringify({space_id:space,pending:repo.rebuild(space)})); return; }
    if (command!=='run' && command!=='once') throw new Error('INVALID_COMMAND');
    provider=await BuiltinEmbeddingProvider.load(modelDir);
    const indexer=new BackgroundIndexer(repo,provider,spec);
    let stop=false;
    const stopWorker=() => { stop=true; indexer.cancel(); };
    process.once('SIGINT',stopWorker); process.once('SIGTERM',stopWorker);
    process.once('disconnect',stopWorker);
    do {
      try { const worked=await indexer.tick(); if (command==='once' && !worked) break; }
      catch { console.error('SEMANTIC_INDEX_TICK_FAILED'); if (command==='once') throw new Error('SEMANTIC_INDEX_FAILED'); }
      if (command!=='once') await new Promise(resolve=>setTimeout(resolve,1000));
    } while (!stop);
    if (command==='once') console.log(JSON.stringify({space_id:space,...repo.counts(space)}));
  } finally { await provider?.dispose(); db.close(); }
}
main().catch(() => { console.error('SEMANTIC_INDEX_UNAVAILABLE'); process.exitCode=1; });
