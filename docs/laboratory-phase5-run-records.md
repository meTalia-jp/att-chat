# Laboratory Phase 5 — Experiment / ExperimentRun記録

## 目的と判定

Experiment（何を検証するか）とExperimentRun（一度の実行記録）を分離した。
Simple Marker ChatとSingle Text GenerationをLaboratory Resultsから追跡できる。
Phase 5合格。Laboratory v0.1の完成判定・全体レビューへ進める状態である。
配布や次Phaseを実装済みという意味ではない。commit / push / tagは行っていない。

## 変更ファイル（Phase 4作業状態からの差分）

新規：

- `src/laboratory/run-contracts.ts`：最小共通メタデータとSimple固有型
- `src/laboratory/provenance.ts`：既存Git情報取得の抽出
- `src/laboratory/simple-sessions.ts`：Simpleの開始・終了・復旧
- `src/laboratory/RunResults.tsx`：Run一覧と既存データへの導線
- `tests/laboratory-runs.test.ts`：保存失敗、snapshot、復旧テスト
- 本文書

変更：

- `src/laboratory/catalog.ts`：Experiment status型を定義
- `src/laboratory/Laboratory.tsx`：セッション予約・復元・明示終了とResults
- `src/laboratory/server.ts`：固定の記録API、セッション制約、終了時整理
- `src/laboratory/single-text/contracts.ts`：共通メタデータ型を参照（JSON形式は同じ）
- `src/laboratory/single-text/run-files.ts`：既存原子的JSON書込みをSimpleにも利用できる型・experiment ID指定を追加
- `src/laboratory/single-text/service.ts`：Git情報取得だけ共通関数へ移動
- `src/client/SimpleMarkerChat.tsx`：会話固定・Chatなしの保存会話表示を追加。単独起動時の既定動作は維持
- `tests/laboratory.test.ts`：セッション付きgateway、世代ID参照、停止・失敗・再起動
- `tests/laboratory-ui.test.ts`：保存を伴う開始・終了、Resultsと出力導線

## 状態と共通契約

Experiment statusはIDEA / DRAFT / TESTING / PARTIAL / ADOPTED / REJECTED / PAUSED / SUPERSEDED。
固定登録の現在値はTESTINGのまま。

Run statusはrunning / completed / failed / cancelled / interrupted。
idleはUIの未実行状態であり保存しない。
Validationはnot_run / passed / failedで、今回の生成成功はpassedに変換しない。

共通項目はschema_version、run_id、experiment_id、experiment_version、started_at、finished_at、status、validation_status、source_commit、dirty_state、experiment_snapshot。
Single固有のrequest_body・input/output snapshot・partial_output・model・settingsはそのまま保持する。
共通Runner、共通実行状態機械、統一DBは作っていない。

## Simpleセッション

1. 会話を選ぶ。新規会話が必要なら既存Conversation APIで先に作成する。
2. 明示的な「セッションを開始」でJSONのrunning記録を保存する。
3. 保存成功後に既存Simple Marker Chatを表示する。失敗時は表示・実験開始しない。
4. セッション中は1会話に固定する。各生成は既存SQLiteのGenerationRun。
5. 個別のfailed / cancelledでもセッションはrunningのまま。
6. 生成中は終了不可。明示的終了の保存に成功した場合だけcompletedへ遷移する。

Simple固有項目：conversation_id、generation_run_ids、initial_generation_run_ids、provider、provider_base_url、models。
開始時の既存GenerationRun IDをinitial_generation_run_idsとして保存し、それを除外したIDをセッションの関連IDとして扱う。
これにより同じ会話で二度目のセッションを開始しても、前回の生成を重複計上しない。
GenerationRun本文・request snapshot・Turnはコピーしない。modelsは関連Runのmodel_idの重複を除いた情報。
未生成の場合modelsは空配列。

各生成応答の終了時にID参照をcheckpoint保存する。失敗しても元のrunning記録とSQLiteは残り、Results取得時に再試行して書込み不能ならエラーを表示する。
明示終了の保存失敗ではセッションを終了せず、再試行可能とする。
終了済みRunは後続セッション開始・復旧時に書き換えない。

## 保存・復旧

標準保存先は`data/laboratory/`（LAB_DATAで変更可能）。

- `simple-marker.sqlite`：Conversation / Turn / GenerationRun / Highlightの正
- `simple-session-runs/<run_id>.json`：Simpleセッション補助記録
- `single-text-runs/<run_id>.json`：既存Single記録

既存RunFilesの所有ロック、temp書込み、fsync、renameを共用する。Singleの既存JSONを移行・書き換える処理は追加していない。
Simpleの生成履歴とJSONは単一トランザクションではないため、開始時ID集合を使ってSQLiteから関連IDを復元する。
専用SQLiteとJSONディレクトリをセットで保管する必要がある。

起動時にCoreの未終了GenerationRunを既存処理で整理し、Simpleのrunning JSONをinterruptedへ整理する。関連ID・modelsはSQLiteから補完する。
正常なサーバー終了時にも、明示終了されていないSimpleセッションをinterruptedとする。
Singleのcheckpoint / failed / cancelled / interrupted / storage_error処理は既存実装を維持。
再起動後の自動再送・自動セッション再開はしない。
サーバーを終了せずページだけ再読込した場合はcurrentセッションを取得して復帰する。

## SnapshotとGit情報

Simpleは開始時のCatalog定義をコピーして保存する。後からCatalogが変わっても過去snapshotは変わらない。
SingleはPhase 3のExperiment定義snapshotをそのまま維持し、旧Runも同じ形式で読める。
両者の定義の詳細項目は無理に統一しない。
Git情報取得不能時はnull。dirty=trueは未コミット差分全体の完全再現を保証しない。

## Results / API

- Simple：Run ID、status、日時、会話ID、生成数、models、validation、実験定義・Git出典、対応会話表示
- Single：既存JSON一覧、status、日時、model、validation、実験定義・Git出典、確定出力または部分出力・error
- Study：Record onlyの既存表示を維持

固定loopback API：GET `/api/laboratory/sessions/current`、GET `/api/laboratory/runs/simple`、GET `/api/laboratory/runs/single`、POST `/api/laboratory/sessions`、POST `/api/laboratory/sessions/:id/finish`。
公開サーバー用APIではない。Host / Origin検証を維持。
Laboratory経由のChat送信は開始済みの会話に限定し、Simple中のSingle開始も拒否する。
単独Core / Phase 2のサーバーの送信仕様は変更していない。

Resultsの会話確認はChat送信を表示せず、既存MarkerCore / miniMAP / jumpを再利用する。Markerの既存編集操作は利用可能で、会話の現在状態を表示する（過去時点のMarker snapshotではない）。
セッション中に対応会話を見る場合は既存Run画面へ戻す。別会話の表示は終了後とし、MarkerCoreを同じ会話で二重mountしない。

## 検証

- npm test：240件、238 PASS、0 FAIL、2 SKIP（既存の実Embedding任意テスト）
- npm run typecheck：PASS
- npm run build：PASS
- git diff --check：PASS
- 開始保存失敗でactiveなし、終了保存失敗でrunning維持
- 明示開始のみRun作成、二重開始拒否、会話固定、セッション中のSingle拒否
- 複数生成・failed・cancelled後のセッション継続
- 既存生成の除外、IDだけの関連付け、snapshot不変、終了済みRun不変
- running JSONからinterrupted復旧、サーバー再起動後の関係保全
- Results表示、保存会話導線、Single部分出力導線、生成中の切替制限
- Core / MarkerCore / miniMAP / jump / Keep / Related / Context Compare / Single / Studyの既存自動回帰PASS

実ブラウザ・実LM Studio（ministral-3-8b-instruct-2512）、検証専用`.cache/lab-phase5`で確認：

- Simpleの会話作成、セッション開始、Chat成功、2回目ChatをStop、セッション継続
- completed Assistant本文の選択→Marker登録
- 明示終了後completed・Generation count=2・validation=not_runをResultsで確認
- reload後のRun・会話・Marker復元、一覧jumpのfocus、miniMAP表示
- Singleのcompletedとcancelled、Results一覧、部分出力・停止理由
- 未終了Simpleセッションのページ再読込でrunning継続
- サーバー停止・再起動後、未終了Simpleはinterrupted、過去completedとSingle completed/cancelledは保持

保存障害・異常終了後復旧は自動テストでも検証。全Core機能の実画面操作を再実施したものではない。

## 残る制限

- 単一利用者・1 Laboratoryプロセス・1セッションを想定。複数画面の状態同期やユーザー別管理はない。
- 会話作成はセッション開始とは独立。会話を作成して開始しなければ空会話は残るがExperimentRunは作らない。
- JSON一覧は全件読込み。大量Runのページング・検索・分析・削除UIは未実装。
- Simple終了completedは「セッションを明示終了した」意味で、個々の生成成功や検証合格を意味しない。
- Simpleのvalidationはnot_run。Run全体をfailed/cancelledにするUIは今回ない。
- DBとJSONの一括バックアップ、配布構造の独立化、履歴の高度な比較は今後の検討事項。
- Study、DB schema / migration、package、Provider、Core GenerationServiceは変更していない。
