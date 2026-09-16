# S4 Read-only Retrieval 検証結果

基準commit `cc7ac3b72c31b5f3845ac072504341d2f3c199ea`。S4の実装・検証結果を記録する。コミット、push、tagは行わず、S5以降へ進まない。

## Tests

通常suiteは168件中166 PASS / 2 SKIP / 0 FAIL。既存155件（153 PASS / 実モデル専用2 SKIP）を維持し、S4の13件を追加した。getTurn、completed User/Assistant、不在、incomplete anchor、before/after 0・既定値・上限、先頭/末尾、指定件数、sequence欠番、User/Assistant混在、generating/failed/cancelled除外、Conversation非混入、決定順、構造化HTTPエラー、DBエラー、read-onlyを検証した。

typecheckとbuildは成功。Vite buildは276 modulesを変換した。`git diff --check`も成功した。

## Performance

Windows / Node 24、既存SQLite索引、warm processで各anchorを100回取得した平均。元DBはread-onlyで開いた。小規模な開発・検証データであり、HTTP/UI描画時間は含まない。

| DB | completed anchor | getTurn ms | 前後1 ms | 前後3 ms | 前後10 ms |
|---|---:|---:|---:|---:|---:|
| `data/attchat.sqlite` | 9 | 0.0197 | 0.1732 | 0.1664 | 0.1790 |
| `data/phase3b2-ui.sqlite` | 5 | 0.0165 | 0.1729 | 0.1879 | 0.1874 |

1回のcontext取得はCTEによる単一statement。現規模では前後10件でも平均0.2ms未満で、新規索引の根拠はない。既存`(conversation_id, sequence_no)`索引を継続利用する。大規模実データで遅延が顕在化した場合にquery planと応答本文サイズを再測定する。

測定再現:

```powershell
node --experimental-strip-types scripts/retrieval-benchmark.ts data/attchat.sqlite data/phase3b2-ui.sqlite
```

## UI verification

`.cache/semantic-s3-audit/attchat.sqlite`のコピーDBをポート5187で起動し、In-app Browserで確認した。

- current ConversationのRelated Turnで「前後を見る」を実行。既定before=1/after=1でAssistant #1、User #2 anchor、Assistant #3をsequence順に表示。
- before=10/after=10へ変更し、Conversation boundaryでbefore 2/10、after 1/10を表示。
- S3 scopeをAll Conversationsへ変更し、別Conversation `test` のAssistant #4をanchorに取得。見出しは`test`、before 1/1、after 0/1で、別ConversationのTurnは混入しなかった。
- anchorの背景強調、要求数/返却数、「read-onlyでAIへ送信しない」説明を確認。

UI操作とAPIはGETのみで、元DBではなく検証用コピーを使用した。

## Read-only / regression / preservation

S4 testは取得前後でconversations、turns、generation_runs、highlights、question_keeps、embedding_spaces、turn_embeddingsの全行が同一であることを確認する。性能測定はread-only接続、ブラウザ確認はコピーDBで行った。アクセスログやRetrieval結果をDB保存しない。

S3 Semantic Searchのquery、ranking、Q1/Q2、response DTOは変更せず、Related Turnsから独立GETを呼ぶだけである。GenerationService、LMStudioProvider、normal Chat、Question Keep送信、Highlight navigation、S2 worker/indexer、migration001〜007、package、RpenProof/selection-pocは変更しない。

## 変更ファイル

追加: `src/shared/retrieval.ts`、`src/retrieval/repository.ts`、`src/retrieval/service.ts`、`src/client/TurnContextPanel.tsx`、`tests/retrieval.test.ts`、`scripts/retrieval-benchmark.ts`、本設計/結果文書。

変更: `src/server/http.ts`、`src/server/main.ts`（read-only API/Service接続）、`src/client/RelatedTurns.tsx`、`src/client/style.css`（簡易確認UI）。

## Known limitations / 改善提案

- 最大21件の全文を返す。LLM連携前に明示的なresponse byte/token policyを追加し、超過時は構造化拒否または利用者選択にする。silent truncationは避ける。
- SQLite単一statement内は一貫するが、複数回API呼出しをまたぐsnapshotは固定しない。将来再現可能性が必要なら、DBを書き換えない取得時version/snapshot識別を上位層で設計する。
- 小規模DBでは既存索引で十分。先回りした索引追加やANN導入はせず、実データ件数と本文量を観測して判断する。
- ContextAssemblerはS4 DTOを利用し、SQLやUI要素へ依存しない境界を保つ。S4自体にはtoken budget、Prompt構築、取得履歴保存を追加しない。
