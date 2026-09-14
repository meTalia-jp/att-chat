# Phase 3B-1 検証結果

検証日: 2026-09-14。基準: `89752fc8d8c6253f80e4088abbbeca48815af915`。

## 自動検証

- `npm.cmd run typecheck`: 成功
- `npm.cmd test`: 58/58成功（既存47件＋新規11件）
- `npm.cmd run build`: 成功
- `git diff --check`: 成功

| 検証 | 結果・根拠 |
|---|---|
| pending送信、送信時質問編集 | Keep下書きを維持し、Run.user_questionに編集後LF本文を固定 |
| 引用/reference_snapshot/request_snapshot | 必須6項目一致、実テスト上流が受け取ったbodyとrequest_snapshot完全一致 |
| 通常履歴・色・メモの分離 | Keep送信messagesはsystem＋引用/質問のみ |
| asked/succeeded/failed/cancelled | 実GenerationServiceとローカルHTTP SSE fixtureで確認 |
| checkpoint・停止・二重送信 | 500ms保存、cancelled部分本文、通常送信との排他、request_id重複拒否 |
| 送信前検証・保存失敗 | 空/不正質問、モデル空、会話外、不存在、dismissed、参照INSERT/開始UPDATE失敗で通信なし・pending維持 |
| unresolved | 状態unresolvedとsource不一致の双方で拒否、Keep保持 |
| 正常終了時のDB失敗 | succeededにせずfailed/asked、既存全書込失敗回帰も成功 |
| Keep 1:N Run | 再質問でUser/Assistant/Run新ID、asked_at・旧Runは不変 |
| 削除後保持 | Keep単独削除およびHighlight連動削除後もRun/reference維持 |
| completed不変・順序 | 元Turn不変、現在会話末尾のsequence_noにUser/Assistant追加 |
| migration保全 | 004→005適用前後でConversation/Turn/Run/Highlight/Keep完全一致 |
| 再起動 | 別サーバープロセスで成功Run/Keep/Turn/引用保持、running→interrupted/asked、preparing→interrupted/pending、二度目再起動も一致 |
| 回帰 | Phase 3A / 2B / 2A / 1B / 1Aの既存47件すべて成功 |

初回検証時の失敗2件は、新規テストのJSON対SQLite行prototype比較と、故障注入時のupdated_at更新漏れ。テスト側を修正し、最終58件は失敗なし。

## 実LM Studio・ブラウザ

専用DB `data/phase3b1-ui.sqlite`、ポート5183、モデル `qwen3.5-0.8b` を利用。通常データDBは操作しない。

1. 「Phase 3B-1 実機検証」会話を作り、LM Studio通常生成でcompleted Assistantを得た。
2. 実画面のAssistant本文「SQLite はローカルデータベースです」をドラッグ選択し、yellowマーカーを登録。
3. Keep下書き「ローカルとはどういう意味ですか？」を保存。
4. 「このチャットで聞く」から質問を「この引用の『ローカル』の意味を、日本語で二文以内で説明してください。」に相当する本文へ編集して送信。
5. succeededを確認。元#0/#1に加え、#2 User / #3 completed Assistantが末尾に追加。asked一覧で関連Run 1件・succeededと元下書きが残ることを確認。
6. 同じKeepから再質問し、生成中のstreaming本文を確認して停止。#4 User / #5 cancelled Assistant追加。asked維持・関連Run 2件・最新cancelledを確認。
7. サーバー停止後、同じ専用DBで `npm.cmd start` を再実行。ブラウザ再読込とasked一覧、引用snapshot展開で復元を確認。
8. 再起動前後のAPI値をJSON比較し、Conversation / 6 Turn / 3 Run（Keep由来2）/ Keep / request・reference snapshotが完全一致。

実機ID: Conversation `61ed988c-6490-43da-8d53-a415aeb017f3`、Keep `f36246a3-04b3-44bc-bc80-53c69bbaef87`。質問Runは `ac28ac1d-3b42-4cc4-84eb-c0b92bbcea73` (succeeded)、`f46f7030-19d2-49de-93a5-8a612a19adfd` (cancelled)。引用offsetは[0,20)。実機回答内容の正しさは本Phaseの評価対象外。

## 合否と制限

基準コミットとの比較で、過去Phase文書・PoC、migration 001〜004、Highlight anchor処理と保存形式、QuestionKeep型は無変更。GenerationServiceとLMStudioProviderのファイルも無変更。共有contracts.tsはGenerationRunに質問参照項目を追加しただけで、Highlight型を変更していない。RpenProof開始時manifestの72ファイルをSHA-256照合し、変更0件。本体からPoC/RpenProofへのruntime importなし。専用検証サーバーは停止済み。

Phase 3B-1の保存・送信・streaming・状態・再起動の要件は合格。askedは送信開始処理を意味し、受信保証ではない。DB/HTTP間の停止窓、asked後の下書き不変、表示更新タイミングなどの制限は設計メモを参照。

ここで停止する。新しいチャットで聞く、正式Mode B、miniMAP、複合エクスポート、複数マーカー質問は未実装。コミット・push・タグは本作業では行わない。
