# Att-Chat Small UI Fix v0.9.1

## 目的

Ver1.0前の小修整として、固定Headerを必要最小限へ薄型化し、Conversation改名操作を見つけやすくした。改名を実ブラウザで確認したうえで、新規Conversation作成前のタイトル入力欄を撤去した。

Generation、Profile、Markerのデータ契約、DB schema、migrationは変更していない。

## Header薄型化

- Headerの固定flex basisを44pxから36pxへ縮小した。
- `Att-Chat`、状態表示、`再読込`、`設定`を維持した。
- Header内のgap、見出し文字、ボタンpaddingを縮め、ボタンの最小高さは28pxを確保した。
- Headerを独立行に置き、Left / Center / Rightが残り高さを使う既存構造は維持した。

実ブラウザ（1280 × 720）での計測:

- Header: 36px
- Center viewport: 660px
- Center content: 998px
- Center scroll後: `main.scrollTop = 338`
- `window.scrollY = 0`
- Header上端はCenter scroll前後とも12pxで不変

この結果から、ページ全体scrollへ戻らず、Centerを主スクロールとする構造が維持されていることを確認した。

## Conversation改名UI

選択中Conversationのタイトル横に、30 × 30pxの控えめな`✎`ボタンを追加した。`aria-label`とtooltipはいずれも`会話名を編集`とし、タイトル文字列をクリックする従来操作も残した。

編集開始後は既存フォームを維持する。

- `Enter`: 保存
- `Escape`: 取消
- `保存`: 明示保存
- `キャンセル`: 明示取消
- trim後が空: 保存ボタンをdisabled
- 同名: 許可

実ブラウザでは、`新規チャット`を`UI v0.9.1 改名確認`へ変更し、左一覧への即時反映、ブラウザ再読込後のStart ScreenおよびConversation画面での復元を確認した。`取消される名前`を入力してEscapeを押した場合は元タイトルを維持し、空白だけを入力した場合は保存できなかった。

## 新規作成時タイトル入力の撤去

左Sidebar上部の`タイトル（任意）`入力フォームを撤去した。現在の構成は次のとおり。

```text
会話
[＋ 新規チャット]
Conversation一覧
```

`＋ 新規チャット`は直接既存のConversation作成処理を呼び、即座に`新規チャット`という初期タイトルで作成する。Start Screenの`新規チャット`も同じ既存経路を維持する。Server APIの任意title契約は変更していない。

## Marker回帰確認

Header変更後の実ブラウザで次を確認した。

- miniMAPから既存Markerへ移動し、該当位置が表示される
- 保存済みMarker clickでQuick Action Signalが表示される
- SignalからMarker Detailが開く
- 最新completed Assistant Turnの本文を実際にdrag選択するとSignalが表示される
- 色clickでMarkerが即時保存され、選択色ringとDetail有効化が反映される
- Centerを別Turnへscrollした後、miniMAPから新しいMarker位置へ戻れる

Marker anchor、保存、Detail、miniMAPの実装契約には変更を加えていない。

## Tests

更新したUIテストでは次を固定した。

- 新規作成時タイトルinputが存在しない
- `＋ 新規チャット`が即時作成処理を呼ぶ
- `会話名を編集` affordanceと`✎`表示
- 編集開始、Enter保存、Escape取消、空文字拒否
- Headerの固定flex basisが36px
- Production UIからLaboratory依存を持ち込まない既存契約

## Validation

- Focused tests: 14 pass / 0 fail
- `npm test`: 379 total / 377 pass / 2 skip / 0 fail
- `npm run typecheck`: PASS
- `npm run build`: PASS
- `git diff --check`: PASS

実ブラウザ確認には通常ユーザーDBではなく、`.cache/ui-v091.sqlite`を使用した。
