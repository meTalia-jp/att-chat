import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api.ts';
import type { ConversationDetail, GenerationRun } from '../shared/contracts.ts';
import type { QuestionKeep } from '../shared/question-keep.ts';
import type { ImmediateAskDraft } from './MarkerDetailAdapter.tsx';
import {
  productionHandoffLabels,
  productionHandoffLevels,
  type ProductionHandoffLevel,
  type ProductionHandoffPreview,
} from '../shared/production-new-chat-handoff.ts';
import {
  keepContextLabels,
  keepContextLevels,
  type KeepContextLevel,
  type KeepContextPreview,
} from '../shared/production-keep-context.ts';
import { buildImmediateAskUserTurn, immediateAskMaxReferences } from '../shared/production-immediate-ask.ts';
import { ModelSettingsControls } from './ModelSettingsControls.tsx';
import type { SendKeyMode, SystemPromptPreferences, UserProfilePreferences } from './SettingsShell.tsx';

export function resizeComposerTextarea(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = 'auto';
  const contentHeight = element.scrollHeight;
  if (!contentHeight) {
    element.style.height = '';
    element.style.overflowY = 'hidden';
    return;
  }
  element.style.height = `${Math.min(Math.max(contentHeight, 42), 136)}px`;
  element.style.overflowY = contentHeight > 136 ? 'auto' : 'hidden';
}

export function visibleGenerationStatus(outcome: string) {
  return ({ succeeded:'', failed:'生成に失敗しました', cancelled:'キャンセルしました', interrupted:'中断しました', storage_error:'保存に失敗しました' } as Record<string, string>)[outcome] ?? outcome;
}

export function shouldSendComposerKey(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'isComposing'>, mode: SendKeyMode) {
  if (event.key !== 'Enter' || event.isComposing) return false;
  if (mode === 'safe') return event.ctrlKey || event.metaKey;
  return !event.shiftKey;
}

export function Chat({ generationReady = true, detail, refresh, onBusy, question, onCloseQuestion, immediateDrafts = [], onChangeImmediateDraft, onClearImmediateDraft, onImmediateSent, normalLayout = false, settingsEnabled = false, settingsModelHost, onOpenSettings, modelOptions, selectedModel, onSelectedModelChange, onRefreshModels, modelLoadError, sendKeyMode = 'safe', systemPrompt = { enabled:false, preset:'off', text:'' }, userProfile = { enabled:false, preset:'off', text:'' } }: { generationReady?: boolean; normalLayout?: boolean; detail: ConversationDetail; refresh: (id?: string) => Promise<void>; onBusy: (value: boolean) => void; question: (QuestionKeep & { newConversation?: boolean }) | null; onCloseQuestion: () => void; immediateDrafts?: ImmediateAskDraft[]; onChangeImmediateDraft?: (highlightId: string, question: string) => void; onClearImmediateDraft?: (highlightId: string) => void; onImmediateSent?: () => void; settingsEnabled?: boolean; settingsModelHost?: HTMLElement | null; onOpenSettings?: () => void; modelOptions?: readonly string[]; selectedModel?: string; onSelectedModelChange?: (model: string) => void; onRefreshModels?: () => void | Promise<void>; modelLoadError?: string; sendKeyMode?: SendKeyMode; systemPrompt?: SystemPromptPreferences; userProfile?: UserProfilePreferences }) {
  const [internalModels, setInternalModels] = useState<string[]>([]), [internalModel, setInternalModel] = useState('');
  const models = modelOptions ?? internalModels;
  const model = selectedModel ?? internalModel;
  const setModel = onSelectedModelChange ?? setInternalModel;
  const [input, setInput] = useState(''), [text, setText] = useState(''), [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState(''), [status, setStatus] = useState(''), [error, setError] = useState('');
  const lock = useRef(false), request = useRef<{ id: string; input: string; model: string; keepId?: string; newConversation?: boolean; handoffLevel?: ProductionHandoffLevel; contextLevel?: KeepContextLevel; immediateFingerprint?: string; systemPrompt?: string; userProfile?: string } | null>(null);
  const destination = useRef(detail.conversation.conversation_id);
  const panel = useRef<HTMLElement>(null);
  const composerInput = useRef<HTMLTextAreaElement>(null);
  const [quote, setQuote] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [handoffLevel, setHandoffLevel] = useState<ProductionHandoffLevel>('standard');
  const [handoffPreview, setHandoffPreview] = useState<ProductionHandoffPreview | null>(null);
  const [contextLevel, setContextLevel] = useState<KeepContextLevel>('standard');
  const [keepContextPreview, setKeepContextPreview] = useState<KeepContextPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const base = `/api/conversations/${detail.conversation.conversation_id}`;
  const active = detail.runs.find(r => ['preparing','running'].includes(r.outcome));
  async function loadModels() {
    if (onRefreshModels) { await onRefreshModels(); return; }
    try { setError(''); const result = await api<{ models: string[] }>('/api/models'); setInternalModels(result.models); setInternalModel(previous => result.models.includes(previous) ? previous : ''); }
    catch (e) { setInternalModels([]); setInternalModel(''); setError((e as Error).message); }
  }
  useEffect(() => { if (modelOptions === undefined) void loadModels(); }, []);
  useEffect(() => {
    // Keep the same stream owner mounted when a prepared branch becomes selected.
    if (!lock.current) { setInput(''); setText(''); setRunId(''); setStatus(''); setError(''); setHandoffPreview(null); setKeepContextPreview(null); request.current=null; destination.current=detail.conversation.conversation_id; }
  }, [detail.conversation.conversation_id]);
  useEffect(() => {
    if (!question) { setQuote(''); return; }
    setInput(question.question_draft); setQuote(''); setError(''); setHandoffLevel('standard'); setHandoffPreview(null); setContextLevel('standard'); setKeepContextPreview(null); panel.current?.scrollIntoView({block:'start'});
    let disposed = false;
    void api<import('../shared/contracts.ts').Highlight[]>(`${base}/highlights`).then(items => {
      if (disposed) return;
      const h = items.find(item => item.highlight_id === question.highlight_id);
      setQuote(h?.status === 'resolved' ? h.target_text : '');
      if (!h || h.status !== 'resolved') setError('元マーカーが解決不能のため質問できません');
    }).catch(e => { if (!disposed) setError(e.message); });
    return () => { disposed = true; };
  }, [question, base]);
  useEffect(() => { resizeComposerTextarea(composerInput.current); }, [input, normalLayout]);
  async function prepareHandoff() {
    if (!question?.newConversation || !input.trim() || previewBusy) return;
    setPreviewBusy(true); setError(''); setStatus('Preview確認中');
    try {
      const preview = await api<ProductionHandoffPreview>(`${base}/question-keeps/${question.keep_id}/handoff-preview`, { user_question: input, handoff_level: handoffLevel });
      setHandoffPreview(preview); setStatus('Previewを作成しました。Conversationはまだ作成していません。');
    } catch (error) { setHandoffPreview(null); setStatus(''); setError((error as Error).message); }
    finally { setPreviewBusy(false); }
  }
  async function prepareKeepContext() {
    if (!question || question.newConversation || !input.trim() || previewBusy) return;
    setPreviewBusy(true); setError(''); setStatus('Preview確認中');
    try {
      const preview = await api<KeepContextPreview>(`${base}/question-keeps/${question.keep_id}/context-preview`, { user_question: input, context_level: contextLevel });
      setKeepContextPreview(preview); setStatus('Context Previewを作成しました。KeepとRunは変更していません。');
    } catch (error) { setKeepContextPreview(null); setStatus(''); setError((error as Error).message); }
    finally { setPreviewBusy(false); }
  }
  async function send() {
    const immediate = !question && immediateDrafts.length > 0;
    const immediateReady = immediate && immediateDrafts.length <= immediateAskMaxReferences && immediateDrafts.every(item=>item.question.trim());
    if (!generationReady || lock.current || active || !model || (!input.trim() && !immediate) || (immediate && !immediateReady) || (question?.newConversation ? !handoffPreview : !!question && !keepContextPreview)) return;
    lock.current = true; setBusy(true); onBusy(true); setText(''); setError(''); setStatus('準備中');
    destination.current=detail.conversation.conversation_id;
    const immediateFingerprint=immediate?JSON.stringify(immediateDrafts.map(item=>[item.highlightId,item.prefix,item.question])):undefined;
    const appliedSystemPrompt=systemPrompt.enabled && systemPrompt.text.trim() ? systemPrompt.text : undefined;
    const appliedUserProfile=userProfile.enabled && userProfile.text.trim() ? userProfile.text : undefined;
    if (normalLayout) setSubmitted(immediate?buildImmediateAskUserTurn(input,immediateDrafts.map(item=>({prefix:item.prefix,target_text:item.quote,question_text:item.question}))):input);
    if (!request.current || request.current.input !== input || request.current.model !== model || request.current.keepId !== question?.keep_id || request.current.newConversation !== question?.newConversation || request.current.handoffLevel !== (question?.newConversation ? handoffLevel : undefined) || request.current.contextLevel !== (question && !question.newConversation ? contextLevel : undefined) || request.current.immediateFingerprint!==immediateFingerprint || request.current.systemPrompt!==appliedSystemPrompt || request.current.userProfile!==appliedUserProfile) request.current = { id: crypto.randomUUID(), input, model, keepId: question?.keep_id, newConversation: question?.newConversation, handoffLevel: question?.newConversation ? handoffLevel : undefined, contextLevel: question && !question.newConversation ? contextLevel : undefined, immediateFingerprint, systemPrompt:appliedSystemPrompt, userProfile:appliedUserProfile };
    let prepared = false;
    try {
      const path=question?`${base}/question-keeps/${question.keep_id}/${question.newConversation?'handoff-new':'ask'}`:immediate?`${base}/immediate-ask`:`${base}/chat`;
      const payload=question?{user_question:input,...(question.newConversation?{handoff_level:handoffLevel}:{context_level:contextLevel})}:immediate?{main_draft:input,marker_questions:immediateDrafts.map(item=>({highlight_id:item.highlightId,prefix:item.prefix,question_text:item.question}))}:{content:input};
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, ...(appliedSystemPrompt ? { system_prompt:appliedSystemPrompt } : {}), ...(appliedUserProfile ? { user_profile:appliedUserProfile } : {}), model, request_id: request.current.id }) });
      if (!res.ok) { const value = await res.json(); throw new Error(value.error?.message ?? `HTTP ${res.status}`); }
      if (!res.body) throw new Error('streamがありません');
      const reader = res.body.getReader(), decoder = new TextDecoder(); let buffer = '', terminal = false;
      try {
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          let end;
          while ((end = buffer.indexOf('\n')) >= 0) {
            const event = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
            if (event.type === 'prepared') {
              prepared = true; const saved=event.run as GenerationRun;
              destination.current=saved.conversation_id; setRunId(saved.run_id); setInput('');
              if(immediate)onImmediateSent?.();
              if (question?.newConversation) setHandoffPreview(null);
              else if (question) setKeepContextPreview(null);
              if (question?.newConversation) {
                onCloseQuestion();
                try { await refresh(saved.conversation_id); }
                catch (e) { setError(`分岐先 ${saved.conversation_id} の表示更新失敗: ${(e as Error).message}`); }
              }
            }
            if (event.type === 'running') setStatus(question ? question.newConversation ? '生成中 — 元Keepの状態は変更しません' : '生成中 — Keepは質問送信開始済み（asked）' : immediate ? `生成中 — Immediate Ask ${immediateDrafts.length}件` : '生成中');
            if (event.type === 'delta') setText(t => t + event.text);
            if (event.type === 'terminal') { terminal = true; setStatus(visibleGenerationStatus(event.outcome)); if (event.outcome === 'failed') setError(event.message); }
            if (event.type === 'storage_error') throw new Error(event.message);
          }
        }
        if (!terminal) throw new Error('終了確認前に接続が切れました。再読込で状態を確認してください。');
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    } catch (e) { setStatus('成功未確認'); setError((e as Error).message); }
    finally {
      try { await refresh(destination.current); if (normalLayout) { setText(''); setSubmitted(''); } } catch (e) { setError(`DB再取得失敗: ${(e as Error).message}`); }
      if (prepared) { request.current = null; onCloseQuestion(); }
      setBusy(false); onBusy(false); setRunId(''); lock.current = false;
    }
  }
  async function stop() {
    try { const r = await api<GenerationRun>(`/api/conversations/${runId ? destination.current : detail.conversation.conversation_id}/runs/${runId || active?.run_id}/cancel`, {}); setStatus(visibleGenerationStatus(r.outcome)); await refresh(r.conversation_id); }
    catch (e) { setError((e as Error).message); }
  }
  const modelControls = <ModelSettingsControls models={models} model={model} busy={busy || !!active} error={modelLoadError} onModelChange={setModel} onRefresh={() => void loadModels()} />;
  return <section ref={panel} className={normalLayout ? "normal-chat-input" : undefined}><div className="chat-controls"><h3>{question ? `${question.newConversation ? '新規チャットへ引継ぐ' : 'このチャットで聞く'} — 質問の確認` : 'LM Studioチャット'}</h3>
    {question && <><blockquote>{quote}</blockquote><p>{question.newConversation ? '選択したTurn範囲を最初のUser Message内へ埋め込みます。元会話をmessage履歴として送りません。' : '選択した前方TurnとTargetを最初のUser Message内へ埋め込みます。元会話全履歴をmessage配列へ追加しません。'}</p><button disabled={busy} onClick={() => { onCloseQuestion(); setInput(''); setHandoffPreview(null); setKeepContextPreview(null); }}>質問確認を閉じる</button></>}
    {settingsEnabled ? <button type="button" className="current-model" disabled={busy} onClick={onOpenSettings}>モデル: {model || '未選択'}</button> : modelControls}
    {question?.newConversation && <fieldset className="production-handoff-level"><legend>引継ぎ量</legend>{productionHandoffLevels.map(level => <label key={level}><input type="radio" name="production-handoff-level" checked={handoffLevel === level} disabled={busy || !!active || previewBusy} onChange={() => { setHandoffLevel(level); setHandoffPreview(null); request.current=null; }} />{productionHandoffLabels[level]}{level === 'standard' && <small>（初期値・前3 Turn + Target）</small>}</label>)}<p>少なめは前1 Turn、標準は前3 Turn、多めは前5 TurnとTargetを使います。質問に必要な思考の流れを機械的に近似する初期値です。</p></fieldset>}
    {question && !question.newConversation && <fieldset className="production-handoff-level"><legend>引継ぎContext</legend>{keepContextLevels.map(level => <label key={level}><input type="radio" name="production-keep-context-level" checked={contextLevel === level} disabled={busy || !!active || previewBusy} onChange={() => { setContextLevel(level); setKeepContextPreview(null); request.current=null; }} />{keepContextLabels[level]}{level === 'standard' && <small>（初期値・前3 Turn + Target）</small>}</label>)}<p>未来側Turnは含めません。固定Turn数は質問に必要な思考の流れを機械的に近似する初期値です。</p></fieldset>}
    <label>{question ? '送信する質問文' : 'チャット本文'}<textarea ref={composerInput} rows={1} value={input} maxLength={question ? 10000 : 100000} disabled={busy || !!active} onKeyDown={event => { if (!shouldSendComposerKey({ key:event.key, ctrlKey:event.ctrlKey, metaKey:event.metaKey, shiftKey:event.shiftKey, isComposing:event.nativeEvent.isComposing }, sendKeyMode)) return; event.preventDefault(); void send(); }} onChange={e => { setInput(e.target.value); if(question?.newConversation)setHandoffPreview(null);else if(question)setKeepContextPreview(null);if(question)request.current=null; }} /></label>
    {normalLayout && !question && immediateDrafts.length > 0 && <section className={`immediate-reference-foundation immediate-reference-count-${Math.min(immediateDrafts.length, 3)}`} aria-label="参照中"><header><strong>参照中</strong><small>{immediateDrafts.length}/{immediateAskMaxReferences}件</small></header><div className="immediate-reference-list">{immediateDrafts.map(item=><article key={item.highlightId}><span className="immediate-reference-dot" aria-hidden="true" /><div><small>T{item.turnNumber} [{item.prefix}]「{item.quote}」</small><input aria-label={`Immediate Ask質問 T${item.turnNumber}`} value={item.question} disabled={busy} onChange={event => onChangeImmediateDraft?.(item.highlightId,event.target.value)} /></div><button type="button" aria-label={`T${item.turnNumber} Marker参照を外す`} disabled={busy} onClick={()=>onClearImmediateDraft?.(item.highlightId)}>×</button></article>)}</div></section>}
    {question && <button type="button" disabled={busy || !!active || previewBusy || !input.trim() || !quote} onClick={() => question.newConversation ? void prepareHandoff() : void prepareKeepContext()}>{previewBusy ? 'Preview確認中…' : 'Preview'}</button>}
    {handoffPreview && <section className="production-handoff-preview" aria-label="New Chat Handoff Preview"><details open><summary><strong>New Chat Handoff Preview</strong><small>折りたたみ可能</small></summary><div className="production-preview-body"><dl><dt>Source Turn</dt><dd>T{handoffPreview.source_turn_number}</dd><dt>引継ぎ</dt><dd>{productionHandoffLabels[handoffPreview.handoff_level]}</dd><dt>Included Turns</dt><dd>{handoffPreview.included_turns.length ? handoffPreview.included_turns.map(turn => `T${turn.turn_number}`).join(', ') : 'なし'}</dd></dl><pre>{handoffPreview.display_first_user_message}</pre><button type="button" disabled={busy} onClick={() => setHandoffPreview(null)}>戻る</button></div></details></section>}
    {keepContextPreview && <section className="production-handoff-preview" aria-label="Keep Context Preview"><details open><summary><strong>Keep Context Preview</strong><small>折りたたみ可能</small></summary><div className="production-preview-body"><dl><dt>Source Turn</dt><dd>T{keepContextPreview.source_turn_number}</dd><dt>Context</dt><dd>{keepContextLabels[keepContextPreview.context_level]}</dd><dt>Included Turns</dt><dd>{keepContextPreview.included_turns.map(turn => `T${turn.turn_number}`).join(', ')}</dd></dl><pre>{keepContextPreview.first_user_message}</pre><button type="button" disabled={busy} onClick={() => setKeepContextPreview(null)}>戻る</button></div></details></section>}
    <button disabled={!generationReady || busy || !!active || !model || (!input.trim() && !immediateDrafts.length) || (!question && immediateDrafts.some(item=>!item.question.trim())) || (!!question && !quote) || (!!question?.newConversation && !handoffPreview) || (!!question && !question.newConversation && !keepContextPreview)} onClick={() => void send()}>{question?.newConversation ? '新規チャットとして送信' : '送信'}</button>
    <button className="stop-control" disabled={!runId && !active} onClick={() => void stop()}>停止</button>
    {normalLayout && !settingsEnabled && <button type="button" disabled>設定（準備中）</button>}
    <p role="status">{status || (active ? '生成中Runがあります' : '')}</p>{error && <p role="alert">{error}</p>}
    </div>
    {settingsEnabled && settingsModelHost && modelOptions === undefined && createPortal(modelControls, settingsModelHost)}
    {normalLayout && submitted && <pre aria-label="送信した本文">{submitted}</pre>}
    {text && <pre aria-label="streaming本文">{text.replace(/\r\n?/g, '\n')}</pre>}
  </section>;
}
