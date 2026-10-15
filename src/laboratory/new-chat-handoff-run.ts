import {access,mkdir,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {LMStudioProvider} from '../server/provider.ts';
import {allNewChatHandoffPreviews} from './new-chat-handoff-experiment.ts';
import {newChatHandoffGeneration} from './new-chat-handoff.ts';

const output=resolve(process.argv[2]??'docs/laboratory/new-chat-handoff-v02-data');
const execute=process.argv.includes('--execute'),previews=allNewChatHandoffPreviews();
await mkdir(output,{recursive:true});
if(execute)for(const preview of previews){const path=resolve(output,`${preview.fixture}-${preview.condition}.json`);if(await access(path).then(()=>true,()=>false))throw new Error(`Existing result: ${path}. Use a new directory; nothing sent.`);}
await writeFile(resolve(output,'preview.json'),JSON.stringify({previews},null,2)+'\n');
console.log(`Preview: ${previews.length} independent new chats${execute?'':' (no requests sent)'}`);
if(execute){
  const provider=new LMStudioProvider(),available=await provider.models();
  if(!available.includes(newChatHandoffGeneration.model))throw new Error(`Fixed model unavailable: ${newChatHandoffGeneration.model}; available=${available.join(', ')}`);
  for(const preview of previews){
    let answer='',diagnostics:unknown=null,error:string|null=null;const started_at=new Date().toISOString();
    console.log(`START ${preview.fixture}/${preview.condition} context=${preview.past_context_utf16}`);
    try{await provider.generate(preview.request,AbortSignal.timeout(240000),delta=>{answer+=delta;},value=>{diagnostics=value;});if(!answer.trim())throw new Error('Empty answer');}
    catch(cause){error=String(cause instanceof Error?cause.message:cause);}
    const result={...preview,temporary_conversation_id:randomUUID(),request_sha256:createHash('sha256').update(JSON.stringify(preview.request)).digest('hex'),
      model:preview.request.model,generation_settings:{temperature:preview.request.temperature,max_tokens:preview.request.max_tokens},response:answer,
      diagnostics,error,started_at,completed_at:new Date().toISOString(),human_review:'pending'};
    await writeFile(resolve(output,`${preview.fixture}-${preview.condition}.json`),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    console.log(`END ${preview.fixture}/${preview.condition} chars=${answer.length} error=${error}`);
    if(error)throw new Error('Stopped after failed request; result saved; no automatic retry');
  }
}
