# Phase 0 データ契約 v1

確定日: 2026-09-11。適用範囲は独立selection-poc。Phase 1の通信・DBは実装しない。

## 決定

提示された候補を採用する。技術上の矛盾は見つからず、実ブラウザPoCでUTF-16原文位置の成立を確認した。追加決定は、grapheme途中の拒否、原文構文記号を選択端で自動拡張しないこと、対応外のMarkdown変換を推測しないこと。

### Turn

| 項目 | 契約 |
|---|---|
| turn_id | 空でない一意文字列。本文検索でTurnを同定しない |
| sequence_no | このPoC文書内で一意な0以上の整数。1Turn＝1発言 |
| role | user / assistant |
| status | completed / generating / cancelled / failed |
| content | Markdown文字列。Turn確定前にCRLFとCRをLFへ統一 |

completed本文は不変。PoCは編集UIを持たず、復元したTurnをObject.freezeする。finalizeTurnは生成中などのTurnからLF正規化済みの新しいcompletedオブジェクトを返し、completedの再確定を拒否する。今後も再試行・編集は新Turn IDとし、既存本文は置換しない。

JSON再読込はPoC文書全体の置換であり、既存Turnとのマージではない。Phase 1のDB更新・会話ID・移行契約は別フェーズ。PoCでは複数の固定Turnを1文書として扱う。

### Highlight

```text
highlight_id: string（空でない一意ID）
turn_id: string
start_offset: integer
end_offset: integer
source_text: string
target_text: string
color: yellow | red | green | blue
note: string（空文字を許可）
created_at: ISO日時
status: resolved | unresolved（復元時に再判定）
reason?: string（unresolvedの理由）
```

対象はcompleted assistant Turn内の連続範囲。1本で複数Turnを参照しない。generating、user、本文外の選択を拒否する。生成中本文のブラウザ選択自体をCSSで禁止する方式ではなく、**選択をマーカーとして取得・登録する操作を禁止**する。

位置の契約:

```text
unit = UTF-16 code unit
range = [start_offset, end_offset)
0 <= start_offset < end_offset <= turn.content.length
source_text === turn.content.slice(start_offset, end_offset)
```

これは表示上の文字数、UTF-8バイト位置、DOMノード内offset、ピクセル位置ではない。絵文字・ZWJ・結合文字はIntl.Segmenterのgrapheme境界で両端を検証し、文字の途中なら補正せず拒否する。ブラウザのUnicode実装差は今後の互換性検証対象。

target_textはSelection.toString()による選択時の表示文字列。source_textとは一致を要求しない。例えば `普通の文に **太字の対象** と ` の原文範囲は、表示では `普通の文に 太字の対象 と ` になる。

太字やリンクのラベルだけを選んだ場合、両端の `**`、`[]()`、URLを自動包含しない。選択が構文を横切る場合、その内部にある構文記号は原文範囲に含まれる。これにより位置の意味を選択端のテキストに統一する。

色は人間の視覚分類。noteは人間用メモ。前後文脈、質問、置換提案、校正状態は持たない。

### 重複

同一Turnで `a.start < b.end && b.start < a.end` なら重複。完全一致・包含・部分重複を拒否。`a.end === b.start` の隣接は許可。別Turnの同じoffsetは競合しない。既存unresolvedマーカーは描画・位置占有しない。

### 保存と復元

```text
format = attchat-selection-poc
schema_version = 1
turns[]
highlights[]
```

ブラウザ保存は `attchat-phase0-snapshot-v1` のlocalStorageへJSONを明示保存する。ページ再読込後は「保存データを再読込」で復元する。自動保存・自動起動復元・SQLiteはPhase 0の対象外。JSONファイル出力とファイル/貼り付け読込も同じserializerを使う。

形式・版・ID重複・Turn順序重複・不正role/status/color・確定原文中のCRなど、文書として不正な入力は全体を拒否する。状態を置換する前に検証する。

参照Turnなし、原文範囲不正、grapheme途中、source_text不一致は当該Highlightをunresolvedにする。元の位置と引用を保持し、再検索・自動補正しない。import内の重複アンカーは関係する全件をunresolvedにする。unresolvedは一覧に理由を表示し、本文へ描画せず、ジャンプを無効にする。

保存形式は信頼できる同PoCの往復を対象とする。外部で捏造したtarget_textの表示一致や未対応構造内アンカーの全面的検証、サイズ上限、未知フィールドの厳格な検証、複数会話のマージは本番importに向けた別契約である。JSONの余分なフィールドは復元モデルへ持ち込まない。

### 原文位置→描画→ジャンプ

Markdown AST由来の原文位置を表示テキストのspan/markへ付ける。確実にマップできない文字を選択が含む場合は拒否する。重複しない原文区間でテキストを分割してmark描画する。DOMパス・画面座標は保存しない。

一覧ジャンプはhighlight_idに対応する最初の描画markへscrollIntoViewし、focusを与える。1範囲が複数テキストノードへ分かれても同じIDを付ける。幅変更や再読込後は原文offsetから描画を作り直す。

## 次フェーズへの設計上の引継ぎ（未実装）

GenerationRunは通常チャットの送信試行ごとに新IDとし、user_turn_id / assistant_turn_id / retry_of_run_id、model、strategy版、実送信snapshot、時刻、outcomeを保持する。再試行で既存assistant Turnを上書きしない。

将来の複合出力はJSONを完全データの正本、MDを閲覧用表現とする。Phase 0のJSON形式はその製品用形式とは区別する。Question Keep、ContextBuilder、miniMAPは本契約の位置情報を使えるが、今回は追加しない。
