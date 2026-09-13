# Phase 1A 結果・制限・判定

実施日: 2026-09-12。最終確認: 2026-09-13。

**Phase 1A合格。ユーザーの実画面確認とAPIによる再試行・既定DBの再起動照合を完了。確認範囲は下記に記載。Phase 1Aで停止する。**

## 検証結果

型検査PASS、テスト16/16 PASS、本番UIビルドPASS（16モジュール）。Node.js 24.19.0、TypeScript 7.0.2、Vite 8.2.2。

| テスト | 結果 |
|---|---|
| Conversation作成・一覧・取得、空タイトル拒否 | PASS |
| Turn保存・LF正規化・絵文字保持・順序 | PASS |
| SQLによるsequence_no重複 | 拒否確認 |
| completed本文・状態・ID・順序のSQL更新 | 拒否確認 |
| 複数会話分離・存在しない会話 | PASS |
| GenerationRun全最小項目・snapshot保存 | PASS |
| retryの新Assistant ID・新Run ID・旧データ保持 | PASS |
| 異なるUser／会話のretry | 拒否確認 |
| Run保存途中の強制失敗 | Assistant・会話更新・sequenceをロールバック |
| SQLite read-onlyエラー | 例外、成功扱いなし |
| DB close/reopenの復元・migration一度だけ | PASS |
| 未知migration版・checksum不一致 | 起動拒否確認 |
| migration途中失敗 | 部分DDLもロールバック |
| 会話外への複合外部キー・役割不正 | 拒否確認 |
| HTTP作成・取得・8並列追加・更新拒否・DBエラー・retry | PASS、DB失敗時500/正常時201 |
| 実サーバープロセス終了→別プロセス再起動 | Conversation・Turn・2 Runが完全一致 |

再起動テストでは専用一時DBへ会話・User・仮Assistant・retryを保存し、専用子プロセスを強制終了した後、同じDBで別プロセスを起動してJSON全体の一致を確認した。単なるメモリオブジェクトの作り直しではない。OS全体の再起動・電源断試験はしていない。

実装時は既定サーバーのUI配信HTTP 200と会話一覧APIの正常応答を確認した。最終確認ではユーザーが既定DBに作成した会話 test を使用。ローカルDBはGit対象外。

## 最終確認：実画面・再試行・再起動

ユーザーから実画面で会話 test の作成、User Turn追加、仮Assistant Turn追加、保存済みTurn表示、再読込後の同じ会話・Turn表示を確認済みとの報告を受けた。

ブラウザ操作ツールは今回もtrusted Node process異常終了で利用できなかった。指定に従い再試行せず、残りはAPIで確認した。再試行ボタンのクリックと再起動後の実画面表示は今回未確認。API成功を実画面成功として扱わない。

- 確認前はTurn 4件（User 1件・Assistant 3件）、Run 3件。元Runへの再試行APIを今回1回だけ実行し、Turn 5件・Run 4件となった。
- 旧Turn・旧Run全件は変更前と完全一致。新Assistantのsequence_noは4、新Runは同じUserと元Runを参照する。
- 新Assistant ID: 268037ef-fe7e-47ba-8108-0276be3b7ae9。新Run ID: b3de2ca8-57db-4773-9ead-3d82849c9226。
- 対象サーバーを確認してStop-Processで停止、ポート停止を確認後、npm.cmd startで再起動した。
- 同じConversation・User・旧Assistant・新Assistant・全Runの詳細JSONが再起動前後で完全一致した。
- 最終再実行：npm.cmd run typecheck PASS、npm.cmd test 16/16 PASS、npm.cmd run build PASS。

## Phase 0の保全

- 基準コミット `5c9658ed3993a164d5aeee33f362a8714fd46831` と比較し、experiments/selection-pocと既存docsの追跡ファイルは差分なし。
- RpenProof参照元72ファイルは保存済みSHA-256一覧と照合し、変更0件。
- 本体からsample/RpenProofやselection-pocを実行時importしない。
- data/attchat.sqlite、WAL、node_modules、distがGit除外されることを確認。
- 本体とPhase 1A文書のみをコミット対象とする。最終確認でもPhase 0追跡ファイル差分なし、参照元72ファイルの変更0件。

## 既知の制限

1. Run保存は固定mockの確定処理だけ。Run進行中更新はトリガーで禁止。通信・streaming導入時は新migrationと状態遷移検証が必要。
2. 同期SQLite、会話・発言一覧は全件取得。長大データの性能・ページングは未検証。
3. POSTのidempotency keyは未実装。保存後に通信が切れると結果が不明になるため、再読込確認が必要。
4. DBが書けないとき、そのエラー自身を同じDBに記録できるとは保証しない。HTTP非2xxとUIエラーで扱う。
5. migrationは001のみで、未知版・改変は拒否する。バックアップ・復旧UI・複合エクスポートは未実装。
6. 画面の会話選択状態は保存しない。再起動後は最新更新会話を表示。
7. DBファイルを手動で改変する操作への完全な保護を保証しない。公開API/Repositoryは更新・削除を提供しない。

## 次フェーズ判定

ユーザー指定の保存基盤テスト項目はすべて合格し、Phase 1Bへ進める保存基盤が整った。実画面とAPIの確認範囲は上記のとおり。Phase 1Bへ自動移行せず、範囲外機能も追加しない。
