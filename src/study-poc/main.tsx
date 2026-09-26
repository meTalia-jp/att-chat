import { createRoot } from 'react-dom/client';
import { useEffect,useState } from 'react';
import type { PublicSession } from './contracts.ts';
type PublicProblem={id:string;public_title:string;public_question:string};
async function request<T>(path:string,data?:unknown):Promise<T>{const r=await fetch(path,data===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const v=await r.json();if(!r.ok)throw new Error(v.error?.code??'REQUEST_FAILED');return v;}
function App(){
 const [problems,setProblems]=useState<PublicProblem[]>([]),[models,setModels]=useState<string[]>([]),[model,setModel]=useState(''),[problem,setProblem]=useState('transpose'),[session,setSession]=useState<PublicSession|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{void request<PublicProblem[]>('/api/problems').then(setProblems).catch(e=>setError(e.message));void request<{models:string[]}>('/api/models').then(v=>setModels(v.models)).catch(e=>setError(e.message));const id=sessionStorage.getItem('study-p0-session');if(id)void request<PublicSession>('/api/sessions/'+id).then(setSession).catch(()=>sessionStorage.removeItem('study-p0-session'));},[]);
 useEffect(()=>{if(!session?.session_id)return;sessionStorage.setItem('study-p0-session',session.session_id);if(!busy&&!session.running)return;const timer=setInterval(()=>{void request<PublicSession>('/api/sessions/'+session.session_id).then(setSession).catch(()=>{});},500);return ()=>clearInterval(timer);},[session?.session_id,session?.running,busy]);
 async function start(){setBusy(true);setError('');try{let s=session;if(!s){s=await request<PublicSession>('/api/sessions',{});setSession(s);}setSession(await request<PublicSession>('/api/sessions/'+s.session_id+'/start',{problem_id:problem,model}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function control(action:string){if(!session)return;try{setSession(await request<PublicSession>('/api/sessions/'+session.session_id+'/'+action,{}));}catch(e){setError((e as Error).message);}}
 return <main style={{maxWidth:900,margin:'2rem auto',fontFamily:'sans-serif'}}><h1>Study Mode PoC — P0</h1><p>独立実験・保存なし。サーバー再起動でSessionは消えます。教材は人間レビュー待ちです。</p>
 <label>問題<select value={session?.problem_id??problem} disabled={busy||!!session?.current_task_id} onChange={e=>setProblem(e.target.value)}>{problems.map(p=><option key={p.id} value={p.id}>{p.public_title}</option>)}</select></label>
 <label>モデル<select value={model} disabled={busy} onChange={e=>setModel(e.target.value)}><option value="">選択してください</option>{models.map(m=><option key={m}>{m}</option>)}</select></label>
 <button disabled={busy||!model||!!session?.current_task_id} onClick={()=>void start()}>開始</button>
 <button disabled={!session?.running} onClick={()=>void control('stop')}>Stop</button><button disabled={!session?.current_task_id} onClick={()=>void control('pause')}>Pause</button><button disabled={busy||!session} onClick={()=>void control('restart')}>Restart Session</button>
 {error&&<p role="alert">{error}</p>}
 <h2>今回考えること</h2><p>{session?.public_task?.question??problems.find(p=>p.id===problem)?.public_question}</p><p>状態: {session?.task_state??'未開始'} {session?.running?'（処理中）':''}</p>
 {session?.debug_summary.error_type&&<p role="alert">{session.debug_summary.error_type} — 応答の自動再生成は行いません。</p>}
 {session?.tutor&&<section><h2>Tutor</h2><p>{session.tutor.explanation}</p>{session.last_question&&<><h3>AIからの問い</h3><p>{session.last_question}</p></>}</section>}
 <label>回答<textarea disabled placeholder="継続学習は次Phaseです" /></label>
 <details><summary>通常debug（本文・Referenceなし）</summary><p>Session ID: {session?.session_id}</p><pre>{JSON.stringify(session?.debug_summary??{},null,2)}</pre></details>
 </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
