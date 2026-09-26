# Laboratory Phase 3: Single Text Generation

## Current State

照合日: 2026-09-26。Repositoryのdirty working treeを根拠とする要約。以下のPhase履歴は当時の記録として保持する。実装完了・技術検証・ユーザー評価・本番採用は別の判定。

- Catalog ID: `single-text-generation`
- Catalog status: `TESTING`
- Current phase: Laboratory v0.1 / Phase 5.1（Catalog version 0.1）。[Phase 5](laboratory-phase5-run-records.md)・[Phase 5.1](laboratory-phase51-completion-fixes.md)でCatalog/Resultsと正本snapshot運用を追加。
- Implemented through: implementation complete（記録された範囲）。単発生成・Stop・checkpoint/復旧・Run JSON・Results・旧snapshot互換まで。Conversation非依存を維持。
- Technical validation: Phase 3〜5.1の自動・実ブラウザ/実LM Studio検証は記録上完了。今回の再検証は自動のみ。Run validation_status=not_runとコードの検証完了は別概念。
- User evaluation: Experiment全体の人間による受入完了は確認できない。実機の生成/停止確認を採用判断と同一視しない。
- Adopted outputs: ProviderのLab再利用は実証。本Experimentから本番への新機能採用判断は確認できない。
- Production impact: Lab専用UI/service/JSON保存を追加。Single実行系はDB/Conversation/GenerationService非依存。完全LabサーバーはSimple用DBも開くため「Lab全体がDB不使用」ではない。
- Pending decision: user evaluationと全体受入。TESTING維持。自動テストだけでADOPTEDへ変更しない。
- Allowed change scope: 今回は本書Current Stateのみ。再開時は別途依頼の範囲内でSingle専用UI/serviceと対応テスト。共通保存部品の変更はSimpleへの影響確認と明示scopeが必要。
- Excluded scope: 本番Chat、DB/migration、Study、汎用Runner、任意Plugin実行、Run形式の無断変更。
- Primary code: [UI](../src/laboratory/single-text/SingleTextGeneration.tsx)、[service](../src/laboratory/single-text/service.ts)
- Primary tests: [service/HTTP](../tests/single-text.test.ts)、[UI](../tests/single-text-ui.test.ts)、[completion](../tests/laboratory-completion.test.ts)
- Known limitations: max_tokens=2048、temperature=0.7。completedは回答の意味的完成ではない。全件JSON読込・checkpoint間の損失・dirtyコードの完全再現に制限。
- Reproduction notes: 共通起動は[LAB_GUIDE](../LAB_GUIDE.md)。本書5194はDBを開かないSingle専用入口。以下のCatalog/履歴一覧未実装はPhase 3当時の状態で、現在のLab Resultsとは区別。


## 構成と再利用

単発テキスト生成だけを扱う専用画面・サーバーを追加した。Conversation / Turn / Marker / SQLiteは利用しない。

- `src/laboratory/single-text/contracts.ts`: Experiment定義とRun / Validation / event契約。
- `run-files.ts`: 専用ディレクトリのJSON保存と単一プロセス所有。
- `service.ts`: このExperiment専用の予約・生成・停止・checkpoint・終了処理。
- `server.ts`: loopback HTTP、モデル一覧、streaming、停止、Run再取得。
- `serve.ts`: DBを開かない起動入口。
- `SingleTextGeneration.tsx`, `client.tsx`, `style.css`: 最小画面と起動。
- `single-text-generation.html`, `vite.config.ts`: build入口。
- `tests/single-text.test.ts`, `tests/single-text-ui.test.ts`: 保存・通信・UI・依存の検証。

既存 `src/server/provider.ts` のLMStudioProviderを変更せず再利用する。モデル一覧・SSE解析・HTTPエラー・AbortSignalは同一実装。GenerationService、Chat、Repositoryはimportしない。単発実行管理はChatの保存契約を持たない専用処理であり、汎用Runner / Plugin Frameworkではない。

モデル選択と入力欄は普通のHTML要素として実装した。共通Model Selectorの抽出やEquipment登録管理は今回行っていない。

## Run契約

Generate 1回 = ExperimentRun 1件。experiment_id=`single-text-generation`、version=`0.1`、schema_version=1。

保存項目はrun_id、request_id、experiment_id/version、開始・終了時刻、status、validation_status、provider/base URL、model、generation_settings、input_snapshot、output_snapshot、partial_output、error、source_commit、dirty_state、experiment_snapshot、request_body。

固定設定はtemperature=0.7、max_tokens=2048、stream=true。messagesは入力をそのまま1つのuser messageとして送る。これはProviderのwire形式であり、保存用User Turnではない。履歴・Marker・前後文脈を追加しない。

入力は空白のみを拒否し、100,000 UTF-16まで。生成出力は1,000,000 UTF-16まで。制限超過は失敗扱い。Providerがfinish_reason=lengthを正常終了とする既存挙動は維持しているため、completedはモデルの意味的な回答完成を保証しない。

| 状況 | Run status | output_snapshot | partial_output |
|---|---|---|---|
| 開始予約・生成中 | running | null | 受信済み本文 |
| 正常終了・保存成功 | completed | 全出力 | 全出力 |
| 通信失敗・timeout | failed | null | 受信済み本文 |
| Stop | cancelled | null | 受信済み本文 |
| 終了時中断・再起動整理 | interrupted | null | 保存済み本文 |

Validation status型はnot_run / passed / failedを保持可能。ただしこのPhaseではValidatorを実装しないため、生成したRunはすべてnot_run。通信成功を検証合格に置き換えない。

## 保存と失敗処理

既定保存先は `data/laboratory/single-text-runs/<run_id>.json`。既存.gitignoreのdata除外範囲内。1件ごとに一時ファイルへ書込み、fsync後にrenameで置換する。途中で失敗した書込みは既存の有効なJSONを保持する。DB/migrationは追加しない。

開始Runを書き込んでからProviderを呼ぶ。開始保存が失敗した場合はHTTPエラーを返し、通信は開始しない。二重クリックはUIで、並行実行はサーバーで拒否する。request_idはRunに保存し、同一IDの再送を再起動後も拒否する。新しいGenerateは新IDで過去Runを上書きしない。

途中本文は500ms間隔で保存。通常の停止・失敗では最後の受信本文も終了記録へ保存する。checkpoint失敗は生成を中止してfailed/STORAGE_ERRORの保存を試みる。終了保存自体が失敗した場合はterminal/completedを通知せずstorage_errorを返し、画面上の部分出力を保持する。永続記録がrunningのままなら再起動時にinterruptedとして整理する。

timeoutは10分。AbortSignalに加えて実行側も中断を待ち受け、終了後の遅いcallbackは無視する。ブラウザ接続切断はfailed/DISCONNECTED、正常なサーバー終了はinterrupted/SHUTDOWN。再起動では自動再送しない。

保存先は.ownerファイルで単一プロセス所有とする。生存プロセスが使う保存先は拒否し、終了済みPIDの所有記録は起動時に回収する。不正な所有記録・Runファイルは起動を失敗させる。

## 起動

```powershell
cd D:\att-Chat
npm.cmd run build
node --experimental-strip-types src/laboratory/single-text/serve.ts
```

`http://127.0.0.1:5194/` を開く。LM Studioは既存と同じ初期URL `http://127.0.0.1:1234/v1`。必要ならLAB_SINGLE_PORT / LAB_SINGLE_RUNS / LM_STUDIO_BASE_URLを環境変数で指定する。Core / Simple Marker Chat用サーバーを起動する必要はない。Ctrl+Cで終了。

画面には最新Runの状態・出力を再読込する最小操作だけを設けた。Catalog、Workspace、Run履歴一覧、Prompt Editor、Compare Viewerは未実装。

## 検証結果

- typecheck: PASS。
- build: PASS（Core / Simple Marker Chat入口も同時build）。
- npm test: 234件、232 PASS、0 FAIL、2 SKIP。
- SKIPは既存の実Embeddingモデルopt-inテスト2件。
- git diff --check: PASS。

新規13テストで、依存経路、開始保存前の通信禁止、正常snapshot保存、入力不正、並行・重複拒否、cancel/checkpoint/遅延出力無視、timeout、Provider失敗、空出力、切断、途中保存失敗、終了保存失敗、再起動整理、shutdown、保存先排他、実LMStudioProviderとfixture SSEサーバー、UIのstreaming/停止/timeout表示を確認。

Conversation非依存は実行時import経路にDB・Repository・GenerationServiceがないこと、専用サーバーのConversation APIが404であること、生成によるファイルがRun JSONと所有記録だけであることを確認した。既存Att-Chat / Simple Marker Chat / Marker / Keep / Retrieval / Semantic / Study P0の自動回帰もPASS。

実ブラウザ＋実LM Studioでは `ministral-3-8b-instruct-2512` を使用した。

- completed Run: c3092fdc-7b35-423b-be1b-f61099989c27、出力109 UTF-16。
- cancelled Run: f879c620-d9fc-4bae-b995-b9a95fb8f0a9、部分出力250 UTF-16、output_snapshot=null。
- Model一覧・選択、Generate、running中の途中出力をスクリーンショットで確認。
- Stop、cancelled表示、ブラウザreload、サーバー停止・再起動後の同一Run/部分出力復元を確認。
- 保存JSONでrequest bodyのmessages=1、model、source commit、dirty=true、Validation=not_runを確認。
- 実機で意図的な10分timeout・ディスク障害は起こさず、自動テストで短いtimeoutと保存障害を注入した。

検証専用保存先は.cache/lab-phase3-runs。テスト用サーバー・タブと一時Runファイルは終了時に片付ける。実利用DBへはアクセスしていない。

## 制限と次Phase

JSONファイル保存は電源断に対するDB並みの耐久性を保証しない。強制終了時には最後のcheckpoint以降の本文が失われ得る。ディスク障害時の最新本文は画面にしか残らない場合がある。Run件数が多い場合の検索・索引・保持期限は未対応。

source commit / dirty stateは実行時のGit情報。dirty時は未コミットコード全体のsnapshotを保存していないため、完全再現は保証しない。Git取得不能時は両項目をnullとする。本文やvectorを通常ログへ出力しない。Run JSONには実験入力・出力が含まれる。

同じLocal LLM接続をConversationあり/なしで再利用できた。再利用が実証された共通部分はLMStudioProviderであり、SingleTextServiceを汎用Experiment Runnerとして確定したものではない。次Phaseへの既知の阻害要因はない。

DB migration・schema・package・Study・既存GenerationService/LMStudioProviderに変更なし。Phase 1/2の未コミット成果物とその他未追跡物は保持。commit / push / tag、後続Phaseへの着手なし。
