export const handoffPastPresets = [300, 800, 1500] as const;
export const handoffExperimentalPast = [300, 500, 800, 1100, 1500] as const;
export const handoffExperimentalFuture = [0, 300, 800] as const;

export type HandoffPast = typeof handoffExperimentalPast[number];
export type HandoffFuture = typeof handoffExperimentalFuture[number];

export type HandoffSource = {
  conversationId: string;
  conversationTitle: string;
  turnId: string;
  turnNumber: number;
  markerId: string;
  markerSourceText: string;
  questionDraft: string;
  sourceTurnText?: string;
  markerStartOffset?: number;
  markerEndOffset?: number;
  unresolved?: boolean;
};

export type NewChatHandoffPreview = {
  kind: 'draft-new-conversation';
  sourceConversation: string;
  sourceConversationId: string;
  sourceTurn: string;
  markerId: string;
  markerSourceText: string;
  questionDraft: string;
  handoff: boolean;
  handoffLevel: string;
  requestedPastUtf16: number;
  requestedFutureUtf16: number;
  pastContextUtf16: number;
  futureContextUtf16: number;
  range: { start: number; end: number } | null;
  marker: { startOffset: number | null; endOffset: number | null; status: 'resolved' | 'unresolved' };
  finalFirstUserMessage: string;
};

export type PreviewResult =
  | { status: 'ready'; preview: NewChatHandoffPreview; warning?: string }
  | { status: 'blocked'; warning: string };

export const newChatHandoffGeneration = {
  model: 'google/gemma-4-12b-qat', temperature: 0, max_tokens: 2048, stream: true as const,
};
export const newChatHandoffSystemPrompt = '引用された箇所を質問対象として、日本語で質問に直接答えてください。最初のUser Messageに含まれる情報だけを新しい会話の前提として扱い、過去会話の履歴が別に存在すると仮定しないでください。対象を特定できない場合は断定せず、不足を述べてください。';

export type NewChatHandoffSendInput = {
  sourceConversation: string; sourceConversationId: string; sourceTurn: string;
  markerId: string; markerSourceText: string; markerStatus: 'resolved' | 'unresolved';
  handoff: boolean; handoffLevel: string; pastContextUtf16: number; futureContextUtf16: number;
  finalFirstUserMessage: string;
};

export type NewChatHandoffRun = NewChatHandoffSendInput & {
  temporaryConversationId: string; firstUserMessage: string; assistantResponse: string;
  model: string; generationSettings: { temperature: number; max_tokens: number };
  messageRoles: ['system', 'user']; oldConversationMessageCount: 0;
  finishReason: 'stop' | 'length' | null; error: string | null;
  startedAt: string; completedAt: string; sourcePositionUnresolved: boolean;
  humanReview: 'pending';
};

export function buildNewChatHandoffRequest(firstUserMessage: string) {
  return {...newChatHandoffGeneration, messages: [
    {role:'system' as const, content:newChatHandoffSystemPrompt},
    {role:'user' as const, content:firstUserMessage},
  ]};
}

const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });

function boundaries(text: string) {
  return [0, ...Array.from(segmenter.segment(text), part => part.index + part.segment.length)];
}

function inwardRange(text: string, markerStart: number, markerEnd: number, past: number, future: number) {
  const points = boundaries(text);
  const rawStart = Math.max(0, markerStart - past);
  const rawEnd = Math.min(text.length, markerEnd + future);
  const start = points.find(point => point >= rawStart)!;
  const end = points.filter(point => point <= rawEnd).at(-1)!;
  return { start, end };
}

export function handoffLevelLabel(past: number) {
  if (past === 300) return '少なめ';
  if (past === 800) return '標準';
  if (past === 1500) return '多め';
  return `Experimental ${past}`;
}

export function buildNewChatHandoffPreview(source: HandoffSource, handoff: boolean, past: HandoffPast, future: HandoffFuture): PreviewResult {
  if (!handoff) {
    return {
      status: 'ready',
      warning: source.unresolved ? 'Marker位置未解決。保存済みMarker本文だけを使用します。' : undefined,
      preview: {
        kind: 'draft-new-conversation', sourceConversation: source.conversationTitle,
        sourceConversationId: source.conversationId, sourceTurn: `T${source.turnNumber}`,
        markerId: source.markerId, markerSourceText: source.markerSourceText,
        questionDraft: source.questionDraft, handoff: false, handoffLevel: 'なし',
        requestedPastUtf16: 0, requestedFutureUtf16: 0, pastContextUtf16: 0,
        futureContextUtf16: 0, range: null,
        marker: { startOffset: source.markerStartOffset ?? null, endOffset: source.markerEndOffset ?? null, status: source.unresolved ? 'unresolved' : 'resolved' },
        finalFirstUserMessage: `[参照箇所]\n${source.markerSourceText}\n\n[質問]\n${source.questionDraft}`,
      },
    };
  }

  if (source.unresolved) return { status: 'blocked', warning: 'Marker位置未解決のため、引継ぎContextを作成できません。自動re-anchorは行いません。' };
  const text = source.sourceTurnText;
  const startOffset = source.markerStartOffset;
  const endOffset = source.markerEndOffset;
  if (text === undefined || startOffset === undefined || endOffset === undefined ||
      startOffset < 0 || endOffset < startOffset || endOffset > text.length ||
      text.slice(startOffset, endOffset) !== source.markerSourceText) {
    return { status: 'blocked', warning: '保存されたMarker座標とSource Turnが一致しないため、引継ぎContextを作成できません。' };
  }
  const points = new Set(boundaries(text));
  if (!points.has(startOffset) || !points.has(endOffset)) {
    return { status: 'blocked', warning: 'Marker座標がgrapheme境界と一致しません。' };
  }
  const range = inwardRange(text, startOffset, endOffset, past, future);
  const context = text.slice(range.start, range.end);
  const markerRelativeStart = startOffset - range.start;
  const markedContext = context.slice(0, markerRelativeStart) + '【参照箇所開始】' + source.markerSourceText + '【参照箇所終了】' + context.slice(markerRelativeStart + source.markerSourceText.length);
  return {
    status: 'ready',
    preview: {
      kind: 'draft-new-conversation', sourceConversation: source.conversationTitle,
      sourceConversationId: source.conversationId, sourceTurn: `T${source.turnNumber}`,
      markerId: source.markerId, markerSourceText: source.markerSourceText,
      questionDraft: source.questionDraft, handoff: true, handoffLevel: handoffLevelLabel(past),
      requestedPastUtf16: past, requestedFutureUtf16: future,
      pastContextUtf16: startOffset - range.start, futureContextUtf16: range.end - endOffset,
      range, marker: { startOffset, endOffset, status: 'resolved' },
      finalFirstUserMessage: `## 前の会話からの引継ぎ\n\n[前提文脈]\n${markedContext}\n\n[参照箇所]\n${source.markerSourceText}\n\n[質問]\n${source.questionDraft}`,
    },
  };
}

// Question Box専用の固定fixture。Marker前後の各Levelを実際の文字数で確認する。
export const questionBoxHandoffSource =
  '会話の前提として、利用者は既存仕様と試験範囲を区別しています。'.repeat(54) +
  'ここから対象Turnの判断条件を整理します。' +
  '月がきれいですね' +
  '。この後には別の補足説明が続きます。未来側はExperimentalで明示した場合だけ利用します。'.repeat(20);

export const questionBoxHandoffMarkerStart = questionBoxHandoffSource.indexOf('月がきれいですね');

// A second fixed Keep for v0.2. The prerequisite is deliberately farther back
// than the local explanation so 300 / 800 / 1500 remain observably different.
export const questionBoxHandoffPrerequisiteSource =
  '数値計算では、連続な運動を離散的な時刻へ置き換えて近似します。'.repeat(18) +
  'ここでは陽的オイラー法を使い、微分方程式の傾きを各ステップの始点だけで評価します。局所打切り誤差は二次でも、それが多数のステップで累積するため大域誤差の次数は一つ下がります。' +
  '計算量や安定性についての別の注意事項です。刻み幅を小さくすると計算回数が増え、問題によっては不安定性も検討する必要があります。'.repeat(8) +
  'この結果として、誤差は一次です' +
  '。高次のRunge–Kutta法との比較は別の節で扱います。';
export const questionBoxHandoffPrerequisiteMarker = '誤差は一次です';
export const questionBoxHandoffPrerequisiteStart = questionBoxHandoffPrerequisiteSource.indexOf(questionBoxHandoffPrerequisiteMarker);

export const newChatHandoffExperimentSources: readonly HandoffSource[] = [
  {
    conversationId:'quick-action-fixture', conversationTitle:'Conversation A', turnId:'fixture-turn-25', turnNumber:25,
    markerId:'ask-fixture-2', markerSourceText:'月がきれいですね', questionDraft:'この表現が好意を伝えるのはなぜですか？',
    sourceTurnText:questionBoxHandoffSource, markerStartOffset:questionBoxHandoffMarkerStart,
    markerEndOffset:questionBoxHandoffMarkerStart+'月がきれいですね'.length,
  },
  {
    conversationId:'question-box-b', conversationTitle:'Conversation B', turnId:'box-b-turn-8', turnNumber:8,
    markerId:'box-marker-d', markerSourceText:questionBoxHandoffPrerequisiteMarker, questionDraft:'なぜ一次精度になるのですか？',
    sourceTurnText:questionBoxHandoffPrerequisiteSource, markerStartOffset:questionBoxHandoffPrerequisiteStart,
    markerEndOffset:questionBoxHandoffPrerequisiteStart+questionBoxHandoffPrerequisiteMarker.length,
  },
] as const;
