# Tool Card: LMStudioProvider

- Classification: Equipment Candidate
- Code: [provider.ts](../../../src/server/provider.ts)
- Owner / source: att-chat server Provider層。個人の担当者指定は確認できない。
- Used by: [Core GenerationService](../../../src/server/generation.ts)（Simpleでも共有）、[SingleTextService](../../../src/laboratory/single-text/service.ts)、[Study起動](../../../src/study-poc/serve.ts)
- Evidence: [generation tests](../../../tests/generation.test.ts)、[Single HTTP/SSE tests](../../../tests/single-text.test.ts)、[Lab gateway test](../../../tests/laboratory.test.ts)

## What it is
LM StudioのローカルHTTP APIへモデル一覧・stream生成を要求する共通クラス。

## What it is for
実行serviceからモデル通信とSSE解析を分離する。

## When to use
既存serviceと同じローカルLM Studio通信が必要な場合。Lab検証は専用保存先を持つserviceから利用する。

## Inputs
baseUrlは既定でLM_STUDIO_BASE_URL、未指定時は127.0.0.1:1234/v1。loopback HTTPのみで認証情報・query・fragment不可。generateはrequest snapshot、AbortSignal、本文callback、任意のdiagnostics callbackを受ける。

## Outputs
modelsは重複除去したID一覧。generateは本文chunkをcallbackへ渡し、正常終端で完了する。diagnosticsは終了理由・usage・文字数等。全文保存はしない。

## Side effects
HTTPでsnapshotの内容をLM Studioへ送信し、推論資源を消費する。DB/ファイル保存はしない。本文callbackはstream中に呼ばれる。

## Do not use for
外部cloud endpoint、tool calls、Run保存、会話構成、同時実行制御。自動AI送信の許可をこのCardから推定しない。

## Failure and recovery
HTTP/SSE不正・異常終端等で失敗する。通信/JSON解析/abortの例外すべてがProviderErrorに統一されるわけではない。modelsは10秒timeout、generateのdeadline/cancelは呼出元がAbortSignalで管理する。自動再試行なし。途中本文を成功扱いにせず、serviceでpartialと失敗を記録し、接続・モデルを確認して明示的に再実行する。

## Current maturity
本番・複数実験で同一moduleを共有。Equipmentへの正式昇格や汎用Provider契約ではない。テストのfake serverと実モデル検証を区別する。
