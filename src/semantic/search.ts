import type { EmbeddingProvider, EmbeddingSpaceSpec } from './contracts.ts';
import { identifySpace } from './space.ts';
import { validateEmbedding } from './validation.ts';
import { SemanticIndexRepository } from './index-repository.ts';
import { Repository, InputError } from '../server/storage/repository.ts';
import { buildSearchQuery } from './search-query.ts';
import type { SearchOptions, SearchResponse, RelatedTurn } from '../shared/semantic-search.ts';

export class SearchError extends Error { readonly status=503; }
export function searchOptions(input:Record<string,unknown>):SearchOptions {
  const {variant='Q1',role='all',scope='current',top_k=5}=input;
  if(typeof variant!=='string' || !['Q1','Q2'].includes(variant) || typeof role!=='string' || !['all','user','assistant'].includes(role) || typeof scope!=='string' || !['current','all'].includes(scope) || !Number.isSafeInteger(top_k) || (top_k as number)<1 || (top_k as number)>10)throw new InputError('検索条件が不正です');
  return {variant,role,scope,top_k} as SearchOptions;
}
export function cosine(a:Float32Array,b:Float32Array) {
  if(a.length!==b.length)throw new Error('INVALID_VECTOR');
  let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}
  if(!aa || !bb || !Number.isFinite(dot+aa+bb))throw new Error('INVALID_VECTOR');
  return Math.max(-1,Math.min(1,dot/Math.sqrt(aa*bb)));
}
export class SemanticSearchService {
  private repo:SemanticIndexRepository;
  private chat:Repository;
  private active:()=>Promise<{provider:EmbeddingProvider;spec:EmbeddingSpaceSpec}>;
  private busy=false;
  constructor(repo:SemanticIndexRepository,chat:Repository,active:()=>Promise<{provider:EmbeddingProvider;spec:EmbeddingSpaceSpec}>) {this.repo=repo;this.chat=chat;this.active=active;}
  async search(conversationId:string,highlightId:string,input:Record<string,unknown>,signal?:AbortSignal):Promise<SearchResponse> {
    const options=searchOptions(input), started=performance.now();
    if(this.busy)throw new SearchError('別の意味検索を実行中です');
    const h=this.chat.getHighlight(conversationId,highlightId), turn=this.chat.getTurn(conversationId,h.turn_id);
    let query:string;try{query=buildSearchQuery(turn,h,options.variant);}catch(e){throw new InputError((e as Error).message,409);}
    this.busy=true;
    try {
      // Resolve once. No active-space re-read after an await.
      const active=await this.active(),spec=structuredClone(active.spec),space=identifySpace(spec);
      const info=await active.provider.getModelInfo();
      if(info.space_id!==space.space_id || info.fingerprint!==space.fingerprint || info.dimensions!==spec.dimensions || info.input_token_limit!==spec.input_token_limit)throw new SearchError('Providerとactive spaceが一致しません');
      if(!this.repo.db.prepare('SELECT 1 FROM embedding_spaces WHERE space_id=?').get(space.space_id))throw new SearchError('active spaceの索引が未作成です。Indexerを起動してください');
      const queryStart=performance.now();
      const embedded=validateEmbedding(await active.provider.embed(query,{purpose:'query',signal}),info);
      const queryEnd=performance.now();
      if(signal?.aborted)throw new SearchError('検索を中断しました');
      if(!embedded.ok)throw new SearchError(`検索queryをEmbeddingできません: ${embedded.error.code}`);
      const loadStart=performance.now();
      const {candidates,invalid}=this.repo.searchCandidates(space.space_id,options.scope==='current'?conversationId:null,options.role,h.turn_id);
      const loadEnd=performance.now();
      const results:RelatedTurn[]=candidates.map(row=>({conversation_id:row.conversation_id as string,conversation_title:row.conversation_title as string,turn_id:row.turn_id as string,sequence_no:Number(row.sequence_no),role:row.role as 'user'|'assistant',excerpt:Array.from(row.content as string).slice(0,240).join(''),score:cosine(embedded.vector,row.vector),space_id:space.space_id,source_hash:row.source_hash as string}));
      const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
      results.sort((a,b)=>b.score-a.score || cmp(a.conversation_id,b.conversation_id) || a.sequence_no-b.sequence_no || cmp(a.turn_id,b.turn_id));
      const rankEnd=performance.now();
      return {results:results.slice(0,options.top_k),options,space_id:space.space_id,query_text:query,coverage:this.repo.counts(space.space_id),timings:{ready_vector_count:candidates.length,vector_load_ms:loadEnd-loadStart,query_embedding_ms:queryEnd-queryStart,similarity_ms:rankEnd-loadEnd,total_ms:performance.now()-started,invalid_vectors:invalid}};
    } finally {this.busy=false;}
  }
}
