# New Chat Handoff — Production Connection v0.1

## Scope

Question Keepの`… → 新規チャット`から、Markerを基準にしたTurn-based Contextを最初のUser Messageへ埋め込み、新しいConversationとして送信する本番経路を追加した。

- PreviewだけではConversationを作らない。
- `新規チャットとして送信`で初めてConversation、User Turn、Assistant Turn、GenerationRunを予約する。
- モデルへ送るmessagesは`system`と`user`の2件だけとし、元ConversationのTurnをmessage履歴として再構築しない。
- Question Keepのstatus、`asked_at`、下書き、メモは変更しない。
- モデル送信失敗時も、作成済みConversationとUser Turnを保持する。自動retryしない。
- DB migrationは追加しない。既存の`run_question_references.reference_snapshot`へ引継ぎ情報を保存する。

## Context policy

| UI | Context |
|---|---|
| 引継ぎしない | Marker + 質問 |
| 少なめ | 前1 Turn + Target |
| 標準 | 前3 Turn + Target |
| 多め | 前5 Turn + Target |

初期値は`標準`。Conversation先頭では存在するTurnだけを含め、未来側Turnは含めない。Turn数は質問に必要な思考の流れを機械的に近似する初期値であり、最適値として扱わない。

## Traceability

GenerationRunの通常記録に加えて、reference snapshotで次を追跡する。

- source conversation id
- source turn id
- source highlight id
- marker source text / range
- handoff level
- included turn ids

## Manual real-model check

- Checked at: 2026-10-01T13:16:35.295Z
- DB: `.cache/new-chat-handoff-production-v01-manual.sqlite`（専用ローカル確認DB）
- Model: `google/gemma-4-12b-qat`
- Handoff: `standard`（前3 Turn + Target）
- Model calls: 1
- Preview conversation count: `1 → 1`
- Request message roles: `system, user`
- Included turns: `T5, T6, T7, T8`
- Generation outcome: `succeeded`
- finish_reason: `stop`
- prompt / completion / total tokens: `225 / 792 / 1017`
- Assistant: `completed`, 271 chars
- Generation duration: 80,854 ms
- Source Keep: unchanged
- Reference snapshot: source IDs、`standard`、4件のincluded turn IDsを保存

実ブラウザでは、Question Keepの`… → 新規チャット`、`標準`の初期選択、Previewの`T5, T6, T7, T8`、および「Conversationはまだ作成していません」の表示を確認した。ブラウザからの追加モデル送信は行っていない。

## Automated validation

専用テストは、level別Turn範囲、先頭clamp、Turn順序とrole、Target全文1回、未来Turn除外、Preview非書込み、明示送信、2-message request、Keep不変、回答保存、参照追跡、失敗時Conversation保持を検証する。
