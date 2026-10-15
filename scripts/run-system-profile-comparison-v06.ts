import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { LMStudioProvider, ProviderError, type GenerationDiagnostics } from '../src/server/provider.ts';
import {
  buildSystemProfileRequest,
  systemProfileMatrix,
  systemProfileModels,
  systemProfileQuestions,
  type SystemProfileId,
  type SystemProfileSubject,
} from '../src/laboratory/system-profile-comparison-v06.ts';

const outputPath=resolve(process.env.SYSTEM_PROFILE_OUTPUT ?? 'docs/system-profile-comparison-v06-data/runs.json');
const provider=new LMStudioProvider();
const availableModels=await provider.models();
for (const model of systemProfileModels) {
  if (!availableModels.includes(model)) throw new Error(`LM Studioでモデルを確認できません: ${model}`);
}

type RequestSnapshot=ReturnType<typeof buildSystemProfileRequest>;
type Run={
  run_id:string;
  model:string;
  subject:SystemProfileSubject;
  system_profile:SystemProfileId;
  system_profile_text:string | null;
  system_message:string | null;
  user_profile_enabled:false;
  user_profile_text:'';
  user_question:string;
  generation_settings:typeof generationSettings;
  request_snapshot:RequestSnapshot;
  reasoning:string;
  answer:string;
  diagnostics:GenerationDiagnostics | null;
  error:string | null;
  started_at:string;
  completed_at:string | null;
  elapsed_ms:number | null;
  human_review:'pending';
};

const generationSettings={
  temperature:0,
  max_tokens:4096,
  stream:true,
  usage:true,
  automatic_retry:false,
  timeout_ms:600_000,
} as const;

async function generateWithReasoning(
  request:RequestSnapshot,
  signal:AbortSignal,
  onAnswer:(text:string)=>void,
  onReasoning:(text:string)=>void,
):Promise<GenerationDiagnostics> {
  const started=performance.now();
  const response=await fetch(`${provider.baseUrl}/chat/completions`,{
    method:'POST',
    redirect:'error',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(request),
    signal,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new ProviderError(`LM Studio HTTP ${response.status}`);
  }
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
    throw new ProviderError('SSE応答ではありません');
  }
  const reader=response.body.getReader();
  const decoder=new TextDecoder('utf-8',{fatal:true});
  let buffer='';
  let finished=false;
  let finishReason:GenerationDiagnostics['finish_reason'] | null=null;
  let contentChars=0;
  let reasoningChars=0;
  let usage:{completion_tokens?:unknown;prompt_tokens?:unknown;total_tokens?:unknown}|null=null;
  const token=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
  try {
    while(true) {
      const {value,done}=await reader.read();
      if(done) throw new ProviderError('正常終了イベント前に通信が切断されました');
      buffer+=decoder.decode(value,{stream:true});
      if(buffer.length>1_000_000) throw new ProviderError('SSEイベントが大きすぎます');
      let match:RegExpExecArray|null;
      while((match=/\r?\n\r?\n/.exec(buffer))) {
        const event=buffer.slice(0,match.index);
        buffer=buffer.slice(match.index+match[0].length);
        const data=event.split(/\r?\n/).filter(line=>line.startsWith('data:'))
          .map(line=>line.slice(5).trimStart()).join('\n');
        if(!data) continue;
        if(data==='[DONE]') {
          if(!finished||!finishReason) throw new ProviderError('finish_reasonがありません');
          return {
            finish_reason:finishReason,
            completion_tokens:token(usage?.completion_tokens),
            prompt_tokens:token(usage?.prompt_tokens),
            total_tokens:token(usage?.total_tokens),
            content_chars:contentChars,
            reasoning_chars:reasoningChars,
            duration_ms:Math.round(performance.now()-started),
            terminal_chunk_received:true,
          };
        }
        const chunk=JSON.parse(data);
        if(chunk.error) throw new ProviderError('LM Studioがstreamエラーを返しました');
        if(!Array.isArray(chunk.choices)) throw new ProviderError('不正なstream応答');
        if(chunk.usage&&typeof chunk.usage==='object') usage=chunk.usage;
        const choice=chunk.choices.find((item:{index:number})=>item.index===0);
        if(!choice) continue;
        if(choice.delta?.tool_calls) throw new ProviderError('ツール呼出しは未対応です');
        const reasoning=choice.delta?.reasoning_content??choice.delta?.reasoning;
        if(reasoning!=null) {
          if(typeof reasoning!=='string'||finished) throw new ProviderError('不正な推論イベント');
          reasoningChars+=reasoning.length;
          onReasoning(reasoning);
        }
        if(choice.delta?.content!=null) {
          if(typeof choice.delta.content!=='string'||finished) throw new ProviderError('不正な本文イベント');
          contentChars+=choice.delta.content.length;
          onAnswer(choice.delta.content);
        }
        if(choice.finish_reason!=null) {
          if(!['stop','length'].includes(choice.finish_reason)) {
            throw new ProviderError(`未対応の終了理由: ${choice.finish_reason}`);
          }
          finishReason=choice.finish_reason;
          finished=true;
        }
      }
    }
  } finally {
    await reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
}

const createdAt=new Date().toISOString();
const runs:Run[]=[];
const save=()=>{
  mkdirSync(dirname(outputPath),{recursive:true});
  writeFileSync(outputPath,`${JSON.stringify({
    experiment:'att-chat-system-profile-comparison-v0.6',
    created_at:createdAt,
    provider_base_url:provider.baseUrl,
    available_models:availableModels,
    generation_settings:generationSettings,
    lm_studio_settings_note:'Thinking / ReasoningなどのLM Studio側設定はAPIから取得できない。各モデルの試験中には設定を変更していない。',
    user_profile:{enabled:false,text:''},
    expected_run_count:systemProfileMatrix().length,
    questions:systemProfileQuestions,
    runs,
  },null,2)}\n`,'utf8');
};

save();
for(const {model,subject,condition} of systemProfileMatrix()) {
  const request=buildSystemProfileRequest(model,subject,condition);
  const startedAt=new Date().toISOString();
  const started=performance.now();
  const run:Run={
    run_id:crypto.randomUUID(),
    model,
    subject,
    system_profile:condition.system_profile,
    system_profile_text:condition.system_profile_text,
    system_message:condition.system_message,
    user_profile_enabled:false,
    user_profile_text:'',
    user_question:systemProfileQuestions[subject],
    generation_settings:generationSettings,
    request_snapshot:request,
    reasoning:'',
    answer:'',
    diagnostics:null,
    error:null,
    started_at:startedAt,
    completed_at:null,
    elapsed_ms:null,
    human_review:'pending',
  };
  runs.push(run);
  save();
  process.stdout.write(`START ${model} ${subject} ${condition.system_profile}\n`);
  try {
    run.diagnostics=await generateWithReasoning(
      request,
      AbortSignal.timeout(generationSettings.timeout_ms),
      text=>{run.answer+=text;},
      text=>{run.reasoning+=text;},
    );
  } catch(error) {
    run.error=(error as Error).message;
  }
  run.completed_at=new Date().toISOString();
  run.elapsed_ms=Math.round(performance.now()-started);
  save();
  process.stdout.write(
    `DONE  ${model} ${subject} ${condition.system_profile} answer=${run.answer.length} `+
    `reasoning=${run.reasoning.length} finish=${run.diagnostics?.finish_reason??'error'} elapsed=${run.elapsed_ms}\n`,
  );
}

const incomplete=runs.filter(run=>run.error||!run.answer||!run.diagnostics);
if(incomplete.length) {
  process.stderr.write(`Completed with ${incomplete.length} incomplete run(s). No automatic retry was performed.\n`);
  process.exitCode=1;
} else {
  process.stdout.write(`Saved ${runs.length} completed runs to ${outputPath}\n`);
}
