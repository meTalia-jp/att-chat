# METAMI Att-Chat — Phase 3B-2

LM Studioと通信し、会話・発言・生成Run・Assistant本文のマーカーをSQLiteへ保存するローカルアプリです。会話内マーカー一覧、色フィルタ、現在の描画位置へのジャンプを提供します。

## 起動

Laboratoryで実験を始める・再開する場合は、[LAB_GUIDE.md](LAB_GUIDE.md)から読んでください。

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
6. completed Assistant本文の対応範囲をドラッグし、色・任意メモを指定してマーカーを登録。マーカーのクリックで色・メモの編集または削除。
7. 「マーカー一覧」で色、引用、メモを確認。色フィルタで表示対象を切り替え、「このマーカーへジャンプ」で本文中の位置へ移動。
8. unresolvedは理由を表示してジャンプを無効化。一覧の編集・削除からPhase 2Aの操作へ到達。
9. 「再読込」またはサーバー終了・再起動後に会話とマーカーを確認。未終了Runはinterruptedへ整理され、自動再送しません。

Phase 1Aの仮操作は折りたたみ欄に残しています。通常チャットはUser/Assistant予約/Run/snapshotの一括保存後に通信します。予約確認後に入力をクリアし、失敗内容はRunと画面で確認できます。通信が途切れて結果が不明な場合は、再送する前に再読込で確認してください。

resolvedマーカーの「質問キープ」から質問下書き・メモを保存できます。空欄も可。同じマーカーへ複数件作成でき、pending一覧から編集・取り下げ・削除できます。状態をdismissedに切り替えるとpendingへ戻せます。Highlightを削除すると関連Keepもすべて削除されます。

pendingキープの「このチャットで聞く」から引用と質問を確認・編集し、選択モデルへ送信できます。回答は現在会話末尾へ追加します。askedは送信開始を意味し、成功／失敗／停止の結果は関連Runで確認できます。asked一覧から同じKeepへ再質問できます。送信時の質問編集は元の下書きを変更しません。

pending / askedの「新しいチャットで聞く」では、引用と質問だけを使って新しい会話を作ります。送信予約後に新会話へ切り替わり、回答を表示します。元マーカー・Keepは元会話に残り、元Keepの関連Run表示には分岐先の結果も含まれます。

任意設定 `LM_STUDIO_BASE_URL` はローカルHTTPのみ対応。同じDBを複数サーバーで同時使用しないでください。既存DBへ追加migration 006が適用されるため、更新前のサーバーは終了してから起動します。

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
- [Phase 2A設計・制限](docs/phase2a-design.md)
- [Phase 2A Markdown対応範囲](docs/phase2a-markdown-support.md)
- [Phase 2A検証結果・判定](docs/phase2a-results.md)
- [Phase 2B設計・制限](docs/phase2b-design.md)
- [Phase 2B検証結果・判定](docs/phase2b-results.md)
- [Phase 1A結果・制限・判定](docs/phase1a-results.md)
- [Phase 0結果](docs/phase0-results.md)

詳細は [Phase 3B-2分岐設計・snapshot](docs/phase3b2-design.md) と [検証結果](docs/phase3b2-results.md) を参照してください。[Phase 3B-1設計](docs/phase3b1-design.md)・[検証結果](docs/phase3b1-results.md)、[Phase 3A設計](docs/phase3a-design.md)・[結果](docs/phase3a-results.md) は基準記録です。正式Mode B、miniMAP、複合エクスポート、複数マーカー質問は含みません。Phase 3B-2で停止しています。

## ライセンス

Att-Chat本体は [MIT License](LICENSE) で提供します。Electron、Chromium、Node.js、npm依存、EJDict-hand、およびMarker基盤の一部へ選択的に改変継承したRpenProof由来コードには、それぞれのライセンスが適用されます。

- [第三者コンポーネントとライセンス](THIRD_PARTY_NOTICES.md)
- [LGPL/MPL対象ソースの提供方法](SOURCE_AVAILABILITY.md)
- [RpenProof由来コードの技術的な追跡記録](docs/rpenproof-contribution-trace.md)

Quick辞書はPublic Domain / CC0のEJDict-handを利用します。配布版と取得元は [EJDict-hand README](public/dictionaries/ejdict-hand/README.md) と [SOURCE.json](public/dictionaries/ejdict-hand/SOURCE.json) に記録しています。
