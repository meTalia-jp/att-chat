# Att-Chat Selection PoC — Phase 0

固定Markdownを複数Turnで表示し、選択から原文offsetへの変換、4色マーカー、メモ、JSON保存・再読込、一覧ジャンプを検証する独立PoCです。

## 起動

Windows PowerShellで:

```powershell
cd D:\att-Chat\experiments\selection-poc
npm.cmd ci --ignore-scripts
npm.cmd run dev
```

[PoCを開く](http://127.0.0.1:5178/)。Node.js 24.19.0で検証しました。package-lock.jsonを使用してください。sample/RpenProofからのimportはありません。

## 手順

1. completedのASSISTANT本文をドラッグします。右側にturn_id、原文offset、source_text、target_textが表示されます。
2. 色と任意のメモを指定し「マーカーを登録」を押します。
3. 「JSONをブラウザ保存」を押します。
4. ページを再読込します。初期文書に戻ります。
5. 「保存データを再読込」で復元します。
6. 「表示幅を切替」を押し、マーカー一覧の引用を押すと同じ箇所へジャンプします。

保存は明示操作です。自動保存ではありません。ブラウザの保存はorigin依存です。別環境への持ち出しにはJSONファイル出力・読込、または検証パネルのJSON貼り付けを利用できます。

## テスト

```powershell
npm.cmd test
npm.cmd run build
```

画面下の「ブラウザ検証を実行」で36件の実DOMテストを実行します。同じMarkdown描画・選択変換・保存関数を使用し、テスト用の一時表示領域だけで検証します。結果は画面表示とJSON出力ができます。テストは現在の参照マーカーを変更しませんが、ブラウザ選択を解除します。

自動テストの逆方向選択はSelection.setBaseAndExtentによるものです。実ドラッグは別途確認済みです。詳細は [Phase 0結果](../../docs/phase0-results.md) を参照してください。

## 制限

同一Turn・同一対応ブロック内だけを対象にします。コードブロック、表、複数段落、エスケープなどの非一致テキスト、要素境界、文字途中、重複範囲は拒否します。対応表の制限を読んで使用してください。

このPoCには通信生成、LM Studio、SQLite、通常チャット、質問キープ、Mode B、miniMAPを実装していません。

RpenProof由来の選択的改変コードのライセンスはLICENSE-RpenProof.txt、出典はdocs/phase0-provenance.mdにあります。
