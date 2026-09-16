import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { RetrievalRepository } from '../src/retrieval/repository.ts';
import { RetrievalService } from '../src/retrieval/service.ts';

const paths=process.argv.slice(2);if(!paths.length)throw new Error('DB path required');
const output=[];
for(const path of paths){
  const db=new DatabaseSync(resolve(path),{readOnly:true});
  try{
    const service=new RetrievalService(new RetrievalRepository(db));
    const anchors=db.prepare("SELECT turn_id FROM turns WHERE status='completed' ORDER BY conversation_id,sequence_no LIMIT 20").all() as Array<{turn_id:string}>;
    if(!anchors.length){output.push({db:resolve(path),anchors:0});continue;}
    const measure=(action:(id:string)=>unknown)=>{const start=performance.now();for(let repeat=0;repeat<100;repeat++)for(const anchor of anchors)action(anchor.turn_id);return (performance.now()-start)/(100*anchors.length);};
    output.push({db:resolve(path),anchors:anchors.length,get_turn_ms:measure(id=>service.getTurn(id)),context_1_ms:measure(id=>service.getTurnContext(id,1,1)),context_3_ms:measure(id=>service.getTurnContext(id,3,3)),context_10_ms:measure(id=>service.getTurnContext(id,10,10))});
  }finally{db.close();}
}
console.log(JSON.stringify(output,null,2));
