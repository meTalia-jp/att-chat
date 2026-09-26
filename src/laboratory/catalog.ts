import type { ExperimentStatus } from './run-contracts.ts';
export type ExperimentDefinition = {
  schema_version: 1;
  id: string; title: string; kind: 'example' | 'existing-experiment';
  status: ExperimentStatus; version: string; runnable: boolean;
  purpose: string; hypothesis: string; equipment: string[];
  execution: { kind: 'interactive'; entry: string } | null;
  derived_from: { id: string; version: string } | null;
  procedure: string[]; acceptance: string[];
  // Older definition snapshots predate document references.
  document_path?: string;
};
export const experiments: readonly (ExperimentDefinition & { document_path: string })[] = [
  { schema_version:1, derived_from:null, procedure:['会話を選択してセッション開始','ChatとMarker操作','セッション終了後Resultsで確認'], acceptance:['Chat・Marker・miniMAP・jumpの再利用','セッション記録と復元'], id:'simple-marker-chat',title:'Simple Marker Chat',kind:'example',status:'TESTING',version:'0.1',runnable:true,
    purpose:'既存部品で最小のMarker付きChatを構成する',
    document_path:'docs/laboratory-phase2-simple-marker-chat.md',
    hypothesis:'Chat・Marker・miniMAPを複製せず専用画面を構成できる',
    equipment:['Local LLM','Conversation / Turn','Marker','Marker List','miniMAP'],
    execution:{kind:'interactive',entry:'simple-marker-chat'} },
  { schema_version:1, derived_from:null, procedure:['モデルと入力を指定','GenerateまたはStop','Resultsで出力確認'], acceptance:['テキスト生成','停止','Run保存','Conversation非依存'], id:'single-text-generation',title:'Single Text Generation',kind:'example',status:'TESTING',version:'0.1',runnable:true,
    purpose:'Conversationなしで単発テキスト生成を行う',
    document_path:'docs/laboratory-phase3-single-text.md',
    hypothesis:'同じLocal LLM接続をChat以外でも利用できる',
    equipment:['Local LLM','Text Input','Output Viewer','Run JSON'],
    execution:{kind:'interactive',entry:'single-text-generation'} },
  { schema_version:1, derived_from:null, procedure:['既存Study P0検証文書を参照'], acceptance:['Record onlyで既存実験を識別できる'], id:'study-p0',title:'Study P0',kind:'existing-experiment',status:'TESTING',version:'P0',runnable:false,
    purpose:'既存のStudy Tutor制御実験を参照する',
    document_path:'docs/study-p0-results.md',
    hypothesis:'Study固有処理を共通化せず独立実験として保持できる',
    equipment:['既存Study P0 runner'],execution:null },
  { schema_version:1, derived_from:null,
    procedure:['Runを開く','同じ文章・一覧・miniMAP条件で5 paletteを比較','評価項目に沿って人間が候補を判断'],
    acceptance:['Currentを採用前の旧本番色として保持','Vivid A / Vivid B / Pastel / High Contrastを同時比較','Marker保存契約を変更しない'],
    id:'marker-color-sample',title:'Marker Color Sample',kind:'example',status:'TESTING',version:'0.1',runnable:true,
    purpose:'Marker表示色を本番採用前に本文・一覧・miniMAP相当で目視比較する',
    document_path:'docs/laboratory/marker-color-sample.md',
    hypothesis:'現在より彩度を上げるとMarker位置を認識しやすくなるが、高彩度すぎる場合は本文可読性を低下させる可能性がある',
    equipment:['Marker color IDs','Visual Sample Workspace'],
    execution:{kind:'interactive',entry:'marker-color-sample'} },
  { schema_version:1, derived_from:null,
    procedure:['Runを開く','左→右ドラッグの終端から右▷へ移動','右Quick MenuのQuick MemoとDictionaryを試す','右端でMenu左反転、下端でSignal上反転とMarker回帰を確認'],
    acceptance:['Signalは選択終端寄せ、Menuは通常右展開','Quick Memoは断片追加、Dictionaryは英単語1語を検索してSignal/Menu/selectionを閉じる','Quick MemoとMarkerを独立して保持','本番Marker/API/DBを変更しない'],
    id:'marker-quick-action-prototype',title:'Marker Quick Action Prototype',kind:'example',status:'TESTING',version:'0.7 (Quick Dictionary v0.1)',runnable:true,
    purpose:'ドラッグ終端→右▷→右Quick Menu→右Sidebarの操作方向と移動距離を評価する',
    document_path:'docs/laboratory/marker-quick-action-prototype.md',
    hypothesis:'Quick系操作を右方向へ統一し、ドラッグ終端近くに入口を配置すると、ポインタ移動を短くし操作方向を学習しやすくなる可能性がある',
    equipment:['Vivid A display tokens','Selection Range','Experiment-local in-memory Marker / Quick Memo'],
    execution:{kind:'interactive',entry:'marker-quick-action-prototype'} },
];
export function canSwitchExperiment(busy: boolean, simpleSession: boolean) { return !busy && !simpleSession; }
