# Laboratory Phase 4: Catalog / Workspace

## 変更ファイル

- `src/laboratory/catalog.ts`: 3 Experimentの固定metadata。
- `src/laboratory/Laboratory.tsx`: Catalog、Overview / Run / Results、切替制御。
- `src/laboratory/client.tsx`, `laboratory.css`, `laboratory.html`: 入口と最小レイアウト。
- `src/laboratory/server.ts`, `serve.ts`: 既存2サーバーの組み合わせとloopback gateway。
- `src/client/SimpleMarkerChat.tsx`: 任意のonBusy通知追加。
- `src/laboratory/single-text/SingleTextGeneration.tsx`: 任意のonBusy通知とCSS用class追加。
- `src/laboratory/single-text/style.css`: 固有スタイルの適用範囲をSingle画面へ限定。
- `vite.config.ts`: Laboratoryのbuild入口追加。
- `tests/laboratory.test.ts`, `tests/laboratory-ui.test.ts`: metadata、切替、UI、gatewayの検証。

Phase 1〜3の未コミット変更は保持している。Chat、MarkerCore、miniMAP、jump、Provider、SingleTextService、RunFilesの処理を複製・改変していない。

## 登録・Workspace

TypeScriptの固定配列をCatalogとOverviewで参照する。各項目はid / title / kind / status / version / runnable / purpose / hypothesis / equipment / executionを持つ。entryは明示的な既存Componentとの対応であり、動的import探索や任意コード実行には使用しない。

Simple Marker Chat / Single Text Generationはexample・Runnable、Study P0はexisting-experiment・Record only。Studyのコード・起動処理はLaboratoryへimportしない。

左Catalog、右Workspace。Overview / Run / Resultsを通常のボタンで切替する。ページ全体スクロールで、miniMAPのwindow前提を維持する。小さい画面では縦並び。Dock・独立スクロールペイン・可変レイアウトは追加しない。

RunではPhase 2のSimpleMarkerChatとPhase 3のSingleTextGenerationをそのままmountする。初期Overviewではどちらも起動しない。タブを変更しただけでは起動済みComponentをunmountせず、入力状態を保持する。別Experimentへの切替では終了済み画面をunmountする。

## 切替規則

- 生成・保存処理中はCatalogとタブ切替を無効化する。
- Simpleは「セッションを開始」でmount。生成していない時もセッションが継続する間は別Experimentを選べない。
- 「セッションを終了」は処理中に押せない。明示的終了後は切替可能。
- Singleは生成終了/停止後に切替可能。
- セッションは今回UI上の状態のみ。ExperimentRun保存・永続的セッション管理は追加していない。
- ページreload/閉鎖はUIセッションを失う。通信切断時は既存実行処理の中断処理に従い、Runや会話は保存先から確認する。

複数Experimentをバックグラウンドで管理する機構はない。1 Laboratory画面での利用が前提。gatewayも同時に届いた生成POSTを拒否するが、複数ブラウザ間のセッション同期や権限制御は対象外。

## Results

- Simple: Runタブへ戻り、既存の保存会話・Markerを確認する導線。SQLiteと内部GenerationRunを維持し、新しいLab Runは作らない。
- Single: 既存Run画面の「保存Runを再読込」へ進む導線。既存JSON保存と最新Run表示を利用。履歴一覧・分析は追加しない。
- Study: 既存の結果・比較文書のパスを表示。Studyはメモリ上のセッションを使う既存実験として案内する。

統一Resultsスキーマ、検索、文書ブラウザは未実装。

## サーバーとデータ分離

同一Nodeプロセス内で既存createAppServerとcreateSingleTextServerをloopbackの空きportにbindし、公開入口のgatewayから転送する。既存HTTP処理・SSE解析・生成・保存ロジックを再実装しないための固定接続である。内部portは起動ごとにOSが選択する。

gatewayはHost / Originを検証し、既知のloopbackサーバーだけへ転送する。任意接続先指定は受け付けない。streamはbufferせず転送し、停止APIも既存実装へ送る。

既定値:

- 公開URL: `http://127.0.0.1:5195/`
- Simple DB: `data/laboratory/simple-marker.sqlite`
- Single Run: `data/laboratory/single-text-runs/`

Coreのdata/attchat.sqliteは開かない。DBを開くのはLab用Repositoryを持つ1箇所だけ。Semantic workerは起動しない。既存migrationを新規Lab DBへ適用するが、migrationファイル・schemaは変更していない。

Single Run保存先はPhase 3の既定値を再利用する。Phase 3単体サーバーとLaboratoryを同じRun保存先で同時起動すると、既存の所有ロックにより起動を拒否する。Phase 2の単体DBを自動移動・複製する処理はない。

## 起動

```powershell
cd D:\att-Chat
npm.cmd run build
node --experimental-strip-types src/laboratory/serve.ts
```

`http://127.0.0.1:5195/` を開く。終了はCtrl+C。LAB_PORTとLAB_DATAで公開port・専用データディレクトリを変更できる。LM_STUDIO_BASE_URLは既存設定を使用する。

例として検証ではLAB_DATAを `.cache/lab-phase4` に指定した。既存実利用DBのコピーや書込みは行っていない。

## 検証結果

- typecheck / build / git diff --check: PASS。
- npm test: 237件、235 PASS、0 FAIL、2 SKIP（既存Embedding実モデルopt-inテスト）。
- 固定3件、Overview metadata、Runnable / Record only、Study分類を検証。
- Simple開始→切替不可→明示的終了→切替可能をComponentテストで検証。
- Single生成中のCatalog/タブ無効化、Stop後の解除、Results導線、StudyでAPIを呼ばないことを検証。
- gatewayから既存Chat/Single APIを実行し、streaming・停止・同時生成拒否・Origin検証・保存先分離を検証。
- Single実行前後で既存Conversation詳細が不変であることを確認。
- 既存Core / Simple Marker Chat / Single Text Generation / Marker / Study等の自動回帰PASS。

実ブラウザ＋LM Studio（ministral-3-8b-instruct-2512）で以下を確認した。

1. 左Catalog / 右Workspaceのレイアウトと3件表示。
2. Simple開始、会話作成、通常Chat成功、生成中の切替禁止、生成後もセッション継続中は切替禁止。
3. Workspace内でAssistant本文をドラッグ、Marker登録、一覧jumpのfocus/強調、miniMAP表示。既存処理が埋め込み先でも動くことを確認。
4. 明示的終了後にSingleへ切替、ResultsからRunを開く。
5. Singleのstreaming表示、生成中の切替禁止、Stop/cancelled保存と切替解除。
6. StudyのRecord only表示、既存起動方法とResults文書参照。

実機の全機能を再試験したものではない。既存画面の細部・timeout・保存障害等は自動回帰で確認した。ブラウザ検証用サーバー・タブ・専用一時データは終了時に片付ける。

## 判定・制限

Laboratoryの最小入口として成立した。実験の選択と起動、セッション終了条件、保存結果への参照を既存機能の組み合わせで実証できた。次Phaseへの既知の阻害要因はない。

固定登録と最小Results導線までで、SimpleのExperimentRun記録統合や配布構造の独立化は未実装。現在は同じrepositoryとbuild出力を共有する。Studyファイルは既存の未追跡状態を維持しており、別cloneへの配布を保証する段階ではない。

DB migration/schema、package、Study、汎用Frameworkは変更・追加していない。commit / push / tag、後続Phaseへの着手なし。
