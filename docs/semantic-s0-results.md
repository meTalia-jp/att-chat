# Phase S0 検証結果

基準: de8ce95d77265413d76e3d21fcff01b694b2b076。

## 結果

- npm.cmd test: 112 PASS / 0 FAIL（既存97 + S0追加15）。
- npm.cmd run typecheck: PASS。
- npm.cmd run build: PASS。
- git diff --check: PASS。
- S0合格。指定どおりS0として1コミットに固定し、S1へ進まない。

最初の型検査は不正入力テストの意図的castを指摘。unknown経由の明示的castに直し、最終検証で解消した。

## 追加15テスト

canonicalキー順/metadata除外、各仕様変更のspace差、query/documentと決定性、dimensions、NaN、Infinity、zero、space mismatch、INPUT_TOO_LONG、MODEL_UNAVAILABLE、PROVIDER_ERROR、CANCELLED、token上限/非Float32/truncate拒否、AbortSignal既中断/処理中、locality/モデル情報。

未対応versionとtruncate policyは拒否。成功vectorのcopyとProvider dispose後の拒否も確認。同一fake入力は同じ結果となるが、意味検索品質の検証ではない。

## 追加ファイル

- src/semantic/contracts.ts
- src/semantic/space.ts
- src/semantic/validation.ts
- tests/fixtures/fake-embedding-provider.ts
- tests/semantic-contract.test.ts
- docs/semantic-s0-design.md
- docs/semantic-s0-results.md

既存ファイルの変更なし。migration001〜006、package、GenerationService、LMStudioProvider、保存処理、Highlight契約、Keep 1:N、source/destination、quote_question_only v1/v2、Mode B PoCを保全。
data配下の既存16ファイル（DB・WAL・SHM等）は作業前後SHA-256一致。既存回帰テストの一時DBはテスト自身が管理し、利用者DBを開いていない。RpenProof参照元72ファイルのhash変更0件。RpenProof/selection-pocからruntime importなし。

S1に残す事項: 実モデル・runtime採否、実tokenizer上限超過率、CPU/RAM/起動時間、日英検索品質、成果物固定revisionと配布・取得方式。今回モデル取得、package追加、DB保存、worker、similarity、送信統合は実施していない。
