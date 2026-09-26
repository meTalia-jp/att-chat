# Tool Card: RunFiles<T>

- Classification: Equipment Candidate
- Code: [run-files.ts](../../../src/laboratory/single-text/run-files.ts)
- Owner / source: Laboratory保存層。Single配下にあるがSimpleも再利用。
- Used by: [Lab server](../../../src/laboratory/server.ts)のSimple/Single、[Single専用起動](../../../src/laboratory/single-text/serve.ts)
- Evidence: [Run tests](../../../tests/laboratory-runs.test.ts)、[Single tests](../../../tests/single-text.test.ts)、[Phase 5.1](../../laboratory-phase51-completion-fixes.md)

## What it is
RunMetadataを満たすレコードのJSON保存部品。1 directoryにつき1 ownerを要求する。

## What it is for
実験ごとに異なるRun内容を専用directoryに保存・再読込する。

## When to use
Simple/Singleと同じ保存契約が適する場合。保存先を確認し、既存serviceの所有・終了処理を再利用する。

## Inputs
directoryと許可experiment ID（単数/配列、既定single-text-generation）、saveするT、readするrun_id。Tの基底は[RunMetadata](../../../src/laboratory/run-contracts.ts)。ID検査は36文字のhex/hyphen形式で、厳密UUID検証ではない。

## Outputs
read/allはJSONレコード、saveは同一run_idのファイルを置換、closeはowner lockを解放する。readはschema_version・ID・experiment・statusを検査するが、T全項目のruntime schema検証ではない。

## Side effects
constructorがdirectoryと.ownerを作成し、既存ownerのPIDを確認する。saveは一時ファイルへ書込み、fsync後renameする。closeは所有tokenを確認してlockを削除する。本文・request等を平文JSONに含み得る。

## Do not use for
本番DBの代替、任意JSON import、multi-writer、汎用schema検証、暗号化。Tの型だけで外部入力を信頼しない。

## Failure and recovery
稼働中ownerがいるdirectoryは開けない。死んだPIDと確認できたlockのみconstructorが回収する。不正lockや権限問題を無条件削除で解消しない。書込失敗をserviceへ伝え、記録を保全して保存先・権限を調査する。read/allは壊れたJSONで失敗し得る。runningからinterruptedへの復旧は[Single service](../../../src/laboratory/single-text/service.ts)や[SimpleSessions](../../../src/laboratory/simple-sessions.ts)の責務で、RunFiles自体は状態遷移しない。service終了後にcloseする。

## Current maturity
SimpleとSingleで共有・再起動/保存失敗テストあり。正式Equipment未昇格。Experiment固有schema・lifecycleは呼出元が所有する。
