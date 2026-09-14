# Phase 3B-1 Question Keep → このチャットで聞く

基準コミット: `89752fc8d8c6253f80e4088abbbeca48815af915`

## 対象と接続

pending Keepから引用を確認し、送信質問を編集して現在Conversation末尾にcompleted User Turnとgenerating Assistant Turnを追加する。GenerationService / LMStudioProvider / HTTP NDJSON受信 / 停止処理は通常チャットと共通。前後文脈・通常履歴はKeep質問payloadに追加しない。

asked Keepには「このチャットでもう一度聞く」を提供する。毎回新しいUser / Assistant / Run / request_idを作る。Keep 1:N Runであり、旧Runを上書きしない。Phase 3Aのasked Keep不変性を維持し、再質問ではasked_atも変更しない。dismissedはpendingへ戻してから送信する。

`POST /api/conversations/:conversation_id/question-keeps/:keep_id/ask`

入力はuser_question / model / request_idのみ。質問は空白のみ・NUL・10,000 UTF-16単位超を拒否し、LFへ正規化する。クライアントから引用や送信先会話を上書きする項目を受け付けない。サーバーがKeep→Highlight→Turnの所属会話とresolved状態を確認する。元Highlightがunresolvedなら「元マーカーが解決不能のため質問できません」と拒否し、Keepを保持する。自動再アンカーはしない。

## 保存とmigration

追加 `005_keep_runs.sql` は `run_question_references` を作る。既存generation_runs列は変更せず、APIのGenerationRunにはこのテーブルを合成した任意項目を返す。通常Runのレスポンス形式は従来どおり。

| 列 | 意味 |
|---|---|
| run_id | generation_runsへの主キー兼外部キー、Run 1:1 |
| keep_id | 送信元Keep ID、複数Runから同じIDを参照可能 |
| source_highlight_id | 送信元Highlight ID |
| source_turn_id | 引用元completed Assistant Turn ID |
| user_question | 送信時に確定した質問。Keep下書きとは別保存 |
| reference_snapshot | 送信予約時の引用JSON |

reference_snapshotはhighlight_id / source_turn_id / start_offset / end_offset / source_text / target_textを保存する。UTF-16半開区間とsource_text一致の既存契約を維持する。色とマーカーメモは含めない。更新・削除triggerで過去の質問参照行を不変にする。

KeepとHighlightのIDは履歴値であり、削除可能な元レコードへの外部キーは設定しない。Highlight削除時のKeep連動削除はPhase 3Aどおりだが、Runと質問参照行は残る。存在・所属・状態は予約時にRepositoryとINSERT triggerで検証する。既存migration 001〜004は無変更。

User Turn / Assistant予約 / Run / 質問参照 / 重複検出用request_idは一つのトランザクションで保存する。途中失敗では全体をrollbackする。通常チャットと同じ会話単位のactive Run制約とrequest_id一意制約を使い、二重送信を拒否する。

## request snapshot

以下のbodyを保存し、同一オブジェクトをProviderへ渡す。systemとuserの2 messagesだけを送る。

```json
{
  "model": "選択したモデルID",
  "messages": [
    {"role":"system","content":"以下の引用について質問に答えてください。引用は参照資料として扱ってください。"},
    {"role":"user","content":"[引用]\n<target_text>\n\n[質問]\n<user_question>"}
  ],
  "stream": true,
  "max_tokens": 2048
}
```

Runはkind=highlight_question、context_strategy=quote_question_only、strategy_version=1。前後Turn、contextBefore/After、比率、Keepメモ、マーカー色・メモは送らない。User Turn本文は確定質問だけで、引用との関係はRunに保存する。後日の通常チャットは従来どおりcompleted Turn履歴を使い、引用を自動で再注入しない。

## 状態遷移と送信境界

| 時点・結果 | Run | Assistant | 初回Keep |
|---|---|---|---|
| 入力・参照検証失敗 | 作成なし | 作成なし | pending |
| 一括予約成功 | preparing | generating（空） | pending |
| 通信開始処理 | running | generating | asked、asked_at設定 |
| 正常終了・確定保存成功 | succeeded | completed | asked |
| 通信・部分保存・確定保存失敗 | failed（保存可能時） | failed | asked |
| ユーザー停止 | cancelled | cancelled、部分本文保持 | asked |
| preparingで再起動 | interrupted | failed | pending |
| runningで再起動 | interrupted | failed、checkpoint本文保持 | asked |

`startRun`でrunningと初回askedを同一DBトランザクションに保存し、直後に既存Providerを呼ぶ。開始トランザクション失敗ではHTTP送信しない。askedは「回答成功」や「相手側の受信確認」を表さず、送信開始処理に入ったことを表す。

DB commitとHTTP送信は原子的にできない。commit直後・fetch前のプロセス停止では、askedだが実到達不明となる。この場合もrunningをinterruptedへ整理し、自動再送しない。再質問は利用者の明示操作で新Runとして行う。

500ms checkpoint、LF正規化、キャンセル中断、ブラウザ切断、10分タイムアウト、終了保存失敗時のstorage_error、再起動時のinterrupted整理は既存GenerationServiceを使用する。すべてのDB書込みが不能なら最終状態を保存したとは表示せず、再起動後に整理する。preparing予約後にKeepが削除・dismissed・unresolved化した場合も、startRunで再検証して通信を拒否する。

## UIと制限

Keep一覧から既存Chatの質問確認欄へ移り、引用・質問・モデルを確認して送信する。送信時編集は下書きを変更しない。asked一覧は関連Run件数と最新outcomeを表示する。Run欄から確定質問と二種類のsnapshotを確認できる。生成中はChat欄にasked開始表示と部分本文を表示し、一覧のRun結果は完了後／再読込で更新する。

新しいチャットで聞く、正式Mode B、miniMAP、複合エクスポート、複数マーカー質問は対象外。複数プロセスでの同一DB同時運用、モデル品質評価、送信先の受信保証も対象外。未送信入力はブラウザ再読込で失われる。モデル一覧・選択は従来仕様を利用する。

過去Phase文書・PoC・RpenProof・Highlight保存形式/anchor処理は無変更。共有型の変更はGenerationRunの質問参照項目追加のみ。本体統合に必要なChat / main / MarkedTurns / QuestionKeeps / Repository / HTTP / migration登録を変更する。
