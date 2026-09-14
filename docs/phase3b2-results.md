# Phase 3B-2 検証結果

検証日: 2026-09-14。基準コミット: `aa111b51441867d553228611572bd6e9aee80724`。

## 自動検証

- `npm.cmd run typecheck`: 成功
- `npm.cmd test`: 74/74成功（既存58件＋分岐16件）
- `npm.cmd run build`: 成功
- `git diff --check`: 成功

| 対象 | 結果 |
|---|---|
| pending→新Conversation | 予約時pending、開始時asked、正常生成succeeded |
| 所属・元データ保持 | 新会話はUser/Assistant各1件・Run1件。元Turn/Highlight/Keepの移動・コピーなし |
| 確定質問・payload | 下書きと別のuser_questionをLF保存。引用と質問だけの実上流bodyがrequest_snapshotと一致 |
| 出典 | snapshot v2のsource_conversation_id、source_highlight_id、Turn/offset/本文が一致 |
| askedから再分岐 | 元会話→新会話→別の新会話の3 Runを保持。旧Run、v1 snapshot、asked_at不変 |
| 入力・unresolved拒否 | 新Conversationを作らず、元Keep維持 |
| 予約失敗 | Conversation/Turn/Run/reference/request_idの各INSERTへ故障注入し、空会話を含め全rollback |
| 開始前失敗 | 外部通信なし、元Keep pending、予約済みRunをfailedで保持 |
| 二重送信 | request_id重複、同一Keepの会話またぎ生成中、会話active制約で拒否 |
| 通信失敗 | HTTPエラー・切断はfailed、元Keepはasked維持 |
| 停止 | 分岐先へ500ms checkpointと部分本文保存、cancelled/asked |
| DB全書込失敗 | storage_error通知。書込回復後interrupted、送信前ならpending維持 |
| API再取得 | preparedのdestination ID、元会話question-runs、分岐先detailの関係を復元 |
| 削除後履歴 | 元Highlight/Keep削除後も分岐Runとsource snapshotを保持 |
| migration 005→006 | v1 Run・既存snapshotを含むConversation/Turn/Highlight/Keep完全一致。v2出典偽装は拒否 |
| 別プロセス再起動 | succeeded分岐の全値一致。running→interrupted/asked、preparing→interrupted/pending。二度目再起動でも一致 |
| 回帰 | Phase 3B-1以下の既存58件成功 |

初回の既存テスト失敗はmigration数の期待値5→6更新漏れ。新テストの不正request_id入力ではUUIDの狭い型推論に合わせ、入力型をstringへ明記した。修正後の型検査と全74件は成功。

## 実LM Studio・ブラウザ確認

通常データから分離した `data/phase3b2-ui.sqlite`、ポート5183、モデル `qwen3.5-0.8b` を使用。

1. 元Conversation「Phase 3B-2 元会話」を作り、通常生成でcompleted Assistant回答を保存。
2. 本文「SQLite はローカルデータベースです」を実画面でドラッグし、yellowマーカーを登録（UTF-16 [0,20)）。
3. 元Keepの下書き「SQLiteの特徴は？」を保存。
4. 「新しいチャットで聞く」で引用・モデルを確認し、質問を「この引用についてSQLiteの特徴を、日本語で5項目に分けて説明してください。」へ編集。
5. 送信直後、新Conversationのタイトルが選択見出しに表示され、User #0、Assistant #1 generating、Run runningを確認。正常終了succeeded。
6. 元Conversationへ戻ると元2 Turnとマーカーが残り、asked一覧に元下書き、関連Run1件・succeeded・分岐先IDが表示された。
7. 同じasked Keepから別の新Conversationへ「SQLiteの利用例を日本語で詳しく30項目説明してください。」を送信。新会話上の生成途中streamingを確認して停止し、cancelledを確認。
8. 成功した分岐先へ戻り、User/Assistant/Run、reference snapshotのsource ID、引用と質問のみのrequest snapshotを実画面で確認。
9. サーバー停止→同じ専用DBで `npm.cmd start` →ブラウザ再読込を実施。元会話への復帰、asked、関連Run2件、最新cancelled、分岐先snapshotを確認。
10. 再起動前後の3会話のdetail / highlights / keeps / question-runsをJSONで全値比較し、完全一致。全6 Turn、3 Run（元通常1、分岐2）、1 Highlight、1 Keepを保持。

| 識別対象 | ID |
|---|---|
| 元Conversation | 81629000-347b-45ed-b95c-bd27bf10d4c2 |
| 元Keep | 7b36c83d-79f4-4dc0-96f1-39dd547ed252 |
| 成功分岐Conversation | 5e56d31b-437d-4382-b49f-41a196b40306 |
| 成功分岐Run | 23c7c291-ed30-42c0-87b4-101dbb361561 |
| 停止分岐Conversation | 9379bd47-bc79-4345-a2e5-34f19dfd6e9a |
| 停止分岐Run | 59e9b7ed-efc4-43bf-8637-6a03204dc44e |

再起動用取得スクリプトでPowerShell配列展開を修正したが、アプリ側のデータ変更は行っていない。検証用サーバーは停止済み。実モデルの回答品質は本Phaseの合否対象外。

## 保全・合否

過去Phase文書・selection-poc、migration 001〜005、Highlight anchor処理、QuestionKeep型/Repository、GenerationService、LMStudioProviderは基準コミットとの差分なし。共有contracts.tsはGenerationRun.reference_snapshotの任意項目追加のみで、Highlight保存形式は無変更。

RpenProof開始時manifestの72ファイルをSHA-256照合し、変更0件。本体からPoC/RpenProofへのruntime importなし。Keep 1:N Run、quote_question_only、completed Turn不変の契約を維持。

Phase 3B-2は合格。分岐予約と送信、正常・失敗・中断処理、source/destination復元、旧データ保全を確認した。DB/HTTP境界の送信到達不確実性、再読込時の選択、予約後失敗した会話の保持等は設計メモに記載。

コミットは行わず、このPhaseで停止する。正式Mode B、複数マーカー質問、miniMAP、複合エクスポートは実装していない。
