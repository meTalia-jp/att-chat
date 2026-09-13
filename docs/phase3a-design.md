# Phase 3A Question Keep 設計・状態遷移

基準コミット: `cdad567e7f4fdf81f34f013fd639b460e80b0ab7`

## 役割と保存形式

Highlightは原文を参照するメモ、Question Keepは後で質問したい下書き、GenerationRunは実際の生成記録として分離する。新テーブルquestion_keepsにkeep_id、highlight_id、question_draft、memo、status、created_at、updated_at、asked_atを保存する。Highlightの列とanchor契約には変更を加えない。Keep操作によってTurnやGenerationRunを作成・変更することはない。

Highlight 1:N QuestionKeepとし、同じマーカーに複数の疑問を残せる。下書き・メモは空欄を許可し、それぞれ最大10,000 UTF-16単位、NUL禁止、改行はLFへ正規化する。省略時は空文字。Keepはpending、asked_at=NULLで作成する。ID・highlight_id・created_atは不変、更新日時は単調増加とする。

新migrationは`004_question_keeps.sql`。001/002/003は変更しない。外部キー、状態とasked_atの整合CHECK、作成・更新triggerを設ける。

## unresolvedの扱い

新規作成はresolvedのcompleted Assistant Highlightだけを許可する。Repositoryで既存のHighlight検証を通し、source_text不一致などでunresolvedなら409で拒否する。

作成後に参照HighlightがunresolvedになってもKeepは残す。一覧で理由を表示し、下書き・メモの編集、取り下げ、削除は許可する。自動再アンカーや質問送信は行わない。

## 状態遷移

| 現在 | 操作 | 結果 | Phase 3A |
|---|---|---|---|
| 未作成 | resolved Highlightから作成 | pending、asked_at=NULL | 許可 |
| pending | 下書き・メモ編集 | pending | 許可 |
| pending | 取り下げ | dismissed、asked_at=NULL | 許可 |
| dismissed | 下書き・メモ編集 | dismissed | 許可 |
| dismissed | pendingに戻す | pending、asked_at=NULL | 許可 |
| pending | 質問送信による確定 | asked、asked_at必須 | スキーマのみ用意。UI/APIは拒否 |
| asked | 下書き編集・状態変更 | 変更なし | 拒否 |
| 各状態 | Keep削除 | Keep消去 | 許可 |
| 各状態 | Highlight削除 | 関連Keepも消去 | 許可 |

askedは将来の送信処理のための予約状態で、Phase 3Aでは自動・手動とも発生させない。asked一覧は用意するが、通常操作では空になる。将来のRunとの関連付けや成功・失敗時のasked確定条件はPhase 3B以降で設計する。

## 削除整合性

`highlight_id REFERENCES highlights(highlight_id) ON DELETE CASCADE`により、pendingだけでなく全状態の関連Keepを同時削除する。Keepがあることによって既存Highlight削除操作を止めない。画面上に連動削除を明記する。

Keep削除はHighlightを削除しない。Highlight削除中にDBエラーが出た場合は単一SQL statementがロールバックされ、HighlightとKeepの双方が残る。

## APIと本体統合

| Method | URL | 用途 |
|---|---|---|
| GET | `/api/conversations/:id/question-keeps` | 会話内Keep取得、作成日時・ID順 |
| POST | 同上 | highlight_id、question_draft、memoでpending作成 |
| PATCH | `/api/conversations/:id/question-keeps/:keepId` | 下書き、メモ、pending/dismissedを更新 |
| DELETE | 同上 | Keep削除 |

他会話のHighlight/Keepは404で拒否。未知フィールド、asked変更、不正型は400、unresolved新規作成は409。DB失敗は既存HTTP層で非2xxになり、UIは保存成功として扱わない。送信先を指定する項目や送信APIは追加しない。

既存マーカー一覧に「質問キープ」を追加し、独立したQuestionKeepsコンポーネントで入力・状態別一覧を表示する。初期表示はpending。取得中の旧会話応答をcleanupで無視し、会話切替時にはコンポーネントを分離する。画面再読込とHighlight削除後はKeepも再取得する。保存ボタンは処理中無効化し、同時実行を防ぐ。

## 保全と既知の制限

- 過去Phase文書・selection-poc・RpenProof・既存migrationを変更しない。本体統合のためMarkedTurns、main、HTTPルーティング、Repository初期化、migration登録だけを必要に応じて変更する。既存回帰テストは保持し、migration数を4に更新、再起動テストへKeep復元のassertを追加した。
- KeepとRunの対応、実質問送信、Mode B、miniMAP、複合エクスポートは未実装。
- 一覧は現在の会話単位。検索、ページング、大量データ性能、多端末同時編集は対象外。同一Keepの同時編集は最後の保存が優先される。
- 通信応答が失われた場合は再読込で保存結果を確認する。POSTのネットワーク再送に対するidempotency keyは未実装。
- デスクトップChromiumで実画面確認。タッチ操作と他ブラウザは未検証。
