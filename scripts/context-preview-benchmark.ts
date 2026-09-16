import { DatabaseSync } from 'node:sqlite';
import { RetrievalRepository } from '../src/retrieval/repository.ts';
import { RetrievalService } from '../src/retrieval/service.ts';
import { ContextPreviewService } from '../src/context-preview/service.ts';
for(const path of process.argv.slice(2)){
 const db=new DatabaseSync(path,{readOnly:true});
 try{const retrieval=new RetrievalService(new RetrievalRepository(db)),service=new ContextPreviewService(db,retrieval);
 const highlights=db.prepare("SELECT h.highlight_id,h.turn_id,t.conversation_id FROM highlights h JOIN turns t ON h.turn_id=t.turn_id WHERE h.status='resolved' AND t.status='completed'").all() as {highlight_id:string;turn_id:string;conversation_id:string}[];
 const rows=[];
 for(const h of highlights)for(const strategy of ['A','A+B'])for(const count of [1,3]){
  let retrieval_ms=0;const original=retrieval.getTurnContext.bind(retrieval);retrieval.getTurnContext=(...args:Parameters<typeof original>)=>{const start=performance.now();try{return original(...args);}finally{retrieval_ms+=performance.now()-start;}};
  try{const start=performance.now();let r;for(let i=0;i<100;i++)r=service.build(h.conversation_id,h.highlight_id,{strategy,before_turns:count,after_turns:count});const total_ms=(performance.now()-start)/100;
  const assemblyStart=performance.now();for(let i=0;i<100;i++)r!.sections.map(s=>`[${s.source} ${s.role} #${s.sequence_no}]\n${s.source==='local'?s.before+s.highlight+s.after:s.content}`).join('\n\n');
  rows.push({strategy,count,sections:r!.sections.length,total_utf16:r!.total_utf16,total_ms,retrieval_ms:retrieval_ms/100,assembly_ms:(performance.now()-assemblyStart)/100,local_validation_and_other_ms:total_ms-retrieval_ms/100});}finally{retrieval.getTurnContext=original;}
 }
 console.log(JSON.stringify({path,highlights:highlights.length,rows},null,2));
 }finally{db.close();}
}
