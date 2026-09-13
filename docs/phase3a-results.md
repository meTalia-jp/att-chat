# Phase 3A 検証結果・合否判定

検証日: 2026-09-14。基準コミット: `cdad567e7f4fdf81f34f013fd639b460e80b0ab7`。

## 自動検証

型検査、単体/API/プロセス再起動テスト47件、ビルド、git diff --checkが成功。

| 対象 | 結果 |
|---|---|
| HighlightからKeep作成 | pending、asked_at=NULLを確認 |
| 下書き空/あり、メモ空/あり | 保存・LF正規化を確認 |
| 同一Highlightに複数、複数Highlight | 1:Nと独立性を確認 |
| pending一覧、編集、dismissed、復帰、削除 | 状態と内容、件数を確認 |
| 他会話参照、存在しないHighlight | Repository/APIで拒否 |
| unresolved | 新規作成拒否、既存Keep保持・編集可 |
| asked | API変更拒否、DBでasked_at必須、asked更新拒否 |
| Highlight削除 | 全状態Keepのcascade削除、DB失敗時は両方保持 |
| 保存失敗 | API 500、Keep未作成 |
| 再取得・サーバー再起動 | Keep ID・下書き・メモ・状態・日時が完全一致 |
| migration 003→004 | 既存Conversation/Turn/Run/Highlight完全一致 |
| Phase 2B/2A/1B/1A回帰 | 既存41件を含め成功 |

## 実画面

通常DBとは別の`data/phase3a-ui.sqlite`、ポート5183を使用し、検証用mock回答のresolved Highlightから質問下書き「この表現の意味をあとで確認」とメモ「実画面検証メモ」を保存した。pending一覧に表示後、取り下げでdismissed一覧へ移動した。

専用サーバー停止後に`npm.cmd start`で再起動し、ブラウザを再読込した。dismissed一覧で元の質問・メモ・状態が復元された。さらに「キープ編集」から質問を「編集後の質問」へ更新し、一覧への反映と保存完了表示を確認した。削除整合性・空欄・1:N・unresolved・エラー処理は自動テストで確認した。

通常の`data/attchat.sqlite`へは接続せず、検証fixtureを追加していない。専用サーバーは確認後停止済み。質問送信操作は行っていない。

## 保全

過去Phaseの文書とPoC、migration 001/002/003、Highlight共有型、selection変換、Markdown renderer、marker-listの差分がないことを基準コミットと照合済み。RpenProofはPhase 0開始時manifestの72ファイルをSHA-256照合し、変更0件。PoC/RpenProofからのruntime importなし。

本体の統合箇所・回帰テストの必要な追加は[設計メモ](phase3a-design.md)に記録した。「過去Phase成果物の保全」は、本体の統合ファイルまで無変更という意味ではない。

## 判定

Phase 3A **合格**。Question Keepの保存・一覧・状態管理だけを実装。Highlightのanchor契約と保存形式は変更なし。質問送信・新しいチャットへの送信・Mode Bには進まず、Phase 3Aで停止する。コミットは別途指示時に行う。
