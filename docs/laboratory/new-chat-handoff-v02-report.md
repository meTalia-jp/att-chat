# New Chat Handoff v0.2 Report

## Purpose / UI flow

Question BoxのQuestion Keepから `… → 新規チャット → Preview → 必要なら最初のUser Messageを編集 → 新規チャットとして送信` までをLab専用で接続する。送信先はLM Studioで、本番Conversation・SQLite・通常Chat履歴・Question Keepの状態を変更しない。

## Fixture

- Case 1 / Conversation A / T25 / `月がきれいですね`: Marker周辺だけでも対象を推測しやすい表現。
- Case 2 / Conversation B / T8 / `誤差は一次です`: 陽的オイラー法と局所誤差／大域誤差の前提が少し前に必要な表現。
- 各CaseにOFF / 300 / 800 / 1500の固定Previewを作成。Futureは全件0。合計8件のrequestは相互に独立し、前回答を含まない。

## Model / request contract

- Model: `google/gemma-4-12b-qat`（実行前のLM Studio model一覧で存在確認）
- temperature: 0
- max_tokens: 2048
- messages: `system` + `user` の2件のみ
- user: Previewの編集可能な `New Conversation — First User Message`
- 旧ConversationのUser / Assistant messageは直接追加しない。Lab endpointはmemory-onlyのtemporary conversation IDを返し、Repository・GenerationRun・SQLiteへ保存しない。

## 8 Run plan / actual execution

| Fixture | 条件 | Preview | 実モデルRun | 結果 |
|---|---:|---|---|---|
| Case 1 | OFF | PASS | 実行 | `length`、回答本文0、reasoning 8028文字 |
| Case 1 | 300 | PASS | 未実行 | 最初の失敗で停止 |
| Case 1 | 800 | PASS | 未実行 | 最初の失敗で停止 |
| Case 1 | 1500 | PASS | 未実行 | 最初の失敗で停止 |
| Case 2 | OFF | PASS | 未実行 | 最初の失敗で停止 |
| Case 2 | 300 | PASS | 未実行 | 最初の失敗で停止 |
| Case 2 | 800 | PASS | 未実行 | 最初の失敗で停止 |
| Case 2 | 1500 | PASS | 未実行 | 最初の失敗で停止 |

最初のRunは約236秒後、`finish_reason=length`、`content_chars=0`、`reasoning_chars=8028`でterminal eventを返した。空回答を失敗として保存した。今回の「良い回答を得るための自動再生成禁止」と既存CLIの「失敗時は保存して停止」に従い、同条件の再試行と残り7件への自動継続は行っていない。

## Automatic checks

8 Previewすべてで以下を確認した。

- New Chat history = 0
- 旧Conversation messagesを直接送らない
- Final First User Messageとrequestのuser contentが一致
- Handoff OFFはPast / Futureとも0で前提文脈なし
- requested amountはOFF / 300 / 800 / 1500へ対応
- Future = 0
- Marker本文を完全包含
- model固定
- `system, user`の2 roles
- fixture / conditionの組み合わせが8件すべて一意

実行済みCase 1 / OFFもrequest SHA、temporary conversation ID、開始・終了時刻、diagnostics、error、Human review pendingをLab専用JSONへ保存した。本番Run schemaは使用していない。

## Handoffなし / 300 / 800 / 1500

回答本文を取得できた条件がないため、回答品質差は評価不能。Context量による差が無かったという結果でもない。300 / 800 / 1500のrequest形成と境界だけが検証済みである。

## Codex first review

Case 1 / OFFは回答本文がないため、対象特定、説明開始位置、前会話への言及、ノイズを評価できない。残り7件も未実行のため、Noise candidate / Insufficient context candidateはいずれも判定保留。設定変更や再実行を最終採用判断として扱わない。

## Human review pending / limitation

全条件Human review pending。8回答比較は未成立。次に再開する場合は、人間がLM Studio側のreasoning設定または固定max_tokensの変更を明示的に決め、新しい出力directoryで再実行する必要がある。既存失敗JSONは上書きしない。

## Assets

- [8 Preview](new-chat-handoff-v02-data/preview.json)
- [Case 1 / OFF failure record](new-chat-handoff-v02-data/case-1-OFF.json)
