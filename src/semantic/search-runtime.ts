import type { DatabaseSync } from 'node:sqlite';
import type { EmbeddingProvider } from './contracts.ts';
import { SemanticSearchService, SearchError } from './search.ts';
import { SemanticIndexRepository } from './index-repository.ts';
import type { Repository } from '../server/storage/repository.ts';

export function createSemanticSearch(db:DatabaseSync,chat:Repository) {
  let loaded:Promise<EmbeddingProvider>|undefined;
  return new SemanticSearchService(new SemanticIndexRepository(db),chat,async()=>{
    const dir=process.env.ATTCHAT_EMBEDDING_MODEL_DIR;
    if(!dir)throw new SearchError('意味検索は未設定です。モデルディレクトリを設定して再起動してください');
    const {BuiltinEmbeddingProvider,spec}=await import('./builtin-provider.ts');
    loaded??=BuiltinEmbeddingProvider.load(dir).catch(()=>{loaded=undefined;throw new SearchError('検索モデルをロードできません');});
    return {provider:await loaded,spec};
  });
}
