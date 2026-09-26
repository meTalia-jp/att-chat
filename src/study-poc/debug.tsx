import { createRoot } from 'react-dom/client';
import { useState } from 'react';
function Debug(){const [id,setId]=useState(''),[data,setData]=useState<unknown>(null);return <main><h1>実験者向け詳細debug</h1><p>解答・未公開出力を含みます。通常学習画面とは別です。STUDY_POC_DEBUG=1で起動した場合のみ取得できます。</p><label>Session ID<input value={id} onChange={e=>setId(e.target.value)}/></label><button onClick={()=>void fetch('/api/sessions/'+encodeURIComponent(id)+'/debug').then(r=>r.json()).then(setData).catch(()=>setData({error:'取得失敗'}))}>詳細を取得</button><pre>{JSON.stringify(data,null,2)}</pre></main>;}
createRoot(document.getElementById('root')!).render(<Debug/>);
