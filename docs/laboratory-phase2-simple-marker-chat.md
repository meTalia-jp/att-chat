# Laboratory Phase 2: Simple Marker Chat

## Current State

照合日: 2026-09-26。Repositoryのdirty working treeを根拠とする要約。以下のPhase履歴は当時の記録として保持する。実装完了・技術検証・ユーザー評価・本番採用は別の判定。

- Catalog ID: `simple-marker-chat`
- Catalog status: `TESTING`
- Current phase: Laboratory v0.1 / Phase 5.1（Catalog version 0.1）。本書のPhase 2実装に、共通の[Phase 5](laboratory-phase5-run-records.md)・[Phase 5.1](laboratory-phase51-completion-fixes.md)が追加済み。
- Implemented through: implementation complete（記録された範囲）。Chat + MarkerCore composition、専用Lab保存先、session開始/終了、Results、定義snapshot、Marker ID-onlyイベントまで。
- Technical validation: 上記Phaseの自動・実ブラウザ/実LM Studio検証は記録上完了。今回の再検証は自動テスト/typecheck/buildに限定し、当時の実機検証と区別する。
- User evaluation: 最終的な使いやすさ・Experiment全体の受入完了を示す人間判断は確認できない。技術的操作確認と区別。
- Adopted outputs: 既存Chat/Marker部品のLab内再利用は成立。本Experimentから本番への新機能採用判断は確認できない。
- Production impact: 専用画面・Lab記録を追加。共有MarkerCoreにshowTurnIdsオプションを追加したが本番既定trueを維持。Lab session処理を本番へ反映したものではない。
- Pending decision: user evaluationとExperiment全体の受入判断。TESTING維持。ADOPTED/PARTIALへ変える明確な追加根拠は確認できない。
- Allowed change scope: 今回は本書Current Stateのみ。再開時は別途依頼の範囲内でSimple専用composition・Lab session/Results・対応テストを扱う（Phase 5/5.1の境界）。共有部品変更は自動許可ではない。
- Excluded scope: 本番Chat機能、Marker anchor、Core API/DB schema、Study統合、汎用Runner/Plugin基盤。
- Primary code: [SimpleMarkerChat](../src/client/SimpleMarkerChat.tsx)、[SimpleSessions](../src/laboratory/simple-sessions.ts)、[Lab server](../src/laboratory/server.ts)
- Primary tests: [Simple](../tests/simple-marker-chat.test.ts)、[Run](../tests/laboratory-runs.test.ts)、[completion](../tests/laboratory-completion.test.ts)
- Known limitations: 単一Labプロセス/session。SQLiteとRun JSONは一括transactionではなく完全監査ログではない。Run completedは明示終了であり生成成功・検証合格ではない。
- Reproduction notes: 現在の共通起動は[LAB_GUIDE](../LAB_GUIDE.md)。以下の専用5193起動・「Catalog未着手」はPhase 2当時の履歴で、現在はCatalog/Resultsあり。


## 実装

既存画面とは別のHTML入口 `simple-marker-chat.html` を追加した。ページ全体スクロールと既存CSSを使用する。新しいMarker・miniMAP・jump・Chat送信処理は作っていない。

- `src/client/SimpleMarkerChat.tsx`: Conversation一覧・作成・選択・再読込と、Chat / MarkerCoreの組み合わせ。
- `src/client/simple-marker-chat.tsx`: Reactの起動入口。
- `simple-marker-chat.html`: 専用ページ。
- `vite.config.ts`: 既存buildに専用ページを追加。
- `src/client/MarkerCore.tsx`: `showTurnIds`表示オプションのみ追加。既存画面の既定値はtrue、Simpleはfalse。
- `tests/simple-marker-chat.test.ts`: 実Componentによるstreaming・停止・再取得・不要API非呼出しテスト。

Phase 1の未コミット成果物は保持している。Phase 2でMarkedTurnsやChatの処理は変更していない。

## 再利用と残存依存

Chatをquestion=nullで使用し、内蔵Model Selector・Input・送信・streaming・停止処理をそのまま利用する。Keep送信用の分岐コード自体は共有Chat内に残るが、Simpleでは起動しない。MarkerCoreには拡張callbackを渡さず、Keep / Related / Context Compareを描画しない。

ConversationのRepository・API・GenerationService・LMStudioProvider・SQLite保存は既存実装を利用する。内部GenerationRunは維持するが、SnapshotやIDのDebug UIは表示しない。Markerの契約・未対応範囲・unresolved制限は既存どおり。

既存サーバーを使用するため、Keep等のAPIやDBテーブルは存在する。専用画面から呼ばないことと、サーバーから機能を除去することは別である。Semantic workerを動かさない起動例を下記に示す。独立した配布物・サーバー分割・共通Conversation UI抽出は今回行っていない。

## 起動方法

PowerShellで、Coreと異なるDB・portを指定する。

```powershell
cd D:\att-Chat
npm.cmd run build
$env:ATTCHAT_DB = 'D:/att-Chat/data/laboratory-simple.sqlite'
$env:ATTCHAT_PORT = '5193'
Remove-Item Env:ATTCHAT_EMBEDDING_MODEL_DIR -ErrorAction SilentlyContinue
npm.cmd start
```

ブラウザで `http://127.0.0.1:5193/simple-marker-chat.html` を開く。LM Studioの初期接続先は既存どおり `http://127.0.0.1:1234/v1`。終了はCtrl+C。上記環境変数はそのPowerShellセッションに残るため、通常Coreは別のPowerShellから起動する。

DB schema/migrationを変更したものではなく、専用DBには既存migrationが適用される。Coreと同じDBを複数サーバーから開かない。

## 検証

- typecheck: PASS。
- npm test: 221件、219 PASS、0 FAIL、2 SKIP（既存の実Embeddingモデルopt-inテスト）。
- build / git diff --check: PASS。
- 新規Componentテスト: 既存Chatを使った送信body、streaming表示、二重送信防止、停止、cancelled本文再取得、不要APIの非呼出し、Debug UI非表示。
- Phase 1を含む既存回帰: Marker CRUD / anchor / 抜粋 / miniMAP / jump / Keep / Related / Context Compare / Chat / storage / Semantic / Study P0は自動テストPASS。

実ブラウザでは一時DB `.cache/lab-phase2-check.sqlite`、port 5193を使用。実LM Studioの `ministral-3-8b-instruct-2512` に送信し、次を確認した。

1. 会話作成、モデル選択、送信、途中本文のstreaming、succeeded後の保存本文表示。
2. completed Assistant本文を実際にドラッグ選択し、greenとメモを付けて登録。
3. 一覧表示、filter ON/OFF、メモ更新。
4. 一覧jumpのfocusと強調をDOMおよびスクリーンショットで確認。
5. ブラウザreload後に同じhighlight IDが復元し、miniMAPから同じMarkerへjump。
6. 2回目の生成を途中停止し、cancelledと部分本文の保存を確認。
7. 同じ検証サーバーの既存Att-Chat画面でも会話・Marker・拡張UI・保存Runが表示されることを確認。

不要APIの非呼出しはfixtureを使用したComponentテストで検証した。実ブラウザの全通信をキャプチャしたものではない。長い引用の展開・削除・unresolved・4色等は共通Markerの自動回帰テストで確認し、今回の実ブラウザではその全組合せを再試験していない。

検証用サーバーは停止し、一時DBとタブを片付けた。実利用DBには書き込んでいない。モデルのダウンロードや設定変更は行っていない。

## 判定

再実装なしでLayerを構成できた。新規処理はConversationの選択と画面の組み合わせに限定し、Chat・Marker・miniMAP・jumpは共通実装を使用する。次Phaseへの既知の阻害要因はない。

Catalog / Workspace / Single Text Generation / ExperimentRun / Study統合には未着手。DB migration・schema・package・Study変更なし。commit / push / tagは未実施。
