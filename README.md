# METAMI Att-Chat — Phase 1B

LM Studioと通信し、会話・発言・生成RunをSQLiteへ保存するローカルアプリです。Phase 0の選択PoCは独立した基準点として残しています。

## 起動

検証環境はWindows / Node.js 24.19.0です。Node.js 24系を使用してください。

```powershell
cd D:\att-Chat
npm.cmd ci --ignore-scripts
npm.cmd run build
npm.cmd start
```

[ローカルアプリを開く](http://127.0.0.1:5181/)。この構成はサーバーがビルド済みUIも配信するため、Viteを別起動する必要はありません。Ctrl+Cで終了します。同じコマンドで再起動すると同じDBから会話を復元します。

既定DBは `D:/att-Chat/data/attchat.sqlite`。起動時のカレントディレクトリに関係なくプロジェクト基準で解決します。DBが開けない場合、メモリDBへ切り替えず起動エラーにします。DBファイル・WAL・依存・ビルド出力はGit除外です。

開発時だけ、別ターミナルで `npm.cmd run dev` を起動すると5180番ポートから5181番のAPIへプロキシします。任意設定は `ATTCHAT_DB`（DBファイルパス）、`ATTCHAT_PORT`（サーバーポート、既定5181）。開発プロキシは5181固定です。

## 操作

1. 会話タイトルを入力して「新規会話」。
2. LM Studioでローカルサーバーを起動（既定 http://127.0.0.1:1234/v1）。モデル管理はLM Studioで行います。
3. 「モデル一覧更新」で一覧を取得し、チャット用モデルを選択。
4. 「チャット本文」に入力して「送信」。生成中は本文が逐次表示されます。
5. 「停止」で受信済み部分本文をcancelledとして保存。
6. 「再読込」またはサーバー終了・再起動後に会話を確認。未終了Runはinterruptedへ整理され、自動再送しません。

Phase 1Aの仮操作は折りたたみ欄に残しています。通常チャットはUser/Assistant予約/Run/snapshotの一括保存後に通信します。予約確認後に入力をクリアし、失敗内容はRunと画面で確認できます。通信が途切れて結果が不明な場合は、再送する前に再読込で確認してください。

任意設定 `LM_STUDIO_BASE_URL` はローカルHTTPのみ対応。同じDBを複数サーバーで同時使用しないでください。既存DBへ追加migration 002が適用されるため、更新前のサーバーは終了してから起動します。

## 検証

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

テストはメモリDBまたは一意な一時フォルダのDBを使用し、通常のdata/attchat.sqliteには触れません。再起動テストは専用サーバープロセスだけを終了・再起動します。

- [Phase 1A設計・スキーマ](docs/phase1a-design.md)
- [Phase 1B設計・状態遷移・制限](docs/phase1b-design.md)
- [Phase 1B検証結果・判定](docs/phase1b-results.md)
- [Phase 1A結果・制限・判定](docs/phase1a-results.md)
- [Phase 0結果](docs/phase0-results.md)

Question Keep、Mode B、miniMAP、Highlight統合、複合エクスポートは含みません。Phase 1Bで停止しています。
