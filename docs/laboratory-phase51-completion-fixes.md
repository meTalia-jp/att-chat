# Laboratory Phase 5.1 — v0.1 Completion Fixes

## 対象と判定

完成監査で残ったExperiment定義の正本、Exampleコピー運用、Simple Marker参照の3点のみを修正した。
Phase 5.1合格。v0.1完成監査へ再提出可能。
本書はPhase 3〜5文書の旧定義snapshot・Marker操作参照に関する説明を更新する。過去文書は当時の記録として維持した。

## 変更ファイル

- `src/laboratory/catalog.ts`：Experiment定義の正本、Rev.1必須項目
- `src/laboratory/single-text/contracts.ts`：正本の参照、旧snapshot型の読込互換性
- `src/laboratory/run-contracts.ts`：派生ID、旧Simple snapshot互換、任意marker_events
- `src/laboratory/simple-sessions.ts`：登録定義の選択、Markerイベント追記
- `src/laboratory/single-text/run-files.ts`：固定登録された複数Simple IDを読めるよう拡張
- `src/laboratory/server.ts`：定義の受渡し、既存Highlight成功応答からイベント記録
- `src/laboratory/Laboratory.tsx`：IDとentryの分離、定義表示・送信ID
- `src/laboratory/RunResults.tsx`：Experiment IDとMarkerイベント表示
- `tests/fixtures/derived-experiment.ts`：metadataだけの手動コピーfixture
- `tests/laboratory-completion.test.ts`：正本、旧snapshot、派生ID、Marker操作、再起動
- `tests/laboratory-runs.test.ts`：旧Simple Runとイベント保存失敗の検証を追加
- `tests/laboratory-ui.test.ts`：派生Catalog表示・既存entry起動・送信ID検証
- 本文書

## Experiment定義の正本

`catalog.ts`の固定登録を正本とする。schema_version / id / title / kind / status / version / runnable / purpose / hypothesis / derived_from / equipment / execution / procedure / acceptanceを持つ。
procedureとacceptanceは短い文字列配列としてインライン定義し、別manifestファイルやパス解決機構は追加しない。
SimpleとSingleの新規Runは、この正本の定義をstructuredCloneしてsnapshotへ保存する。
Singleの従来の`experiment` exportは正本への参照であり、別定義を持たない。
Catalog変更時にも既存Run snapshotは更新しない。旧形式はそのまま読める。
running→interruptedの既存復旧は状態と日時だけを従来どおり整理し、snapshotの移行処理は追加していない。

## 手動コピーの最小実証

fixtureはSimpleのmetadataだけをコピーし、以下を設定する。

- id: `fixture-marker-review`
- version: `0.1-fixture`
- derived_from: `simple-marker-chat` / `0.1`
- execution.entry: 既存の`simple-marker-chat`

Componentはコピーしない。Catalogは新ID・title・派生元を表示し、entryに従って既存SimpleMarkerChatを表示する。
開始リクエストはExperiment IDを渡し、SimpleSessionsは固定登録の該当定義を確認してRunへ保存する。
テストでは本体定義とfixtureを同じ登録集合として渡し、同一会話でも別Experiment IDのRunとして区別できることを確認。
本番の恒久Catalogは従来の3件のみ。自動探索、任意コードロード、Plugin Framework、Fork UI、汎用Runnerは追加していない。

手動コピー運用：正本に新metadataを追加し、既存entryを指定する。UIとサーバーは同じ登録集合を使用する。独自entryを増やす場合は別途明示的なコード実装が必要であり、metadataだけで任意処理を実行する仕組みではない。

## Markerイベント

新しいSimple Runは`marker_events: []`を持つ。各要素は次の3項目だけ。

```json
{"operation":"created","highlight_id":"...","timestamp":"ISO-8601 UTC"}
```

operationはcreated / edited / deleted。引用・原文・offset・色・メモをRunへコピーしない。
既存Highlight APIのPOST / PATCH / DELETEが2xxで完了した場合だけ、要求開始時に対応していたSimpleセッションへ追記する。
作成は既存API応答のhighlight_id、編集・削除は既存IDを使用する。失敗した操作は記録しない。
操作の保存中はセッション終了・開始を拒否し、別Runへの混入を防ぐ。
MarkerCore、既存Core API、Repository、SQLite schemaやanchor契約は変更していない。

Run JSON保存に失敗した場合、成功応答にせず「Marker本体は保存済みだがRun記録に失敗」と表示する。
イベントはメモリ上に保持し、Results再取得・checkpoint・終了時に再試行できる。
旧Runでmarker_eventsがない場合は「旧Run：操作記録なし」と表示し、過去の操作を推測して追記しない。
削除済みMarkerのイベントもID参照として残る。本文復元のための履歴ではない。

## 制限

- SQLiteとRun JSONは一括トランザクションではない。Core保存直後〜イベントJSON保存前の強制終了、または保存失敗後の強制終了ではイベントが残らない可能性がある。完全な監査ログではない。
- Laboratoryの実行中Simpleセッションに対する操作だけを記録する。Core単独画面、セッション外のResults編集、他会話の操作は対象外。
- timestampはCore成功応答を確認して記録した時刻。編集前後の値は保存しない。
- 派生Experimentの実証はSimple entryを再利用するfixtureで行い、任意Experiment用の汎用実行基盤へ拡張していない。

## 検証結果

- 全テスト：242件、240 PASS、0 FAIL、2 SKIP（既存の実Embedding任意テスト）
- `npm.cmd run typecheck`：PASS
- `npm.cmd run build`：PASS
- `git diff --check`：PASS
- Catalog定義とSingle exportの同一参照、新規Run snapshotと登録定義の一致
- 旧Single / Simpleの終了済みJSONを再読込してもsnapshot・ファイルが不変
- fixtureのCatalog識別、派生元表示、既存Simple entry、送信Experiment ID
- 同じSimpleSessionsとHTTP Chat基盤で派生Runと元Runを区別
- Marker created / edited / deletedが同一Highlight IDで順序付き保存、重複登録拒否はイベントなし
- Marker本文をイベントへ含めないこと、再起動後のイベント保持
- イベント保存失敗後のメモリ保持と再保存
- 既存Att-Chat / Simple / Single / Marker / miniMAP / Keep / Related / Context Compare / Studyの自動回帰PASS

実ブラウザ＋実LM Studio（ministral-3-8b-instruct-2512）で、専用`.cache/lab-phase51`を使用。
Chatでcompleted Assistant本文を生成し、選択→Marker作成→色とメモ編集→削除→明示終了を確認した。
ResultsのRun `7531827d-3039-481b-8e84-4186f66b4114`で、Highlight `f50fb9e9-cca3-4094-8fff-4d5bf64b131b`のcreated / edited / deletedを表示。
ブラウザ再読込後も同じ3イベントを確認した。サーバー再起動は自動テストで確認。

DB migration / SQLite schema / package / Study変更なし。commit / push / tagなし。
