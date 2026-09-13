# Phase 2A AttMarker統合 設計メモ

## 範囲

Phase 2Aは、Phase 0で確定したanchor契約をPhase 1Bの実チャットへ統合する。対象はcompleted Assistant Turn内の連続範囲、4色、任意メモ、SQLite永続化、編集、削除、再描画までとする。マーカー一覧・ジャンプ、Question Keep、Mode B、miniMAP、複合エクスポートは実装しない。

Phase 0のデータ契約は変更していない。`experiments/selection-poc` から実行時importせず、選択変換の考え方だけを本体の `src/client/marker.ts` と `src/client/TurnMarkdown.tsx` へ移植した。

## データ契約

- anchorは `turn_id + start_offset + end_offset`。offsetはUTF-16 code unit、範囲は `[start_offset, end_offset)`。
- 登録時に `source_text === turn.content.slice(start_offset, end_offset)` を必須とする。`target_text` は画面上の選択文字列として別保存する。
- 対象Turnは `role=assistant` かつ `status=completed` に限定する。User、generating、cancelled、failedは拒否する。
- `Intl.Segmenter` のgrapheme境界で開始・終了する範囲だけを受け付ける。
- 同一Turn内で交差する範囲、包含、完全一致を拒否する。半開区間が接する隣接マーカーは受け付ける。
- anchorと引用は作成後不変。編集できる項目は色とメモだけで、削除後に必要なら新規登録する。
- 読込時に原文との一致を毎回検査する。不一致を検出したマーカーは位置を維持したまま `unresolved` とし、描画しない。原文が後から一致しても自動でresolvedへ戻さず、再アンカーもしない。

## SQLiteとmigration

新規migrationは `003_highlights.sql`。既存の `001_initial.sql` と `002_live_runs.sql` は変更していない。

`highlights` は要求された10項目に `status` と `reason` を加えたSTRICTテーブルである。色、offset、空文字、CR、メモ最大10,000文字をCHECK制約で検証する。外部キーでTurnを参照し、INSERT triggerでcompleted Assistant Turnと範囲重複を検証する。UPDATE triggerはanchor、引用、作成日時の変更を拒否し、更新日時が進むことを保証する。

SQLiteの文字関数はUnicode code point基準で、JavaScriptのUTF-16 offsetをそのまま検証できない。このためsource一致とgrapheme境界はRepositoryで検証し、DB triggerは役割・状態・重複・不変項目を防御する。公開APIは必ずRepositoryを通る。

## RepositoryとAPI

Repositoryは作成、会話またはTurn単位の取得、色・メモ編集、削除を提供する。作成と読込時検証はTurn本文を直接参照する。重複判定は `existing.start < new.end && new.start < existing.end` で、隣接を除外する。

APIは次の通り。

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/conversations/:id/highlights` | 会話内のマーカーをTurn順・offset順で取得 |
| POST | `/api/conversations/:id/highlights` | anchor、引用、色、メモを登録 |
| PATCH | `/api/conversations/:id/highlights/:highlightId` | 色とメモを編集 |
| DELETE | `/api/conversations/:id/highlights/:highlightId` | 削除 |

未知フィールド、会話外Turn、会話外Highlight、不正状態、重複、source不一致は非2xxとし、成功扱いしない。

## UIとstreaming境界

completed Assistant Turnだけを位置情報付きMarkdownとして描画する。generating中を含むその他のTurnは位置情報のない`pre`表示なので、選択からanchorを生成できない。通信完了とcompleted保存の後にReactが再描画して初めて選択可能になる。cancelled / failedの部分本文も対象外である。

選択後のパネルで色とメモを指定して登録する。描画済みマーカーをクリックすると色・メモの編集と削除ができる。resolvedマーカーだけを原文offsetで分割して`mark`要素として描画する。

## 移植元と独立性

基準スナップショットはPhase 2A開始時の `f5a05976f1bc1ca02a73316b4e106372a227aa32`。参照したPhase 0実装は `experiments/selection-poc/src/selection.ts`、`experiments/selection-poc/src/Markdown.tsx`、`experiments/selection-poc/src/contracts.mjs`。本体の型、API、永続化、状態境界に合わせて再構成しており、PoCおよび `sample/RpenProof` へのruntime依存はない。RpenProofの既存出典記録は変更していない。

## 既知の制限

- Markdownの対応範囲は [Phase 2A Markdown対応範囲](phase2a-markdown-support.md) の通り。任意のMarkdown変換を保証しない。
- unresolvedは描画しない。Phase 2Aには一覧UIがないため、unresolvedの閲覧・削除UIは後続範囲となる。APIからは状態と元anchorを取得できる。
- デスクトップChromiumで検証した。Safari、Firefox、モバイルのタッチ選択、スクリーンリーダーの範囲選択は未検証。
- 色・メモ編集は保存済みanchorを変えない。範囲を変える操作は削除と再登録になる。
