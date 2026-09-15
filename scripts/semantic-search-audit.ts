import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve,basename,join } from 'node:path';
import { openDatabase } from '../src/server/storage/database.ts';
import { Repository } from '../src/server/storage/repository.ts';
import { BuiltinEmbeddingProvider,spec } from '../src/semantic/builtin-provider.ts';
import { SemanticIndexRepository } from '../src/semantic/index-repository.ts';
import { BackgroundIndexer } from '../src/semantic/indexer.ts';
import { SemanticSearchService } from '../src/semantic/search.ts';

// Read-only backup of source DBs; migration and index writes are confined to new copies.
const [modelDir,outDir,...sources]=process.argv.slice(2);
if(!modelDir || !outDir || !sources.length)throw new Error('modelDir outputDir sourceDB...');
mkdirSync(outDir,{recursive:true});
const provider=await BuiltinEmbeddingProvider.load(modelDir),output=[];
try{
  for(const sourcePath of sources){
    const dest=resolve(outDir,basename(sourcePath));if(existsSync(dest))throw new Error('Destination already exists');
    const source=new DatabaseSync(resolve(sourcePath),{readOnly:true});try{await backup(source,dest);}finally{source.close();}
    const db=openDatabase(dest);
    try{
      const chat=new Repository(db),repo=new SemanticIndexRepository(db),worker=new BackgroundIndexer(repo,provider,spec);
      while(await worker.tick()){}
      const search=new SemanticSearchService(repo,chat,async()=>({provider,spec})),comparisons=[];
      for(const conversation of chat.listConversations()){
        const highlight=chat.listHighlights(conversation.conversation_id).find(h=>h.status==='resolved');if(!highlight)continue;
        for(const variant of ['Q1','Q2'] as const){
          const response=await search.search(conversation.conversation_id,highlight.highlight_id,{variant,scope:'all',top_k:5});
          comparisons.push({conversation_id:conversation.conversation_id,highlight_id:highlight.highlight_id,variant,timings:response.timings,ranking:response.results.map(r=>({turn_id:r.turn_id,score:r.score,conversation_id:r.conversation_id}))});
        }
      }
      output.push({source:resolve(sourcePath),copy:dest,space_id:worker.spaceId,coverage:repo.counts(worker.spaceId),comparisons});
    }finally{db.close();}
  }
}finally{await provider.dispose();}
writeFileSync(join(outDir,'measurements.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
