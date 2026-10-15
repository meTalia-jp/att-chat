# Att-Chat UI Cleanup v0.1

## 目的

Production UIから、通常利用時に不要な診断表示、冗長表示、表記揺れを減らした。DB schema、GenerationRun、Marker、Question Keep、送信契約は変更していない。

## 消した通常表示

- completed Turnの `完了` 表示を通常のTurn見出しから外した。`You / Assistant` と `Txx` は維持した。
- Turn状態は `生成中`、`失敗`、`キャンセル` など、ユーザーが知る必要がある状態だけを表示する。
- Generationの正常終了 `succeeded` はComposer下へ表示しない。
- 正常終了以外は、失敗、キャンセル、中断、保存失敗を日本語の案内として表示する。
- Marker参照が0件のときは参照欄を表示せず、空Composerの高さを増やさない。

## Developerへ移した表示

- GenerationRunのoutcome、ID、request snapshot、reference snapshotは既存の `Run詳細` に残した。
- `保存確認用操作` は通常の中央Conversationから隠し、`設定 > Developer / Experimental > 保存確認用操作を表示` で明示的に有効化する方式へ変更した。
- Marker管理とRun詳細も従来どおり初期OFFを維持する。
- 実ブラウザで初期状態ではDeveloper用summaryが0件であり、トグルを有効にすると保存確認用操作が再表示されることを確認した。

## Left Sidebar整理

- 見出しを `会話` に簡潔化した。
- 新規作成は `タイトル（任意）` と `＋ 新規チャット` を縦に並べ、各32px高へ整理した。
- Conversation itemは最小36px高とし、長いtitleは1行省略表示、完全なtitleはtitle属性で確認できる。
- 選択中itemは淡い背景と左境界で示し、一覧内の主対象を判別しやすくした。
- 長いtitleでも左Sidebarの横スクロールは発生しないことを確認した。

## Right Sidebar整理

- Quick tool領域を198pxに抑え、miniMAPの残り高さを維持した。
- Quick辞書 / Quickメモのtabは30px、入力と操作buttonは32pxを基準にした。
- section境界、padding、本文の行間、出典表示を整理した。
- 右Sidebarのopen / close buttonは1024 / 1280 / 1920の各幅で画面内に収まる。
- Quick辞書、Quickメモ、miniMAPの機能契約は変更していない。

## 表記統一

- 通常操作は `モデル`、`ユーザー基本プロンプト`、`プリセット`、`新規チャット`、`最後の会話を開く` を基準にした。
- Start Screenの英語見出しを `会話ワークスペース` に変更した。
- Settingsの主要sectionを `一般`、`モデル`、`保存` に統一した。
- `Quick辞書`、`Quickメモ`、`Marker`、`miniMAP`、`Developer / Experimental` は既存の機能名として維持した。
- DBへ既に保存済みのConversation titleは書き換えていないため、過去データの `新しいチャット` はそのまま表示される。

## 1024 / 1280 / 1920確認

隔離DBとProduction React UIを使い、completed Turn 2件、長いConversation title、空Composerを表示して計測した。

| viewport | Right | Left | Center | Right幅 | Composer | Turn max-width | 横overflow |
|---|---|---:|---:|---:|---:|---:|---|
| 1024×768 | open | 180px | 565px | 220px | 136px | 980px | なし |
| 1024×768 | closed | 180px | 753px | 32px | 136px | 980px | なし |
| 1280×800 | open | 200px | 761px | 240px | 136px | 980px | なし |
| 1280×800 | closed | 200px | 969px | 32px | 136px | 980px | なし |
| 1920×1080 | open | 200px | 1401px | 240px | 136px | 980px | なし |
| 1920×1080 | closed | 200px | 1609px | 32px | 136px | 980px | なし |

1024pxでは長い中央titleが自然に折り返され、左の長いConversation titleは省略される。Right Sidebar openでもConversation本文とComposer操作が成立し、closedでは188pxがCenterへ戻る。

## Browser / Electron確認

- Browser: 1024×768、1280×800、1920×1080でRight Sidebar open / closedを実測した。
- 通常画面の `完了` と `succeeded` は各幅で0件だった。
- Electron renderer: 1280×720で同じProduction React UIを確認した。
- Electron rendererでもComposer 136px、横overflowなし、Developer操作0件、Right Sidebar表示、compactなモデル表示を確認した。
- Electron専用CSSは追加していない。

## 検証

- `npm test`: 341 total / 339 pass / 2 skip / 0 fail
- `npm run typecheck`: PASS
- `npm run build`: PASS
- `git diff --check`: PASS
- UIテストの並列実行で非同期描画待ちが不足した2箇所は、実装契約を変えず描画待機時間だけを広げて安定化した。

## 残るUI課題

- 上部の処理メッセージは操作フィードバックとして残している。常時履歴化や通知領域の再設計は今回行っていない。
- 既存Conversation titleそのものの一括表記変換はデータ変更になるため行っていない。
- さらに狭い画面向けの1カラム化やtool railは今回の対象外。
