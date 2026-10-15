import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { api, apiRequest } from './api.ts';
import type { Conversation, ConversationDetail } from '../shared/contracts.ts';
import './style.css';
import './normal-chat.css';
import './start-screen.css';
import { Chat } from './Chat.tsx';
import { MarkedTurns } from './MarkedTurns.tsx';
import { GlobalQuestionBox } from './GlobalQuestionBox.tsx';
import type { GlobalQuestionKeep, QuestionKeep } from '../shared/question-keep.ts';
import { jumpToTurn } from './turn-navigation.ts';
import type { RelatedTurn } from '../shared/semantic-search.ts';
import { upsertImmediateAskDraft, type ImmediateAskDraft } from './MarkerDetailAdapter.tsx';
import { RightSidebar, type RightSidebarController } from './RightSidebar.tsx';
import { SettingsShell, type DeveloperVisibility, type SendKeyMode, type SettingsSection, type SystemPromptPreferences, type UserProfilePreferences } from './SettingsShell.tsx';
import { HandoffOrigin } from './HandoffPresentation.tsx';
import { StartScreen } from './StartScreen.tsx';
import { ModelSettingsControls } from './ModelSettingsControls.tsx';
import type { StartupPreferences } from './SettingsShell.tsx';
import { restoredProfiles, restoreSelectedModel, savedProfile, type Settings, type SettingsPatch, type SettingsResult } from '../shared/settings.ts';
import { ConversationTitle } from './ConversationTitle.tsx';
import { CollectionSidebar } from './CollectionSidebar.tsx';
import { emptyCollections, type CollectionResult } from '../shared/collections.ts';
import { lmStudioSimpleBaseUrl, type AppliedModelConnection, type AppliedModelConnectionResult, type ModelConnectionChoice, type ModelConnectionMode, type ModelConnectionStatus } from '../shared/model-connection.ts';

export function App() {
  const [collections, setCollections] = useState<CollectionResult>({ data:emptyCollections(), warnings:[], writable:false });
  const [list, setList] = useState<Conversation[]>([]), [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [view, setView] = useState<'start' | 'conversation'>('start');
  const [reloadToken, setReloadToken] = useState(0);
  const [jumpTarget,setJumpTarget]=useState<RelatedTurn|null>(null);
  const [sidebarTab,setSidebarTab]=useState<'chat'|'questions'>('chat');
  const [questionReturn,setQuestionReturn]=useState<{ conversationId:string; turnId:string; highlightId:string; highlightStatus:'resolved'|'unresolved'; request:number }|null>(null);
  const questionReturnRequest=useRef(0);
  useEffect(()=>{
    if(!jumpTarget || detail?.conversation.conversation_id!==jumpTarget.conversation_id)return;
    try{const clear=jumpToTurn(document,jumpTarget.turn_id);const timer=setTimeout(clear,1800);return()=>{clearTimeout(timer);clear();};}
    catch(e){setError((e as Error).message);}
  },[detail,jumpTarget]);
  useEffect(()=>{
    if(!questionReturn || detail?.conversation.conversation_id!==questionReturn.conversationId)return;
    try{
      const clear=jumpToTurn(document,questionReturn.turnId);
      const sequence=detail.turns.find(turn=>turn.turn_id===questionReturn.turnId)?.sequence_no;
      if(questionReturn.highlightStatus==='unresolved')setMessage(`T${sequence===undefined?'?':sequence+1}へ移動しました。Marker位置を確認できません。`);
      const request=questionReturn.request;
      const timer=setTimeout(()=>{clear();setQuestionReturn(current=>current?.request===request?null:current)},1800);
      return()=>{clearTimeout(timer);clear()};
    }catch(e){setError((e as Error).message);}
  },[detail,questionReturn]);
  async function relatedJump(result:RelatedTurn){
    if(busy)return;
    if(detail?.conversation.conversation_id!==result.conversation_id)await refresh(result.conversation_id);
    setJumpTarget({...result});
  }
  const [question, setQuestion] = useState<(QuestionKeep & { newConversation?: boolean; sourceConversationId: string }) | null>(null);
  const [immediateDrafts, setImmediateDrafts] = useState<ImmediateAskDraft[]>([]);
  useEffect(() => { setQuestion(current => current && current.sourceConversationId === detail?.conversation.conversation_id ? current : null); }, [detail?.conversation.conversation_id]);
  useEffect(() => { setImmediateDrafts([]); }, [detail?.conversation.conversation_id]);
  const [content, setContent] = useState(''), [reply, setReply] = useState('保存確認用の仮Assistant回答です。');
  const [userId, setUserId] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('読込中…'), [error, setError] = useState('');
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const rightSidebarController = useRef<RightSidebarController>(null);
  const [minimapHost, setMinimapHost] = useState<HTMLDivElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false), [settingsSection, setSettingsSection] = useState<SettingsSection>('general');
  const [settingsModelHost, setSettingsModelHost] = useState<HTMLDivElement | null>(null);
  const [developer, setDeveloper] = useState<DeveloperVisibility>({ markerManagement: false, runDetails: false, storageTools: false });
  const [startup, setStartup] = useState<StartupPreferences>({ screen:'start', reuseModel:true });
  const [sendKeyMode, setSendKeyMode] = useState<SendKeyMode>('safe');
  const [systemPrompt, setSystemPrompt] = useState<SystemPromptPreferences>({ enabled:false, preset:'off', text:'' });
  const [userProfile, setUserProfile] = useState<UserProfilePreferences>({ enabled:false, preset:'off', text:'' });
  const [models, setModels] = useState<string[]>([]), [model, setModel] = useState(''), [modelsChecking, setModelsChecking] = useState(true), [modelError, setModelError] = useState('');
  const [connectionMode, setConnectionMode] = useState<ModelConnectionChoice>('lm_studio_simple');
  const [appliedConnectionMode, setAppliedConnectionMode] = useState<ModelConnectionMode>('lm_studio_simple');
  const [draftBaseUrl, setDraftBaseUrl] = useState(lmStudioSimpleBaseUrl), [appliedBaseUrl, setAppliedBaseUrl] = useState(lmStudioSimpleBaseUrl);
  const [connectionChecking, setConnectionChecking] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState<'loading' | 'ready' | 'warning'>('loading');
  const [settingsWarning, setSettingsWarning] = useState('');
  const [modelWarning, setModelWarning] = useState('');
  const [minimapMode, setMinimapMode] = useState<'detail' | 'overview'>('detail');
  const settingsReady = useRef(false);
  const savedSettings = useRef<Settings | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [settingsSaving, setSettingsSaving] = useState(false);
  const saveCount = useRef(0);
  function saveSettings(patch: SettingsPatch, apply: (settings: Settings) => void): Promise<void> {
    if (!settingsReady.current) return Promise.reject(new Error('設定読込中です'));
    saveCount.current += 1; setSettingsSaving(true);
    const operation = saveQueue.current.then(async () => {
      const result = await apiRequest<SettingsResult>('/api/settings', 'PATCH', patch);
      savedSettings.current = result.settings; apply(result.settings);
      setSettingsWarning(result.warnings.join(' ')); setSettingsStatus(result.warnings.length ? 'warning' : 'ready');
    }).catch(reason => { setSettingsWarning(`設定は未保存です: ${(reason as Error).message}`); setSettingsStatus('warning'); throw reason; })
      .finally(() => { saveCount.current -= 1; setSettingsSaving(saveCount.current > 0); });
    saveQueue.current = operation.catch(() => undefined);
    return operation;
  }
  function persist(patch: SettingsPatch, apply: (settings: Settings) => void) { void saveSettings(patch, apply).catch(() => {}); }
  function selectModel(value: string) { persist({ model:{selected_model:value || null} }, () => { setModel(value); setModelWarning(''); }); }
  function changeMinimapMode(mode: 'detail' | 'overview') { persist({ui:{minimap_mode:mode}}, () => setMinimapMode(mode)); }
  function openSettings(section: SettingsSection) { setSettingsSection(section); setSettingsOpen(true); }
  async function refreshModels() {
    setModelsChecking(true); setModelError('');
    try {
      const result = await api<{ models:string[] }>('/api/models');
      setModels(result.models);
      if (model && result.models.includes(model)) { setModelWarning(''); }
      else {
        const restored = savedSettings.current ? restoreSelectedModel(savedSettings.current, result.models) : {model:'',warning:''};
        setModelWarning(restored.warning); setModel(restored.model);
      }
    } catch (reason) { setModels([]); setModel(''); setModelError((reason as Error).message); }
    finally { setModelsChecking(false); }
  }
  async function initializeModelConnection() {
    const current = await api<AppliedModelConnection>('/api/model-connection');
    setConnectionMode(current.mode); setAppliedConnectionMode(current.mode);
    setDraftBaseUrl(current.applied_base_url); setAppliedBaseUrl(current.applied_base_url);
    await refreshModels();
  }
  async function applyModelConnection(mode: ModelConnectionMode) {
    if (connectionChecking || busy) return;
    setConnectionChecking(true); setModelError('');
    try {
      const result = await api<AppliedModelConnectionResult>('/api/model-connection/apply', {
        mode,
        ...(mode === 'lm_studio_advanced' ? { base_url:draftBaseUrl } : {}),
      });
      setConnectionMode(result.mode); setAppliedConnectionMode(result.mode);
      setAppliedBaseUrl(result.applied_base_url); setDraftBaseUrl(result.applied_base_url);
      setModels(result.models);
      if (savedSettings.current) savedSettings.current = { ...savedSettings.current, model:{...savedSettings.current.model, connection_mode:result.mode, lm_studio_base_url:result.applied_base_url} };
      setModel(previous => result.models.includes(previous) ? previous : '');
      setModelWarning('');
    } catch (reason) {
      setModelError((reason as Error).message);
      if (mode === 'lm_studio_simple') setConnectionMode(appliedConnectionMode);
    } finally { setConnectionChecking(false); }
  }
  function chooseConnectionMode(mode: ModelConnectionChoice) {
    if (mode === 'openai') return;
    setConnectionMode(mode);
    if (mode === 'lm_studio_simple') void applyModelConnection(mode);
  }
  async function refresh(preferred?: string) {
    const conversations = await api<Conversation[]>('/api/conversations');
    try { setCollections(await api<CollectionResult>('/api/collections')); }
    catch { setCollections({ data:emptyCollections(), writable:false, warnings:['コレクションを取得できません。未分類で表示しています。再読込してください。'] }); }
    const selected = conversations.find(c => c.conversation_id === preferred) ?? conversations[0];
    const loaded = selected ? await api<ConversationDetail>(`/api/conversations/${selected.conversation_id}`) : null;
    setList(conversations); setDetail(loaded); setReloadToken(value => value + 1);
    setUserId(loaded?.turns.filter(t => t.role === 'user').at(-1)?.turn_id ?? '');
    return loaded;
  }
  async function action(fn: () => Promise<void>) { setBusy(true); setError(''); setMessage('処理中…'); try { await fn(); } catch (e) { setMessage(''); setError(`${(e as Error).message} 入力は保持しています。保存結果が不明な場合は再読込で確認してください。`); } finally { setBusy(false); } }
  async function createConversation(name = '新規チャット') {
    const conversation = await api<Conversation>('/api/conversations', { title:name });
    await refresh(conversation.conversation_id); setView('conversation'); setMessage('会話を保存しました');
  }
  async function openConversation(conversationId: string) {
    await refresh(conversationId); setView('conversation'); setSidebarTab('chat'); setMessage('会話を読み込みました');
  }
  async function renameConversation(value: string) {
    if (!detail || busy || !value.trim()) return false;
    let saved = false;
    await action(async () => {
      await apiRequest<Conversation>(`/api/conversations/${detail.conversation.conversation_id}`, 'PATCH', { title:value.trim() });
      await refresh(detail.conversation.conversation_id);
      setMessage('会話名を変更しました'); saved = true;
    });
    return saved;
  }
  async function returnFromQuestionBox(item: GlobalQuestionKeep) {
    if(busy)return;
    await action(async()=>{
      setSidebarTab('chat');
      await refresh(item.conversation.conversation_id);
      questionReturnRequest.current+=1;
      setQuestionReturn({conversationId:item.conversation.conversation_id,turnId:item.source_turn.turn_id,highlightId:item.highlight.highlight_id,highlightStatus:item.highlight.status,request:questionReturnRequest.current});
      setMessage(item.highlight.status==='resolved'?'元のMarkerへ移動します。':'元のTurnへ移動します。Marker位置を確認できません。');
    });
  }
  async function askFromQuestionBox(item: GlobalQuestionKeep,newConversation:boolean) {
    if(busy)return;
    await action(async()=>{
      setSidebarTab('chat');
      await refresh(item.conversation.conversation_id);
      setQuestion({...item.keep,newConversation,sourceConversationId:item.conversation.conversation_id});
      setMessage(newConversation?'New Chat Handoffを開きました。PreviewだけではConversationを作成しません。':'既存の「このチャットで聞く」を開きました。送信するまでKeepは変更しません。');
    });
  }
  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const result = await api<SettingsResult>('/api/settings');
        if (disposed) return;
        const settings = result.settings, profiles = restoredProfiles(settings);
        savedSettings.current = settings;
        setSystemPrompt(profiles.system); setUserProfile(profiles.user);
        setSendKeyMode(settings.ui.send_key_mode); setRightSidebarOpen(settings.ui.right_sidebar_open); setMinimapMode(settings.ui.minimap_mode);
        setStartup({screen:settings.general.startup_screen, reuseModel:settings.general.reuse_model});
        setSettingsWarning(result.warnings.join(' ')); setSettingsStatus(result.warnings.length ? 'warning' : 'ready'); settingsReady.current = true;
        void refresh().then(loaded => { if (!disposed) { setView(settings.general.startup_screen === 'last' && loaded ? 'conversation' : 'start'); setMessage('起動準備ができました'); } }).catch(reason => setError((reason as Error).message));
        void initializeModelConnection().catch(reason => { setModelsChecking(false); setModel(''); setModelError((reason as Error).message); });
      } catch (reason) { if (!disposed) { setSettingsStatus('warning'); setSettingsWarning(`設定を読み込めませんでした。再読込してください: ${(reason as Error).message}`); setModelsChecking(false); } }
    })();
    return () => { disposed = true; settingsReady.current = false; };
  }, []);
  const base = detail ? `/api/conversations/${detail.conversation.conversation_id}` : '';
  const modelConnection: ModelConnectionStatus = modelsChecking || connectionChecking ? 'checking' : modelError || (model && !models.includes(model)) ? 'unavailable' : model ? 'available' : 'unselected';
  return <><div role="status" aria-live="polite">{settingsStatus === 'loading' ? '設定を読み込んでいます…' : settingsWarning}{settingsSaving && ' 設定を保存しています…'}{modelWarning}</div><div className={`normal-chat ${view === 'start' ? 'normal-chat-start' : 'normal-chat-conversation'}${rightSidebarOpen ? '' : ' right-sidebar-is-collapsed'}`}>{view === 'start' ? <>
    {message && <p className="start-screen-status" role="status">{message}</p>}{error && <p className="start-screen-error" role="alert">{error}</p>}
    {collections.warnings.map(warning => <p role="status" className="collection-warning" key={warning}>{warning}</p>)}
    <StartScreen conversations={list} model={model} connection={modelConnection} systemProfile={systemPrompt.enabled ? systemPrompt.preset : 'off'} userProfile={userProfile.enabled ? userProfile.preset : 'off'} disabled={busy} onNewChat={() => void action(() => createConversation())} onOpenConversation={conversationId => void action(() => openConversation(conversationId))} onOpenModelSettings={() => openSettings('model')} onOpenSettings={() => openSettings('general')} />
  </> : <><header className="app-heading"><h1><button type="button" className="brand-button" onClick={() => setView('start')}>Att-Chat</button></h1><div className="app-heading-actions"><span role="status">{message}</span><button disabled={busy} onClick={() => void action(async () => { await refresh(detail?.conversation.conversation_id); setMessage('DBから再読込しました'); })}>再読込</button><button type="button" onClick={() => openSettings('general')}>設定</button></div></header>
    {error && <p className="app-error" role="alert">{error}</p>}
    <div className="layout"><aside aria-label="左Sidebar"><div className="sidebar-tabs" role="tablist" aria-label="左Sidebar表示"><button type="button" role="tab" aria-selected={sidebarTab==='chat'} disabled={busy} onClick={()=>setSidebarTab('chat')}>チャット</button><button type="button" role="tab" aria-selected={sidebarTab==='questions'} disabled={busy} onClick={()=>setSidebarTab('questions')}>質問箱</button></div>{sidebarTab==='chat'?<section className="conversation-sidebar" aria-label="会話一覧"><h2>会話</h2><button type="button" className="conversation-create" disabled={busy} onClick={() => void action(() => createConversation())}>＋ 新規チャット</button>
      <CollectionSidebar conversations={list} currentId={detail?.conversation.conversation_id} result={collections} disabled={busy} onChange={setCollections} onOpen={id => void action(() => openConversation(id))} /></section>:<GlobalQuestionBox reloadToken={reloadToken} disabled={busy} onReturn={returnFromQuestionBox} onAsk={askFromQuestionBox}/>}</aside>
      <main>{!detail ? <p>新規チャットを作成してください。</p> : <><header className="conversation-heading"><ConversationTitle title={detail.conversation.title} disabled={busy} onSave={renameConversation} /><HandoffOrigin detail={detail} conversations={list} /></header>
        {developer.storageTools && <details className="developer-tools"><summary>保存確認用操作</summary>
        <label>User本文<textarea value={content} onChange={e => setContent(e.target.value)} disabled={busy} /></label>
        <button disabled={busy || !content.trim()} onClick={() => void action(async () => { await api(`${base}/turns`, { content }); await refresh(detail.conversation.conversation_id); setContent(''); setMessage('User発言を保存しました'); })}>User Turn追加</button>
        <label>回答対象のUser発言<select value={userId} disabled={busy} onChange={e => setUserId(e.target.value)}><option value="">User発言を選択</option>{detail.turns.filter(t => t.role === 'user').map(t => <option key={t.turn_id} value={t.turn_id}>#{t.sequence_no} {t.content.slice(0, 60)}</option>)}</select></label>
        <label>仮Assistant本文<textarea value={reply} onChange={e => setReply(e.target.value)} disabled={busy} /></label>
        <button disabled={busy || !userId || !reply.trim()} onClick={() => void action(async () => { await api(`${base}/mock-runs`, { user_turn_id: userId, content: reply }); await refresh(detail.conversation.conversation_id); setMessage('仮Assistant発言とRunを保存しました'); })}>仮Assistant Turn追加</button>
        </details>}<div className="normal-markers"><MarkedTurns key={detail.conversation.conversation_id} conversationId={detail.conversation.conversation_id} turns={detail.turns} reloadToken={reloadToken} runs={detail.runs} onAsk={(keep,newConversation=false)=>setQuestion({...keep,newConversation,sourceConversationId:detail.conversation.conversation_id})} sending={busy || detail.runs.some(r => ['preparing','running'].includes(r.outcome))} onRelatedJump={relatedJump} onImmediatePrepared={draft=>{const result=upsertImmediateAskDraft(immediateDrafts,draft);setImmediateDrafts(result.items);setMessage(result.accepted?(result.replaced?'同じMarkerの質問を置き換えました。':'Marker質問を参照中へ追加しました。'):'Marker質問は5件までです。');return result.accepted}} onKeepCreated={()=>{setReloadToken(value=>value+1);setMessage('Question Keepを質問箱へ保存しました。')}} markerJump={questionReturn?.conversationId===detail.conversation.conversation_id&&questionReturn.highlightStatus==='resolved'?{highlightId:questionReturn.highlightId,request:questionReturn.request}:null} onMarkerJumpResult={found=>setMessage(found?'該当Markerへ移動しました。':'元のTurnへ移動しました。Marker位置を確認できません。')} compact minimapMode={minimapMode} onMinimapModeChange={changeMinimapMode} minimapHost={minimapHost} showMarkerManagement={developer.markerManagement} onQuickMemo={text=>rightSidebarController.current?.addMemo(text) ?? Promise.reject(new Error('Quickメモを開けませんでした'))} onQuickDictionary={text=>rightSidebarController.current?.openDictionary(text) ?? Promise.reject(new Error('Quick辞書を開けませんでした'))} /></div>
<Chat normalLayout settingsEnabled settingsModelHost={settingsModelHost} onOpenSettings={() => openSettings('model')} modelOptions={models} selectedModel={model} onSelectedModelChange={selectModel} generationReady={settingsReady.current && !modelsChecking && !connectionChecking && !modelError && models.includes(model)} onRefreshModels={refreshModels} modelLoadError={modelError} sendKeyMode={sendKeyMode} systemPrompt={systemPrompt} userProfile={userProfile} detail={detail} refresh={async id => { await refresh(id ?? detail.conversation.conversation_id); }} onBusy={setBusy} question={question} onCloseQuestion={() => setQuestion(null)} immediateDrafts={immediateDrafts} onChangeImmediateDraft={(highlightId,value)=>setImmediateDrafts(current=>current.map(item=>item.highlightId===highlightId?{...item,question:value}:item))} onClearImmediateDraft={highlightId=>setImmediateDrafts(current=>current.filter(item=>item.highlightId!==highlightId))} onImmediateSent={()=>setImmediateDrafts([])} />
        {developer.runDetails && <details className="run-details"><summary>Run詳細</summary>{detail.runs.map(r => <section key={r.run_id}>
          <p>{r.outcome} · {r.provider} · {r.run_id}</p>
          {r.error && <p>{String(r.error.message ?? r.error.code)}</p>}
          {r.retry_of_run_id && <p>再試行元: {r.retry_of_run_id}</p>}
          {r.keep_id && <><p>Question Keep由来: {r.keep_id}</p><p>確定質問: {r.user_question}</p><details><summary>送信時の引用</summary><pre>{JSON.stringify(r.reference_snapshot,null,2)}</pre></details></>}
          {r.marker_references?.length && <details><summary>Immediate Ask参照 {r.marker_references.length}件</summary><pre>{JSON.stringify(r.marker_references,null,2)}</pre></details>}
          {r.kind === 'mock' && <button disabled={busy || !reply.trim()} onClick={() => void action(async () => { await api(`${base}/runs/${r.run_id}/retry`, { content: reply }); await refresh(detail.conversation.conversation_id); setMessage('新しいAssistant発言とRunで再試行を保存しました'); })}>このRunを仮再試行</button>}
          <details><summary>保存済みスナップショット</summary><pre>{JSON.stringify(r.request_snapshot, null, 2)}</pre></details>
        </section>)}</details>}</>}
      </main><RightSidebar ref={rightSidebarController} open={rightSidebarOpen} onOpenChange={setRightSidebarOpen} onExplicitOpenChange={value => persist({ui:{right_sidebar_open:value}}, () => setRightSidebarOpen(value))} onMiniMapHost={setMinimapHost} /></div></>}
      {settingsReady.current && <SettingsShell saving={settingsSaving} open={settingsOpen} section={settingsSection} onSection={setSettingsSection} onClose={() => setSettingsOpen(false)} developer={developer} onDeveloper={setDeveloper} onModelHost={setSettingsModelHost} startup={startup} onStartup={value => persist({general:{startup_screen:value.screen,reuse_model:value.reuseModel}}, () => setStartup(value))} sendKeyMode={sendKeyMode} onSendKeyMode={value => persist({ui:{send_key_mode:value}}, () => setSendKeyMode(value))} systemPrompt={systemPrompt} onSystemPrompt={value => saveSettings({profiles:{system:savedProfile(value)}}, settings => setSystemPrompt(restoredProfiles(settings).system))} userProfile={userProfile} onUserProfile={value => saveSettings({profiles:{user:savedProfile(value)}}, settings => setUserProfile(restoredProfiles(settings).user))} />}
      {settingsModelHost && createPortal(<ModelSettingsControls models={models} model={model} busy={busy || settingsSaving || modelsChecking || connectionChecking} error={modelError} connectionMode={connectionMode} appliedMode={appliedConnectionMode} draftBaseUrl={draftBaseUrl} appliedBaseUrl={appliedBaseUrl} connectionStatus={modelConnection} onConnectionModeChange={chooseConnectionMode} onDraftBaseUrlChange={setDraftBaseUrl} onCheckConnection={() => applyModelConnection('lm_studio_advanced')} onModelChange={selectModel} onRefresh={() => void refreshModels()} />, settingsModelHost)}
    </div></>;
}
const appRoot = document.getElementById('root');
if (appRoot) createRoot(appRoot).render(<App />);
