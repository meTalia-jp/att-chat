import { useEffect, useRef, useState } from 'react';
import { SimpleMarkerChat } from '../client/SimpleMarkerChat.tsx';
import { SingleTextGeneration } from './single-text/SingleTextGeneration.tsx';
import { canSwitchExperiment, experiments, type ExperimentDefinition } from './catalog.ts';
import type { SimpleRun } from './run-contracts.ts';
import type { Conversation } from '../shared/contracts.ts';
import { laboratoryJson, RunResults } from './RunResults.tsx';
import { MarkerColorSample } from './MarkerColorSample.tsx';
import { MarkerQuickActionPrototype } from './MarkerQuickActionPrototype.tsx';

export function Laboratory({ definitions = experiments }: { definitions?: readonly ExperimentDefinition[] } = {}) {
  const [selected, setSelected] = useState(definitions[0].id);
  const [tab, setTab] = useState<'Overview' | 'Run' | 'Results'>('Overview');
  const [busy, setBusy] = useState(false), [session, setSession] = useState<SimpleRun | null>(null);
  const [loading,setLoading] = useState(true), [error,setError] = useState('');
  const [conversations,setConversations] = useState<Conversation[]>([]), [conversationId,setConversationId] = useState(''), [title,setTitle] = useState('');
  const [viewConversation,setViewConversation] = useState('');
  const operation = useRef(false);
  async function action(work:()=>Promise<void>) {
    if(operation.current)return;
    operation.current=true;setLoading(true);setError('');
    try { await work(); } catch(e) { setError((e as Error).message); }
    finally { operation.current=false;setLoading(false); }
  }
  async function loadConversations() {
    const list=await laboratoryJson<Conversation[]>('/api/conversations');setConversations(list);
    setConversationId(id=>list.some(c=>c.conversation_id===id)?id:list[0]?.conversation_id??'');
  }
  useEffect(()=>{void action(async()=>{
    const current=await laboratoryJson<SimpleRun|null>('/api/laboratory/sessions/current');
    setSession(current);if(current){setSelected(current.experiment_id);setTab('Run');}await loadConversations();
  });},[]);
  const [singleOpened, setSingleOpened] = useState(false);
  const experiment = definitions.find(item => item.id === selected)!;
  const entry = experiment.execution?.entry;
  const switchable = canSwitchExperiment(busy || loading, !!session);
  function choose(id: string) {
    if (!switchable || id === selected) return;
    setSelected(id); setTab('Overview'); setSingleOpened(false);setViewConversation('');
  }
  return <div className="laboratory">
    <h1>att-chat Laboratory</h1>
    <div className="laboratory-layout">
      <aside aria-label="Experiment Catalog">
        <h2>Experiment Catalog</h2>
        <ul>{definitions.map(item => <li key={item.id}>
          <button disabled={!switchable} aria-current={selected === item.id ? 'true' : undefined} onClick={() => choose(item.id)}>{item.title}</button>
          <p>{item.status} / {item.kind} / {item.runnable ? 'Runnable' : 'Record only'}</p>
          <p>{item.purpose}</p>
        </li>)}</ul>
      </aside>
      <div aria-label="Workspace">
        <h2>{experiment.title}</h2>
        <nav aria-label="Workspace表示">{(['Overview','Run','Results'] as const).map(name =>
          <button key={name} disabled={busy || loading} aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</button>)}</nav>
        {error && <p role="alert">{error}<button onClick={()=>void action(async()=>{setSession(await laboratoryJson('/api/laboratory/sessions/current'));await loadConversations();})}>記録を再確認</button></p>}
        {busy && <p role="status">処理中です。停止または完了までExperimentを切り替えられません。</p>}
        {session && <p>Simple Marker Chatの実験セッション継続中です。切替前に明示的に終了してください。
          <button disabled={busy || loading} onClick={() => void action(async()=>{await laboratoryJson(`/api/laboratory/sessions/${session.run_id}/finish`,{});setSession(null);setBusy(false);setTab('Results');})}>セッションを終了</button></p>}
        <section hidden={tab !== 'Overview'} aria-label="Overview">
          <dl>
            <dt>Title</dt><dd>{experiment.title}</dd>
            <dt>Purpose</dt><dd>{experiment.purpose}</dd>
            <dt>Hypothesis</dt><dd>{experiment.hypothesis}</dd>
            <dt>Status</dt><dd>{experiment.status}</dd>
            <dt>Version</dt><dd>{experiment.version}</dd>
            <dt>ID</dt><dd>{experiment.id}</dd>
            <dt>Derived from</dt><dd>{experiment.derived_from ? `${experiment.derived_from.id} / ${experiment.derived_from.version}` : 'なし'}</dd>
            <dt>Procedure</dt><dd>{experiment.procedure.join(' → ')}</dd>
            <dt>Acceptance</dt><dd>{experiment.acceptance.join(' / ')}</dd>
            <dt>Kind</dt><dd>{experiment.kind}</dd>
            <dt>Runnable</dt><dd>{experiment.runnable ? 'Runnable' : 'Record only'}</dd>
            <dt>Equipment</dt><dd>{experiment.equipment.join(', ')}</dd>
            <dt>Execution entry</dt><dd>{experiment.execution?.entry ?? 'なし（既存runnerを別途使用）'}</dd>
          </dl>
        </section>
        <section hidden={tab !== 'Run'} aria-label="Run">
          {entry === 'simple-marker-chat' && (session
            ? <SimpleMarkerChat key={session.run_id} conversationId={session.conversation_id} onBusy={setBusy} />
            : <><p>会話を選び、開始記録を保存してから実験セッションを開始します。</p>
              <label>実験する会話<select value={conversationId} disabled={loading} onChange={e=>setConversationId(e.target.value)}><option value="">会話を選択</option>{conversations.map(c=><option key={c.conversation_id} value={c.conversation_id}>{c.title}</option>)}</select></label>
              <label>新規会話タイトル<input value={title} disabled={loading} onChange={e=>setTitle(e.target.value)} maxLength={200}/></label>
              <button disabled={loading || !title.trim()} onClick={()=>void action(async()=>{const c=await laboratoryJson<Conversation>('/api/conversations',{title});await loadConversations();setConversationId(c.conversation_id);setTitle('');})}>実験用会話を作成</button>
              <button disabled={loading || !conversationId} onClick={()=>void action(async()=>{const run=await laboratoryJson<SimpleRun>('/api/laboratory/sessions',{conversation_id:conversationId,experiment_id:experiment.id});setSession(run);setViewConversation('');})}>セッションを開始</button>
            </>)}
          {entry === 'single-text-generation' && (singleOpened
            ? <SingleTextGeneration onBusy={setBusy} />
            : <button onClick={() => setSingleOpened(true)}>Single Text Generationを開く</button>)}
          {entry === 'marker-color-sample' && <MarkerColorSample />}
          {entry === 'marker-quick-action-prototype' && <MarkerQuickActionPrototype />}
          {selected === 'study-p0' && <><p>Record only。StudyをLaboratory内では起動・統合しません。</p>
            <p>既存の起動方法は src/study-poc/serve.ts と vite.study.config.ts、docs/study-p0-design.md を参照してください。</p></>}
        </section>
        <section hidden={tab !== 'Results'} aria-label="Results">
          {entry === 'simple-marker-chat' && tab === 'Results' && <><RunResults kind="simple" onConversation={id=>{
            if(session) { if(id===session.conversation_id)setTab('Run');else setError('別会話の確認はセッション終了後に行ってください'); }
            else setViewConversation(id);
          }}/>
            {viewConversation && <><button onClick={()=>setViewConversation('')}>会話確認を閉じる</button><SimpleMarkerChat key={viewConversation} conversationId={viewConversation} readOnly/></>}</>}
          {entry === 'single-text-generation' && tab === 'Results' && <><RunResults kind="single" onConversation={()=>{}}/>
            <button onClick={() => { setSingleOpened(true); setTab('Run'); }}>保存Runを確認</button></>}
          {entry === 'marker-color-sample' && <><p>このExperimentは人間による比較用です。自動スコアとRun JSONは作成しません。</p>
            <p>Runで本文可読性、一覧の識別性、miniMAPの小点、明暗面を確認し、採用判断は別の本番変更Phaseで記録してください。</p></>}
          {entry === 'marker-quick-action-prototype' && <><p>操作感を確認するLab内Prototypeです。Markerはメモリ内だけに保持し、DB・Highlight API・本番Chatへ保存しません。</p>
            <p>Runで選択直後の位置、クリックしやすさ、selection保持、端処理、外側クリックとEscを確認してください。</p></>}
          {selected === 'study-p0' && <><p>既存の検証文書を参照してください。Study P0のセッションはメモリ上の記録です。</p>
            <ul>{['docs/study-p0-results.md','docs/study-p0-model-comparison.md','docs/study-p0-tutor-control-comparison.md'].map(path => <li key={path}><code>{path}</code></li>)}</ul></>}
        </section>
      </div>
    </div>
  </div>;
}
