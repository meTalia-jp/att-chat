# Marker一覧実用化

2026-09-17。既存一覧を表示専用で改善。保存方式・別一覧は追加していない。

## 変更概要

- `src/client/marker-list.ts`: `markerExcerpt`を追加。
- `src/client/MarkedTurns.tsx`: Markerごとの全文表示/閉じるを追加。
- `tests/marker-list.test.ts`: 文字境界とanchor不変のテストを追加。
- 本文書を追加。既存core-status-and-next-phase.mdは無変更。

## excerpt仕様とgrapheme処理

既存marker.tsのgrapheme検証と同じ`Intl.Segmenter('ja', {granularity:'grapheme'})`を使用。既存関数はoffset境界判定用なので変更せず、表示関数で同じ標準APIを使う。先頭60 graphemeを取り、61個目が存在する場合だけ「…」。60以下は全文をそのまま表示し、不要な展開ボタンは出さない。日本語・emojiのZWJ列・肌色・結合文字・国旗を分断しない。改行や空白は正規化せず維持する。

全文表示では元target_textを表示し、閉じると抜粋に戻る。各Marker独立。会話切替、再読込時は折り畳む。filterのON/OFFだけでは展開状態を保持する。標準button、aria-expanded、aria-controlsを使用し、buttonの入れ子はない。

target_text/source_text/offsetを変更せず、excerptは保存・API・再アンカーへ渡さない。DBへの書き込みは既存の明示編集/削除のみ。

## jump / unresolved

既存jump関数とlocateHighlightElementsは変更なし。highlight_id/turn_id/offsetで現在の描画要素を特定、focusと約1.8秒強調を維持。全文切替とjumpは別ボタンで操作競合を避ける。

unresolvedの理由表示、jump/Related/Keep作成/Context Compare不可、編集/削除可能を維持。全文切替はunresolvedでも可能。User Marker登録は解禁しない。

## 検証結果

- npm test: 215件、213 PASS、2 skip、0 fail。既存のChat/streaming/cancel/storage/Highlight/Keep/Semantic/Retrieval/Context/Study P0回帰を含む。実モデルopt-in 2件は未実行。
- typecheck成功、build成功、git diff --check指摘なし。
- 新テスト: 0/59/60/61 grapheme、日本語・英字・数字・emoji・結合文字・国旗・改行、凍結Highlightの保存項目不変、同文別Turnの位置特定。
- 実ブラウザ: 分離した一時SQLiteと既存mock APIを使用。4色、メモあり/なし、初期抜粋、全文表示、Enterで閉じる、Tab/Enterでjump、同文の別Turnへのfocus、unresolved展開と禁止操作、色filter、UIメモ編集の即時反映を確認。
- 削除は一時データに既存DELETE APIを実行し204、reloadで4件→3件を確認。削除APIの回帰テストも成功。reload後は全文展開が解除されることを確認。
- 最初の人工fixtureはMarkdownが描画しない末尾空白まで含み、既存jumpが位置特定を拒否した。描画可能な範囲でfixtureを作り直しjump成功。アプリ側のanchorやjump仕様は変更していない。

## 既知の制限・保全

改行を多数含む抜粋は60 grapheme以内でも複数行になる。メモは全文のまま。展開状態は永続化しない。今回実モデル通信の再試験は行わず既存回帰テストで確認した。

DB migration/schema、package/dependency、Study P0、既存データ契約、既存調査文書は無変更。検証用サーバー・ブラウザを終了し一時DBを削除。commit/push/tagは行わない。
