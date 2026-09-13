# Phase 1B 検証結果・合否判定

実施日: 2026-09-13。基準コミット `27d8a40ee2ed70921b0ee6810ffdbf2194af5a65`。

**Phase 1B合格。自動テスト31/31、型検査、本番ビルド成功。実LM Studioと実ブラウザでモデル選択・送信・streaming・停止・再読込を確認した。Phase 2へ進まない。**

## 自動検証

最終実行: `npm.cmd run typecheck` PASS、`npm.cmd test` 31 PASS / 0 FAIL / 0 SKIP、`npm.cmd run build` PASS（Vite 17モジュール）。`git diff --check` PASS。

| 確認項目 | 結果・方法 |
|---|---|
| models成功／空／未起動 | 模擬HTTPサーバーと閉鎖ポートで確認 |
| 通常生成・streaming | UTF-8を1byteずつ送信し日本語・絵文字・分割CRLFを復号。複数deltaを生成中に通知 |
| cancel | 継続中のHTTPをabortし、Run/Turn cancelledと部分本文保持 |
| 500ms checkpoint | 生成継続中にSQLite本文が更新されることを確認 |
| HTTPエラー | 503をfailedとして確定 |
| 通信切断・不正JSON・終了情報不足 | 全てfailed、succeeded通知なし |
| Run/Turn遷移 | preparing→running→succeeded、failed/cancelled/interrupted、不正遷移拒否 |
| snapshot | 実際の送信bodyと保存snapshotがdeepEqual。SQL変更拒否 |
| 送信前のDB失敗 | User・Assistant・Run全体rollback、外部リクエストなし |
| 確定DB失敗 | succeededトランザクションrollback後、failed確定 |
| checkpoint失敗 | 通信abort、部分本文とSTORAGE_ERRORを保存 |
| DB全書込禁止 | storage_error通知、未確定を成功扱いせず、回復後interrupted |
| 再起動整理 | ファイルDBにpreparing/runningを保存後、新サーバープロセスの起動経路でinterrupted。部分本文保持・Run件数不変 |
| 二重送信 | 同一会話active制約と同一request_idの409。HTTP同時送信でもTurn追加なし |
| ブラウザ切断 | failed、終了後cancelでも既存レコード変更なし |
| 001→002移行 | 001だけのDBへ既存Conversation/User/Assistant/mock Runを作り、追加migration前後の詳細が完全一致 |
| Phase 1A回帰 | 全16件を継続確認。migration件数等の前提だけ更新 |

既存の実プロセス強制終了・再起動テストも成功。OS電源断や巨大履歴での性能試験は含まない。

## 実LM Studio・実画面

接続先 `http://127.0.0.1:1234/v1`。GET modelsで22件取得。検証モデル `qwen/qwen3-1.7b`。
専用サーバー `http://127.0.0.1:5182/`、専用DB `data/phase1b-validation.sqlite` を使用。モデルのダウンロードやロードAPIは呼んでいない。

1. 内蔵ブラウザから会話「Phase 1B 実機検証」を作成。
2. モデル選択UIで上記モデルを選択し、短い日本語質問を送信。
3. 「生成中」と送信無効／停止有効を確認。回答「接続確認できました」を表示し、Run succeeded / Assistant completedを確認。
4. 1から1000まで列挙する長い質問を送信し、生成中に1〜51の部分本文を実画面で確認。
5. 「停止」をクリック。受信済み1〜63を残し、Run cancelled / Assistant cancelledを確認。
6. 「再読込」をクリックし「DBから再読込しました」と、正常回答・停止部分本文・Run状態の保持を確認。

正常Run: `20f2ec1d-7420-4bd8-8daa-59668afa66f9`。
停止Run: `c8021a76-5b95-4f79-8915-18bdbce6b392`。
ブラウザ制御ツール障害の再発なし。検証DBはGit対象外。

## 既存データと基準の保全

- 既定サーバーを停止して `npm.cmd start` でPhase 1Bとして起動し、実DBにも002を適用。
- 既存会話 `test` の更新前後の詳細JSONが完全一致。Turn 5件、Run 4件。検証質問は専用DBに作成し、既定会話には追加していない。
- Phase 0のexperiments/selection-pocと追跡docsは基準コミットから差分なし。Phase 1Aの設計／結果文書も変更していない。
- `src/server/storage/migrations/001_initial.sql` は差分なし。追加は002のみ。
- RpenProof参照元manifestの72ファイルをSHA-256照合、変更0件。本体からの実行時importなし。
- 新しいコミット・push・タグ作成は今回の依頼に含まれず、実施していない。

## 制限と停止点

[設計メモの状態遷移・既知の制限](phase1b-design.md)を参照。特に一つのDBにつきサーバー1プロセス、生成中の画面再読込は生成継続せずfailed、10分タイムアウト／2048出力token上限、停止は通信abortまで、DB全書込失敗時は復旧後に中断整理する。

指定のPhase 1B範囲で合格。Question Keep、Mode B、miniMAP、Highlight統合、複合エクスポート、Phase 2の実装は行わない。
