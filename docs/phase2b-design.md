# Phase 2B マーカー一覧・ジャンプ 設計メモ

## 範囲

Phase 2Bは、現在の会話に保存されたHighlightを一覧表示し、色フィルタ、描画位置へのジャンプ、短時間の視覚強調、一覧からの編集・削除導線を提供する。Phase 2Aのanchor契約、Highlight保存形式、Repository、API、migration `003_highlights.sql` は変更しない。Phase 2B用migrationは不要である。

Question Keep、Mode B、miniMAP、複合エクスポート、複数マーカー質問は実装しない。

## 一覧

既存の `GET /api/conversations/:id/highlights` が返すTurn順・UTF-16 offset順を維持して表示する。各項目は色、Assistantのsequence番号、`target_text`による引用、メモ、resolved/unresolved状態を表示する。

色フィルタはクライアント内の表示対象だけを切り替える。Highlightの色にAI向けの意味や優先度を付けず、API、DB、GenerationRun、request snapshotへフィルタ状態を渡さない。個別4色のON/OFFに加え、全表示・全非表示を提供する。

## ジャンプ

DOM座標、スクロール位置、viewport情報は保存しない。ジャンプごとに現在の描画DOMから次を照合する。

1. 一覧項目の `highlight_id` と同じ `data-highlight` を持つ描画要素を探す。
2. 最寄りのTurn要素が保存済み `turn_id` と一致するものだけを残す。
3. 描画断片の `data-s` / `data-e` が保存済み `[start_offset,end_offset)` の両端を満たすことを確認する。
4. 一致した最初の断片を画面中央へscrollし、同じHighlightの全断片を1.8秒間強調する。

このため、同一文が同一Turnや別Turnに複数存在しても文字検索による取り違えは起きない。Markdown装飾をまたぐHighlightが複数の`mark`要素になる場合は、同じIDの断片をまとめて強調する。表示幅変更、再描画、再読込、サーバー再起動後も現在のDOMから特定し直す。

`prefers-reduced-motion`が有効な環境ではsmooth scrollと点滅animationを抑え、outlineによる強調は維持する。ジャンプ後は対象要素へfocusを移して現在位置を明確にする。

## unresolvedと編集・削除

unresolvedも一覧から除外せず、保存済み引用、色、メモ、`reason`を表示する。本文中には描画されないためジャンプ操作はdisabledとし、コード側でもresolved以外の位置検索を拒否する。自動再アンカーは行わない。

一覧の「編集」はPhase 2Aの編集パネルへ移動し、色とメモだけを変更できる。「削除」は既存DELETE APIを呼び、成功後に一覧と本文描画の双方から即時除去する。anchorを編集する経路は追加しない。

「再読込」はConversation/Turn/RunとHighlightをそれぞれDBから再取得する。会話切替中に古い取得結果が混入しないよう、Highlight取得のcleanupを行う。

## 既知の制限

- 一覧対象は現在選択中の1会話で、検索、並び替え、ページングはない。大量マーカーの性能は未検証。
- フィルタ設定はブラウザへ永続化せず、ページを開き直すと全色ONへ戻る。
- unresolvedの色・メモ編集と削除はできるが、anchor修復UIはない。
- Markdownの対応・拒否範囲はPhase 2Aから変更していない。
- デスクトップChromiumで検証した。Safari、Firefox、モバイルのタッチ操作は未検証。
