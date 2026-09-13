# METAMI Att-Chat — Phase 1A

会話と発言をSQLiteへ保存するローカルアプリです。Phase 0の選択PoCは独立した基準点として残しています。

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
2. User本文を入力して「User Turn追加」。
3. 回答対象のUser発言と仮Assistant本文を指定し「仮Assistant Turn追加」。
4. Runの「このRunを仮再試行」を押すと新しいAssistant TurnとRunを追加。旧発言は保持します。
5. 「再読込」またはサーバー終了・再起動後に会話を確認。

仮Assistantは入力された固定文の保存機能です。AIへの通信は行いません。保存成功の表示はDB確定と再取得が済んでから行い、失敗時は入力欄を保持します。サーバーへの通信が途切れて結果が不明な場合は、再送する前に再読込で確認してください。

## 検証

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

テストはメモリDBまたは一意な一時フォルダのDBを使用し、通常のdata/attchat.sqliteには触れません。再起動テストは専用サーバープロセスだけを終了・再起動します。

- [Phase 1A設計・スキーマ](docs/phase1a-design.md)
- [Phase 1A結果・制限・判定](docs/phase1a-results.md)
- [Phase 0結果](docs/phase0-results.md)

Phase 1B以降のLM Studio、streaming、モデル選択、Question Keep、Mode B、miniMAP、複合エクスポートは含みません。
