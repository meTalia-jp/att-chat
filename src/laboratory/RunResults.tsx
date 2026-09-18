import { useEffect, useState } from 'react';
import type { SimpleRun } from './run-contracts.ts';
import type { ExperimentRun } from './single-text/contracts.ts';

export async function laboratoryJson<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(path, body === undefined ? undefined : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const value = await response.json();
  if (!response.ok) throw new Error(value.error?.message ?? 'Run記録を取得できません');
  return value;
}
export function RunResults({ kind, onConversation }: {kind:'simple'|'single'; onConversation:(id:string)=>void}) {
  const [runs,setRuns] = useState<(SimpleRun | ExperimentRun)[]>([]), [error,setError] = useState('');
  const [output,setOutput] = useState<ExperimentRun | null>(null);
  async function reload() {
    try { setRuns(await laboratoryJson(`/api/laboratory/runs/${kind}`)); setError(''); }
    catch(e) { setError((e as Error).message); }
  }
  useEffect(()=>{void reload();},[kind]);
  return <>
    <button onClick={()=>void reload()}>Run一覧を再読込</button>
    {error && <p role="alert">{error}</p>}
    {!error && !runs.length && <p>保存Runはありません。</p>}
    <ul>{runs.map(run=><li key={run.run_id}>
      <p>Experiment: {run.experiment_id} / Run: {run.run_id} / {run.status} / Validation: {run.validation_status}</p>
      <p>Started: {run.started_at} / Finished: {run.finished_at ?? '未終了'}</p>
      {'conversation_id' in run ? <>
        <p>Conversation: {run.conversation_id} / Generation count: {run.generation_run_ids.length} / Models: {run.models.join(', ') || '未使用'}</p>
        <button onClick={()=>onConversation(run.conversation_id)}>対応する会話を見る</button>
        <details><summary>Marker操作記録</summary>{run.marker_events === undefined ? <p>旧Run：操作記録なし</p> : !run.marker_events.length ? <p>操作なし</p> : <ul>{run.marker_events.map((event,index)=><li key={index}>{event.operation} / {event.highlight_id} / {event.timestamp}</li>)}</ul>}</details>
      </> : <><p>Model: {run.model}</p><button onClick={()=>setOutput(run)}>出力を確認</button></>}
      <details><summary>実験定義・出典</summary><pre>{JSON.stringify({experiment_snapshot:run.experiment_snapshot,source_commit:run.source_commit,dirty_state:run.dirty_state},null,2)}</pre></details>
    </li>)}</ul>
    {output && <section><h3>Output: {output.run_id}</h3><pre>{output.output_snapshot ?? output.partial_output}</pre>{output.error && <p>{output.error.message}</p>}<button onClick={()=>setOutput(null)}>出力を閉じる</button></section>}
  </>;
}
