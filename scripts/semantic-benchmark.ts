import { performance } from 'node:perf_hooks';
import { availableParallelism, cpus } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { statSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { strict as assert } from 'node:assert';

// No private text or vectors are printed. All retrieval examples below are synthetic.
const dir=process.argv[2]; if(!dir) throw new Error('Model directory required');
const baseline=process.memoryUsage().rss;
let networkAttempts=0;
globalThis.fetch=async()=>{networkAttempts++;throw new Error('NETWORK_DISABLED_IN_S1');};
const start=performance.now();
const {BuiltinPocProvider}=await import('../src/semantic/poc/builtin-provider.ts');
const imported=performance.now(),runtimeRss=process.memoryUsage().rss;
const provider=await BuiltinPocProvider.load(dir);
const loaded=performance.now(),loadedRss=process.memoryUsage().rss;
const cpu=process.cpuUsage();let sampledPeak=loadedRss;
const timer=setInterval(()=>sampledPeak=Math.max(sampledPeak,process.memoryUsage().rss),5);
const times:number[]=[];
async function vector(text:string,purpose:'query'|'document') {
  const t=performance.now(); const r=await provider.embed(text,{purpose}); times.push(performance.now()-t);
  if(!r.ok) throw new Error(r.error.code); return r.vector;
}
const first=await vector('以前のチャット内容を探す','query');
const firstMs=times[0];
for(let i=0;i<20;i++) await vector('以前のチャット内容を探す','query');
const repeated=times.slice(1); const steadyWall=performance.now()-loaded; const usedCpu=process.cpuUsage(cpu);
const longText='会話の履歴と意味検索を安全に管理します。'.repeat(20);
const longTokens=provider.countTokens(longText,'document');
const longStart=performance.now(),longCpuStart=process.cpuUsage(); const longTimes:number[]=[];
for(let i=0;i<30;i++){const t=performance.now();await vector(longText,'document');longTimes.push(performance.now()-t);}
const longWall=performance.now()-longStart,longCpu=process.cpuUsage(longCpuStart);
const docs=[
  '会話履歴は過去の質問と回答を保存した記録です。',
  '画像生成モデルのLoRAは画像の画風を調整します。',
  'Embeddingは文章の意味をベクトルに変換し、関連する過去の会話を検索します。',
  'SQLiteはアプリを再起動した後も保存済みデータを復元します。',
  'Conversation history contains earlier questions and answers.',
  'Embeddings enable semantic retrieval of previous conversations.',
  'LoRA adapters customize the style of generated images.',
  'SQLite persists application data across restarts.',
];
const documents=[];for(const d of docs)documents.push(await vector(d,'document'));
const cases=[{id:'ja-history',q:'過去のチャット内容',relevant:[0,4]}, {id:'ja-search',q:'過去チャットを意味で検索する仕組み',relevant:[2,5]}, {id:'en-image',q:'How can I change the artistic style of generated pictures?',relevant:[1,6]}, {id:'en-storage',q:'Keep my data after restarting the app',relevant:[3,7]}];
const hits=[];
for(const c of cases){const q=await vector(c.q,'query');const ranks=documents.map((v,i)=>({document:i,score:v.reduce((s,x,j)=>s+x*q[j],0)})).sort((a,b)=>b.score-a.score);hits.push({id:c.id,relevant:c.relevant,top3:ranks.slice(0,3),pass:c.relevant.includes(ranks[0].document)});}
const cross=[];
for(const [q,expected] of [['以前にやり取りした質問と回答',4],['文章の意味から関連するチャットを探したい',5],['再起動しても保存内容を消さない',7]] as const){const v=await vector(q,'query');const ranks=documents.slice(4).map((d,i)=>({document:i+4,score:d.reduce((s,x,j)=>s+x*v[j],0)})).sort((a,b)=>b.score-a.score);cross.push({expected,top:ranks[0],pass:ranks[0].document===expected});}
for(const c of cases.filter(c=>c.id.startsWith('en-'))){const v=await vector(c.q,'query');const ranks=documents.slice(4).map((d,i)=>({document:i+4,score:d.reduce((s,x,j)=>s+x*v[j],0)})).sort((a,b)=>b.score-a.score);cross.push({expected:c.relevant[1],top:ranks[0],pass:ranks[0].document===c.relevant[1]});}
assert.ok(hits.every(h=>h.pass) && cross.every(h=>h.pass));
const quantile=(values:number[],p:number)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]:null;};
const distributions=[];
for(const path of process.argv.slice(3)) {
  const db=new DatabaseSync(path,{readOnly:true});
  try{for(const role of ['user','assistant']){const rows=db.prepare('SELECT content FROM turns WHERE status=? AND role=?').all('completed',role);const lengths=rows.map(row=>provider.countTokens(row.content as string,'document'));const over=lengths.filter(n=>n>512).length;distributions.push({db:path,role,count:lengths.length,median:quantile(lengths,.5),p90:quantile(lengths,.9),p95:quantile(lengths,.95),max:lengths.length?Math.max(...lengths):null,over,over_rate:lengths.length?over/lengths.length:0});}}finally{db.close();}
}
clearInterval(timer);
const info=await provider.getModelInfo(); await provider.dispose();
const bytes=(path:string):number=>readdirSync(path,{withFileTypes:true}).reduce((sum,e)=>sum+(e.isDirectory()?bytes(resolve(path,e.name)):statSync(resolve(path,e.name)).size),0);
assert.equal(networkAttempts,0);
console.log(JSON.stringify({node:process.version,cpu:cpus()[0].model,logical_cpus:availableParallelism(),info,import_ms:imported-start,load_ms:loaded-imported,first_ms:firstMs,start_to_first_ms:loaded-start+firstMs,repeated_median_ms:quantile(repeated,.5),repeated_p95_ms:quantile(repeated,.95),cpu_ms:(usedCpu.user+usedCpu.system)/1000,wall_ms:steadyWall,cpu_percent_one_core:(usedCpu.user+usedCpu.system)/1000/steadyWall*100,cpu_percent_machine:(usedCpu.user+usedCpu.system)/1000/steadyWall/availableParallelism()*100,long_input:{tokens:longTokens,count:30,median_ms:quantile(longTimes,.5),p95_ms:quantile(longTimes,.95),wall_ms:longWall,cpu_ms:(longCpu.user+longCpu.system)/1000,cpu_percent_machine:(longCpu.user+longCpu.system)/1000/longWall/availableParallelism()*100},ram_bytes:{baseline,runtime_import:runtimeRss,loaded:loadedRss,sampled_peak:sampledPeak,max_rss_process:process.resourceUsage().maxRSS*1024},hits,cross,distributions,networkAttempts,sizes:{model_directory:bytes(dir),node_modules:bytes('node_modules'),onnxruntime_node:bytes('node_modules/onnxruntime-node'),tokenizer_package:bytes('node_modules/@huggingface/tokenizers')}},null,2));
