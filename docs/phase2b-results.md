# Phase 2B 検証結果・合否判定

検証日: 2026-09-14。基準コミット: `48440e5cc8cfae40c6233a31e2d0af94f3cd80b8`。

## 自動検証

- `npm.cmd run typecheck`: 合格
- `npm.cmd test`: 合格（41件中41件成功、失敗0件）
- `npm.cmd run build`: 合格
- `git diff --check`: 合格

Phase 2B追加テストでは、複数Turn、同一引用、同色複数件、色集合によるON/OFF、`highlight_id + turn_id + UTF-16 offset`による正しい描画要素の特定、狭い表示幅、DOM再生成後、Markdown断片をまたぐHighlight、unresolvedのジャンプ拒否を確認した。

既存40件も全件通過し、Phase 2Aの選択・4色・メモ・CRUD・重複拒否・unresolved・DB/サーバー再起動、Phase 1Bのモデル一覧・streaming・cancel・失敗処理・Run状態、Phase 1AのConversation/Turn/Run・不変性・migrationを回帰確認した。

## 実ブラウザ確認

デスクトップChromiumで、4つのAssistant Turnにresolved 5件とunresolved 1件を表示した。yellow 2件、red 2件、green 1件、blue 1件の色、引用、メモ、Assistant sequence番号を確認した。

- redだけをOFFにして `4 / 6件`、全色OFFで `0 / 6件`、全色ONで `6 / 6件`へ切り替わった。
- 同じ「保存」があるAssistant #1と#2のうち、#2の一覧ボタンが#2の`保存`だけへ移動し、outlineとpulseで強調した。
- viewportを900px相当から520pxへ変更後、Assistant #4のgreen `Phase`へ正しく移動した。確認後にviewport設定を解除した。
- 一覧の編集からgreenマーカーのメモを変更し、一覧へ即時反映した。サーバー停止・`npm.cmd start`・ブラウザ再読込後も変更内容と全マーカーが復元された。
- DB側で更新したメモが画面の「再読込」で一覧へ反映され、その後、同一文を持つAssistant #3のred `確認`へ正しく移動した。
- 削除確認用マーカーを一覧から削除し、件数が `7 / 7件`から`6 / 6件`へ変わり、本文の該当markも消えた。
- unresolvedは引用、メモ、`source_text不一致`を表示し、「ジャンプ不可」がdisabledだった。編集・削除ボタンには到達できた。

実画面確認後、既存の`test`会話へ追加したPhase 2B専用fixtureはすべて削除し、開始時のマーカー0件へ戻した。Phase 2A実機検証会話の既存マーカーは変更していない。

## 保全確認

- Phase 0 / Phase 1A / Phase 1B / Phase 2Aの追跡成果物: 差分なし
- migration `001_initial.sql` / `002_live_runs.sql` / `003_highlights.sql`: 差分なし
- Phase 2A Highlight保存形式とanchor契約: 変更なし
- `sample/RpenProof` 参照元72ファイル: ハッシュ変更0件
- Phase 0 PoCおよびRpenProofからのruntime import: なし

## 判定

Phase 2Bの要求を満たしたため **合格** と判定する。Question Keep、Mode B、miniMAP、複合エクスポート、複数マーカー質問は未着手で、Phase 2Bで停止する。
