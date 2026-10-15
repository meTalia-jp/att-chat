# Att-Chat Marker Detail Cleanup v0.3

## Purpose

Marker Detailを、質問を書く、必要ならメモを残す、送信先を確定する、という上から下への操作順に整理した。Marker保存、Immediate Ask、Deferred Ask、Question Keep、miniMAP、削除lifecycleの契約は変更していない。

## Detail変更前後

変更前は上部の「今すぐ質問 / 後で質問」が入力モードを切り替え、質問入力、質問メモ、Marker色、Marker memo、更新、確定操作が並んでいた。変更後はモード選択を廃止し、次の順に固定した。

1. Marker引用
2. prefix（質問 / しかし… / 意見）
3. AIへの質問
4. メモ
5. 今すぐ質問 / 質問箱（後で質問）
6. 低強調の削除 / メモを保存

「今すぐ質問」は既存Immediate Ask準備処理を直接呼び、「質問箱（後で質問）」は既存Question Keep作成APIを直接呼ぶ。どちらも自動送信やschema変更は行わない。

## 色UI削除

Marker色selectをDetailから削除した。色変更処理は削除せず、`▽ ● ● ● ● ▷` のQuick Action Signalを正規UIとして維持する。

## AIへの質問 / メモ

- `AIへの質問`は主入力で、4行開始、実寸94px、最大184pxで内部scrollする。
- `メモ`は補助入力で、2行開始、実寸約49px、最大96pxで内部scrollする。
- メモ変更後にImmediate AskまたはQuestion Keepを確定した場合は、既存Marker memo更新を先に通す。
- 質問を送らずメモだけ保存する既存用途のため、低強調の`メモを保存`を残した。
- Question Keep作成時は同じメモ文字列を既存`memo`へ渡す。

## Detail幅とbutton配置

- 通常幅は352px。
- 1099px以下は340px、800px以下は320pxを上限とし、いずれもviewport幅から24pxを引いた値へclampする。
- 主操作2ボタンは同じ行の等幅配置にした。
- `削除`は左下の低強調操作、`メモを保存`は右下の低強調操作とした。
- Marker Interaction Anchor Stabilization v0.2.1の位置計算、scroll / resize追従、viewport clampは変更していない。

## Responsive確認

実ブラウザで既存Markerを開き、次を測定した。

| viewport | Detail | 質問欄 | メモ欄 | 横overflow |
|---|---:|---:|---:|---|
| 1024 × 768 | 340px | 314 × 94px | 314 × 48.8px | なし |
| 1280 × 800 | 352px | 326 × 94px | 326 × 48.8px | なし |
| 1920 × 1080 | 352px | 326 × 94px | 326 × 48.8px | なし |

1024pxではDetail全体がviewport内にclampされ、2つの確定ボタン、削除、メモ保存まで表示できた。色UIが存在しないこと、prefix挿入後に今すぐ質問が有効になること、質問箱ボタンが利用可能なことも確認した。

## Tests

- Marker focused tests: 8 pass / 0 fail
- `npm test`: 342 total / 340 pass / 2 skip / 0 fail
- `npm run typecheck`: PASS
- `npm run build`: PASS
- `git diff --check`: PASS（既存working treeのCRLF変換警告のみ）

全体UIテストでモデル一覧の取得完了前にselectを操作するタイミング揺らぎがあったため、該当する既存2テストは固定sleepだけに依存せず、fixtureモデルoptionの出現を待つようにした。Productionのモデル処理は変更していない。

## Existing contracts

Marker anchor、色token、Quick Action Signal、Immediate Ask、Deferred Ask / Question Keep、miniMAP、delete lifecycle、Composer、DB schema、migrationには変更を加えていない。
