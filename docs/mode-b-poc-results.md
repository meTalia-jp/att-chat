# Mode B ContextBuilder PoC 検証結果

基準コミット: `7703b0195af6d2896f75a48a33f08ee599b75e9c`。

## 判定

合格。quote_only baseline、同一Turn前後文脈、全予算・比率、grapheme保全、snapshot/preview比較が成立。正式送信フローおよびDB schemaを変更せず、既存74件の回帰を確認した。実モデル通信・回答品質評価は行っていない。未コミットで停止する。

## 自動検証

- 型検査: 成功。
- npm.cmd test: 97件成功（既存74件 + Mode B 23件）、失敗0。
- ビルド: 成功。通常index.htmlと独立mode-b-poc.htmlを出力。
- git diff --check: 成功。
- 最初の型検査でES2022にないArray.findLast使用を検出し、通常ループへ変更。設定のtargetを変更せず再検証。

追加23件はbaseline/入力不変1、予算×比率9、Turn端/再配分/短いTurn5、emoji/ZWJ/結合文字4、繰返しとMarkdown1、不正anchor1、対象外Turn1、不正parameter等1。
graphemeテストでは全9組合せについて全offsetが境界であること、予算超過なし、原文sliceとの完全一致を確認。source不一致、unresolved、Turn ID不一致、非整数/範囲外offsetを拒否。
既存回帰は通常生成、streaming、cancel、failed、interrupted、DB rollback、Keep 1:N、migration前後v1/v2データ保全、再起動復元を含む。

## 実ブラウザ比較

実データを変更しないメモリSQLiteで検証用Conversation/User/仮Assistant/Highlightを作成し、既存サーバーをport5184で起動。新規永続テーブル・データファイルは作成していない。
独立画面でConversation/Highlight選択、質問「質問」、モデル「fixed-model」を固定。以下6条件を順にBuildし、先行結果が残り、UTF-16長とsnapshot/previewを見比べられることを確認した。

代表Turn原文は `あ × 1200 + 引用😀 + Z × 1200`（全2404 UTF-16）。引用は `[1200,1204)`、4 UTF-16。日本語beforeとASCII afterを使い、budget/offsetを独立に照合しやすくした合成検証用Highlight。

| 条件 | before | after | context範囲 | 引用範囲 | 未使用予算 |
|---|---:|---:|---|---|---:|
| quote_only | 0 | 0 | [1200,1204) | [1200,1204) | 0 |
| 300 / 5:5 | 150 | 150 | [1050,1354) | 同上 | 0 |
| 600 / 5:5 | 300 | 300 | [900,1504) | 同上 | 0 |
| 600 / 6:4 | 360 | 240 | [840,1444) | 同上 | 0 |
| 600 / 7:3 | 420 | 180 | [780,1384) | 同上 | 0 |
| 1000 / 6:4 | 600 | 400 | [600,1604) | 同上 | 0 |

本文の実出力はそれぞれ表のbefore回数の「あ」、固定「引用😀」、after回数の「Z」。例えば600/6:4のrequest_preview.messages[1].contentは、以下の `×N` をその文字のN回反復に展開した文字列。

```text
[参照文脈]
あ × 360

[引用]
引用😀

[続き]
Z × 240

[質問]
質問
```

baselineは `[引用]\n引用😀\n\n[質問]\n質問`。system文・モデルID・stream・max_tokensは全条件で同じ。各結果にはparameters、source_range、元Conversation/Turn/Highlight ID、原文引用、表示引用も保持される。

## 端・文字境界と比較上の観察

- 600/6:4でbeforeが50しかない場合、50/550。afterが50しかない場合、550/50。先頭では0/600、末尾では600/0。
- 前20/後30の短いTurnは20/30で未使用550。引用長は別枠。
- 中央では5:5→6:4→7:3でbeforeが60ずつ増え、afterが60ずつ減る。固定budgetの中で取り込む原文範囲が移動する。
- Turn端で再配分すると指定比率から実比率が離れる。同じbudgetなら比率を変えても同じ全前後範囲になる場合がある。
- surrogate pair、ZWJ家族絵文字、e+結合アクセント、か+結合濁点は分割しない。丸め分は未使用予算として残す。
- Markdown例では原文 `同じ **語**` と表示 `同じ 語` を区別して出力。原文A/Bは同じ引用を使用し、既存表示baselineも別途再現する。
- この検証は範囲生成の正しさを確認するものであり、どの比率が最良かは結論しない。

## 保全

過去Phaseドキュメント、selection-poc、migration001〜006、既存src/client・src/server・src/shared、既存テストは基準から差分なし。既存ファイルの変更はvite.config.tsのビルドentry追加のみ。RpenProof参照元72ファイルのSHA256は変更0件。実験モジュールにPoC/RpenProofからのruntime importなし。

ブラウザ起動ツールに一度長い応答待ちがあったが、画面表示と6条件の連続Buildは正常に完了。検証用メモリサーバーを停止して終了する。
