# Semantic Index S2 検証結果

基準commit: `4c44718058808052157dd4c9d531ac11d3d4ebd8`。Windows / Node 24.19.0、S1配置済みローカルモデルを利用。

## 合否

S2合格。completed Turnを正本とした派生index、永続pending/lease、background推論、再生成が成立。S3へ進む基盤は用意したが、S3/検索/Context統合は実装していない。

## 自動テスト

- 通常suite: 138 PASS、2 SKIP、0 FAIL（既存112 + S2 26）。SKIPはS1/S2の実モデルopt-in各1件。
- S2実モデル専用: 1 PASS、0 FAIL。独立workerプロセスを起動・停止・再起動。
- typecheck / build / git diff --check成功。
- S2 tests: canonical space・重複・秘密情報投影除外、UTF8 hash、User/Assistant completed限定、missing/pending補完、BLOB roundtrip、次元/NaN/Infinity/zero/space拒否、ready/failed、INPUT_TOO_LONG、retry/backoff/上限、lease期限/旧token拒否、rebuild/別space保全、stale、逐次処理、transaction非保持、障害分離、rollback、cancel、DB busy、restart、migration。

## migration / recovery / failure isolation

fresh DBに001〜007適用。004/006までのschemaを持つテストDBを構築し、会話/User/Assistant/Runを保存して007へ更新。既存テーブルの全row一致とmigration再実行7件を確認。既存の005→006 v1 snapshot回帰testもPASS。DDL途中失敗は全体rollback。001〜006ファイルは基準commitと無差分。

file DBを閉じ再openし、readyの復元、missing補完、期限切れlease回収を確認。別DB接続でBEGIN IMMEDIATEを保持して結果保存をbusyにし、lease期限後に回復することも確認。rebuild後/期限切れの古いworkerは結果保存不可。

GenerationServiceでsucceeded確定後、pending INSERT/ready UPDATEにDB trigger障害を注入。既存Conversation/Turn/Run detailは完全一致、succeeded維持。推論は別error boundaryであり既存生成処理に追加していない。既存のstreaming/cancel/Keep/分岐/Highlight等112テストも維持。

## 実モデル結果 / chunk判断材料

S1と同じ固定space:
`embedding-space-v1:31929068c80e20d1a5beac7e6adc985c7690f5a634f9b2177a4b8aeffdb6cf9a`

一時テストDBでUser短文・Assistant短文・上限超過合成文を索引化。ready=2、failed=1、INPUT_TOO_LONG=1。worker停止中に短文Userを追加し再起動: total_completed=4、ready=3、pending=0、failed=1、stale=0、missing=0、INPUT_TOO_LONG=1。384次元BLOB復元、既存ready row全フィールド不変、Run不変を確認。

合成長文を意図的に含めた25%は実利用の超過率ではない。S1の実DB14件・超過0件という小サンプル以上の実利用分布は今回測定していない。S2で今後のcounts計測が可能になった。S2Cの即時追加は未決定、S3前に実利用データを十分索引化し、超過率とmissing/failedを併せて再判定する。silent truncateは行わず、長文はfailedとして可視化可能。

## 差分・保全

追加: migration007、SemanticIndexRepository、BackgroundIndexer、BuiltinEmbeddingProvider選択移植、worker/launch、S2通常/実モデルtest、設計/結果文書。
変更: migration runnerに007登録、server mainに任意worker起動/停止、既存storage testのmigration件数期待値6→7のみ。

package.json / package-lock.jsonは無変更、新規依存/モデル取得なし。モデル実体はgit対象外。S0契約・S1 PoC/測定スクリプト/文書、GenerationService、LMStudioProvider、チャット保存Repository、migration001〜006、既存anchor/Keep/Run/snapshot/Mode B/selection-pocは無変更。RpenProof72ファイル変更0件。data配下の既存16ファイルは前後SHA256一致。migration検証/推論保存は一時テストDBのみ。

## 既知の制限

worker有効化にはモデルディレクトリ設定が必要。active spaceは設定境界のみで切替UIなし。全件rebuildは1transactionで、大規模DBの分割再生成は未検証。検索はなし。native推論の即時cancelやworker自動再起動、多重アプリの全体CPU排他は未実装。INPUT_TOO_LONG失敗にはS0 failureの都合で正確なinput_tokensを保存しない。ライセンス/配布/モデル仕様はS1文書を引き継ぐ。

S2合格成果物は指定の1コミットに固定し停止する。push/tag/S3へは進まない。
