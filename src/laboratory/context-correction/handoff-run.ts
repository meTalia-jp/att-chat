import { mkdir, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { LMStudioProvider } from '../../server/provider.ts';
import { markers, turns, fixtureVersion } from './long-fixture.ts';
import { modes, levels, preview, settings, escalation } from './handoff-experiment.ts';

// Experiment-local CLI, no HTTP server or production Run schema.
const output=resolve(process.argv[2] ?? 'docs/laboratory/context-correction-v03-data');
const execute=process.argv.includes('--execute');
await mkdir(output,{recursive:true});
const previews=markers.flatMap(marker=>modes.flatMap(mode=>levels.map(level=>preview(marker,mode,level))));
if(execute) {
  for(const p of previews) {
    const path=resolve(output,`${p.marker}-${p.condition}.json`);
    const exists=await access(path).then(()=>true,()=>false);
    if(exists) throw new Error(`Existing result: ${path}. Use a new output directory; nothing sent.`);
  }
}
await writeFile(resolve(output,'preview.json'),JSON.stringify({fixtureVersion,turns,markers,previews},null,2)+'\n');
console.log(`Preview: ${output}/preview.json (${previews.length} requests; no requests sent unless --execute)`);
if(execute) {
  const provider=new LMStudioProvider();
  if(!(await provider.models()).includes(settings.model)) throw new Error('Fixed model unavailable');
  for(const p of previews) {
    let answer=''; let diagnostics: unknown=null; let error: string|null=null;
    const started=new Date().toISOString();
    console.log(`START ${p.marker}/${p.condition} context=${p.context_utf16}`);
    try {
      await provider.generate(p.request,AbortSignal.timeout(240000),delta=>{answer+=delta;},value=>{diagnostics=value;});
      if(!answer.trim()) throw new Error('Empty answer');
    } catch(e) {error=String(e);}
    const result={...p,...escalation(answer),provider_base_url:provider.baseUrl,request_sha256:createHash('sha256').update(JSON.stringify(p.request)).digest('hex'),started,finished:new Date().toISOString(),answer,output_utf16:answer.length,diagnostics,error,human_review:'pending'};
    await writeFile(resolve(output,`${p.marker}-${p.condition}.json`),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    console.log(`END ${p.marker}/${p.condition} chars=${answer.length} error=${error}`);
    if(error) throw new Error('Stopped after failed request; partial result saved, no automatic retry');
  }
}
