# Att-Chat UI Final Audit v0.1

## Scope

Production UIの3カラム構成と既存機能契約を維持したまま、中央Conversationへ横幅と縦方向の表示領域を戻した。DB、API、送信request、snapshot、Settings永続化は変更していない。

## Center幅変更

- 通常幅のLeft Sidebarを220pxから200px、Right Sidebarを268pxから240pxへ調整した。
- 1024px以下の確認範囲ではLeftを180px、Rightを220pxとした。
- 3カラム間gapを通常20pxから14px、1024px帯では12pxから10pxへ縮小した。
- Right Sidebar閉鎖時の残存幅を38pxから32pxへ縮小した。
- 旧固定miniMAP用の共通ルールが1100px以上で`main`へ120pxの右paddingを追加していたため、Productionの3カラム内では`padding-right: 0`で上書きした。

## Turn max-width変更

Assistant Turnを含むConversation本文の最大幅を860pxから980pxへ広げた。User Turnは右寄せと控えめな表示を維持し、最大760px・Center幅の86%とした。

## Right Sidebar toggle修正

toggleをSidebar左外側の負の位置から、Sidebar右端内側へ移した。open時は右4px、closed時は右2pxにclampされる。1024 / 1280 / 1920の全条件でボタン全体がviewport内に入り、横スクロールは発生しなかった。

## Composer高さ Before / After

- 通常空状態: 約242pxから136pxへ縮小。
- 入力欄: 初期72pxから42pxへ縮小。
- 複数行入力: 内容に合わせて自動拡張し、136pxで上限に達した後は入力欄内部をscrollする。
- Immediate Ask 1件: 229px。
- Immediate Ask 3件: 289px。3件目から既存のcompact表示と内部scrollを使用した。
- 停止操作は生成中だけ視覚表示し、非生成時はdisabled状態のままレイアウトから外した。既存の停止処理契約は維持している。
- Model表示は小さな現在モデル名、送信操作と同じ下段に維持した。

## reference 0件時の表示変更

Immediate Ask参照が0件の場合、`参照中`、`0/5件`、説明文を描画しない。1件以上の時だけ参照領域を表示する。最大5件、同一Marker置換、3〜5件compact + scrollのpolicyは変更していない。

## Preview

Context Preview / Handoff Previewの既存`details`、max-height、内部scrollを維持した。Previewがない通常状態は150pxのComposer予約高を使い、参照・Context設定・開いたPreviewがある時だけ必要な下部余白を確保する。

## Header / Conversation title

起動状態、再読込、設定を上部の1行へまとめ、Conversationレイアウトの開始位置を約151pxから46〜48pxへ移動した。Conversation titleの上下paddingも縮小し、本文を上方へ広げた。

## Responsive measurements

値はProduction Browserで長文Assistant fixtureを表示して計測した。Center / Turn / ComposerはCSS pixel、overflowは`documentElement.scrollWidth - innerWidth`で、負値は横overflowなしを示す。

| Viewport | Right | Left | Center | Right width | Composer empty | Turn width | Horizontal overflow |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1024 × 768 | open | 180 | 565 | 220 | 136 | 565 | -15 |
| 1024 × 768 | closed | 180 | 753 | 32 | 136 | 753 | -15 |
| 1280 × 800 | open | 200 | 761 | 240 | 136 | 761 | -15 |
| 1280 × 800 | closed | 200 | 969 | 32 | 136 | 969 | -15 |
| 1920 × 1080 | open | 200 | 1401 | 240 | 136 | 980 | -15 |
| 1920 × 1080 | closed | 200 | 1609 | 32 | 136 | 980 | -15 |

変更前との比較では、1024pxのCenterはopen 523→565px、closed 715→753px、1280px openは689→761pxとなった。Turn本文は1920pxで980pxへ到達し、それ以上に広がりすぎない。

## Browser / Electron確認

- Browser: 1024 × 768、1280 × 800、1920 × 1080でRight Sidebar open / closed、空Composer、長文入力、Immediate Ask 1件 / 3件、長いAssistant Turnを確認した。
- Electron: `npm run electron:dev`のrenderer URLで同じProduction React UIを確認した。1280pxで`200px / 761px / 240px`、空Composer 136px、参照0件非表示、toggle全表示、横overflowなしだった。
- Electron専用CSSは追加していない。

## Validation

- `npm test`: 340 total / 338 pass / 2 skip / 0 fail
- `npm run typecheck`: PASS
- `npm run build`: PASS
- `git diff --check`: PASS
- UI focused tests: Composerの0件非表示、136px auto-grow上限、5件compact policy、980px Turn上限、32px collapsed Sidebar、toggle clampを確認。

## 残るUI課題

- 1024pxでRight Sidebar open時のCenterは565pxのため、長い表や横長code blockはTurn内部scrollが必要になる。
- Immediate Ask 3〜5件やContext設定表示中はComposerが約300pxまで拡張する。既存policyどおり内部scrollで制限しているが、実使用で密度評価が必要。
- Left SidebarのConversation titleが非常に長い場合の密度は今回変更していない。
- 800px以下の狭幅は既存responsive構造を維持した。モバイル相当の全面再設計は対象外。
