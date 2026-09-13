# Phase 1B 設計・状態遷移・制限

実施日: 2026-09-13。基準: `27d8a40ee2ed70921b0ee6810ffdbf2194af5a65`。

## 範囲と接続

React → ローカルHTTPサーバー → GenerationService → LMStudioProvider → LM Studio。
ProviderはGET `/v1/models` とPOST `/v1/chat/completions` のみ。初期URLは `http://127.0.0.1:1234/v1`、環境変数 `LM_STUDIO_BASE_URL` でローカルHTTP URLを指定できる。ブラウザからLM Studioへ直接接続しないためLM Studio側のCORS変更は不要。モデル一覧取得は10秒、生成は全体10分でタイムアウトする。リダイレクトを拒否する。

モデル選択・チャット・streaming・停止を追加。Phase 1Aのmock操作は折りたたみ欄に残し、mock再試行ボタンはmock Runだけに表示する。Question Keep、Mode B、miniMAP、Highlight統合、複合エクスポートは実装しない。

参照した公式仕様: [Chat Completions](https://lmstudio.ai/docs/developer/openai-compat/chat-completions)、[List Models](https://lmstudio.ai/docs/developer/openai-compat/models)。モデルのダウンロード／ロードAPIは実装しない。LM StudioのJITロードが有効なら、通常の生成要求を受けてLM Studioがロードする。

## 送信と保存

1. BEGIN IMMEDIATE内で会話のidle状態とrequest_idを検証する。
2. LF正規化済みcompleted User、空のgenerating Assistant、preparing Run、実送信bodyのrequest_snapshot、request_idを一括保存する。どれか失敗したら全てrollbackし、外部通信しない。
3. runningをDB保存してから外部通信を開始する。
4. LM StudioのSSEをUTF-8 streaming decoderで復号し、イベント境界をまたぐネットワーク分割にも対応する。画面へはNDJSONのprepared/running/delta/terminalを返す。
5. 本文全体をメモリで蓄積し、約500msごとにLF正規化した全文をgenerating Turnへ保存する。CRLFがchunkをまたいでも全文正規化で一致する。SQLの確定Turn不変トリガーは変更しない。
6. 正常finish_reason（stopまたはlength）と[DONE]を受信し、空でない本文を確認した場合だけ、本文確定とRun succeededを同一トランザクションでCOMMITする。その後terminal succeededを通知する。lengthは出力上限による正常終了であり回答内容の完全性を保証しない。

snapshotはmodel/messages/stream/max_tokensを含む実際のJSON bodyそのもの。context_strategy=completed_turns、strategy_version=1、会話内sequence_no順のcompleted Turnを全件使用する。failed/cancelledの部分回答は次回文脈に含めない。モデルは必ず明示選択。max_tokensは2048固定。キー・内部推論・非テキスト・画像・ツール呼出しは送らない。

## 状態遷移

| Run元 | Run先 | Assistant先 | 条件 |
|---|---|---|---|
| 未作成 | preparing | generating・空本文 | 送信前の一括予約成功 |
| preparing | running | generating | 通信開始直前の保存成功 |
| running | succeeded | completed | 正常終了・本文確定COMMIT成功 |
| preparing / running | failed | failed | HTTP、切断、不正SSE、タイムアウト、保存失敗等 |
| preparing / running | cancelled | cancelled | ユーザー停止、通信abort、最終部分本文保存成功 |
| preparing / running | interrupted | failed | サーバー起動時の回復、または通常終了時の整理 |

preparing→succeeded、running→preparing、終了済みRunの更新、全状態でのID／snapshot変更はDBトリガーで拒否する。Run/Turnの対応は終了トランザクションとRun更新トリガーで検査する。Turnのinterrupted状態は追加せず、既存failedとRun.errorのPROCESS_INTERRUPTEDで識別する。

cancelは生成リクエストのAbortControllerを中止し、受信済み部分本文を保存してから応答する。確定済みRunへの停止は既存結果を返し、上書きしない。再送では常に新しいUser/Assistant/Runを作る。実モデルの専用retry操作は今回提供せず、入力して新規送信する。

ブラウザ接続が切れた場合も外部通信を中断し、サーバーが動いていればfailedとする。再起動時にpreparing/runningが残っていた場合は最後に保存できた部分本文だけを保持しinterruptedへ整理する。自動再送はしない。500msは目安であり、強制終了では未保存分を失う。OS全体の電源断耐性は未検証。

終了状態のDB保存自体が失敗した場合はstorage_errorを画面へ通知し、成功を通知しない。DBに終了失敗の記録まで保存できたとは保証しない。復旧・再起動後に未確定Runをinterruptedにする。回復処理が失敗した場合はサーバー起動を失敗させる。

## 二重送信とAPI

UIは同期refで連打を拒否し、生成中は会話移動等を無効化する。DBの部分一意indexで会話内のactive Runを1件に制限する。chat_requestsのrequest_id一意制約は終了後も保持し、同一request_idの再送を409にする。送信応答を受け取れず結果不明の場合、同じ入力をそのまま再送しても同じIDを使用する（同じ画面の存続中）。再読込後は履歴確認が必要。

| API | 動作 |
|---|---|
| GET /api/models | LM Studioモデル一覧。取得失敗502、空配列は正常 |
| POST /api/conversations/:id/chat | content/model/request_id。予約成功201＋NDJSON、201自体は生成成功を意味しない |
| POST /api/conversations/:id/runs/:run_id/cancel | 空JSON。通信停止＋DB状態取得 |
| GET /api/conversations/:id | 確定／生成中／中断を含む保存状態を再取得 |

## migrationと保全

001は一切変更せず002_live_runs.sqlを追加。終了済みRunを守ったまま進行中更新を許可するトリガー、active Run一意index、request_id表を追加する。migration runnerは連続versionと各checksumを検証し、DDLと履歴更新を一括適用する。Phase 1Aのテストはmigration件数と未知version注入だけ調整した。

## 既知の制限

- 一つのDBは一つのサーバープロセスだけで使用する。複数ポートから同じDBを同時に開く運用は未対応。ポート取得に失敗したプロセスは中断整理を実行しない。
- モデル一覧にembeddingや未ロードモデルが含まれ得る。互換性はLM Studio側の応答で判定し、対応しないモデルはfailedとして表示する。
- 認証必須のLM Studio、リモート接続、モデル永続選択、履歴圧縮・トークン計算、tool calls、reasoning専用本文表示は未対応。内部推論deltaは本文に保存しない。
- 会話は全件文脈。長大な履歴のcontext超過はLM Studioエラーとして扱う。本文上限は受信100万UTF-16単位。自動切り詰めはしない。
- 生成中の画面再読込は接続切断となりfailed。再接続して生成継続する仕組みはない。既に走っているRunは再読込で状態を確認し停止できる。
- 停止はHTTP通信abortまで。LM Studio内部のGPU処理停止完了を別APIで照会しない。
- モデル変更や新しいrequest_idによる明示再送は別試行。複数タブからの同時送信はactive制約で拒否するが、終了後の別ID送信を同じ意味の入力として重複排除しない。
- SQLを直接編集する運用は対象外。公開Repository経路と制約で整合性を守る。自動DBバックアップ・旧バージョンへのダウングレードは提供しない。
