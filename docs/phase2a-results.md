# Phase 2A 検証結果・合否判定

検証日: 2026-09-13。基準コミット: `f5a05976f1bc1ca02a73316b4e106372a227aa32`。

## 自動検証

最終値はPhase 2A完了時の再実行結果を記録する。

- `npm.cmd run typecheck`: 合格
- `npm.cmd test`: 合格（40件中40件成功、失敗0件）
- `npm.cmd run build`: 合格
- `git diff --check`: 合格

テストは、通常Assistant選択、日本語、絵文字、同語の別位置、別Turnの同文、4色、メモ有無、複数・隣接マーカー、重複・包含・完全一致拒否、Turnまたぎ、User/generating/cancelled/failed拒否、grapheme途中拒否、CRUD、anchor不変、保存・DB再open・別サーバープロセス再起動、source不一致のunresolved固定を確認する。

Phase 1Bのモデル一覧、モデルなし、LM Studio未起動、通常生成、分割UTF-8 SSE streaming、cancel、通信切断、HTTPエラー、Run/Turn状態遷移、snapshot、running回復、二重送信、DB失敗とPhase 1Aの保存回帰も同じsuiteで再実行する。

## 実ブラウザ確認

ローカルLM Studioの `qwen/qwen3-1.7b` を選択し、実通信で回答 `日本語ABC 😀 同じ語 同じ語` をstreaming生成した。Assistant Turn `b75fdced-d564-41a0-b6ab-877e75eaceec` はcompleted、Run `e69dbca4-bce7-400c-ab6d-0fa4426fe51b` はsucceededとして保存された。

同本文の先頭 `日本語AB` を実ドラッグし、blue、メモ `Phase 2A 再起動復元メモ` で登録した。画面の「再読込」後に同じ5 UTF-16単位の位置へ再描画された。

続いてサーバーを停止し、`npm.cmd start` で同じDBを再起動した。再起動前後のHighlight API応答は完全一致し、同じ `highlight_id`、turn_id、`[0,5)`、source/target、色、メモ、日時、resolved状態が復元された。ブラウザ再読込後も先頭の `日本語AB` だけが青色で再描画された。既存Conversation、User Turn、Assistant Turn、Runも保持された。

## 保全確認

- Phase 0成果物とselection-poc: 差分なし
- Phase 1A文書: 差分なし
- Phase 1B文書: 差分なし
- migration `001_initial.sql` / `002_live_runs.sql`: 差分なし
- `sample/RpenProof` 参照元72ファイル: ハッシュ変更0件
- Phase 0 PoCおよびRpenProofからのruntime import: なし

## 判定

Phase 2Aの要求を満たしたため **合格** と判定する。Phase 0のデータ契約変更はない。マーカー一覧・ジャンプ、Question Keep、Mode B、miniMAP、複合エクスポートは未着手で、Phase 2Aで停止する。
