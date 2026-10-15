# Att-Chat Marker Quick Action Integration v0.1

実施日: 2026-10-05
対象: Production Marker UI
範囲: `▽ ● ● ● ● ▷`、Quickコピー、Quick辞書、位置・開閉・回帰確認。schema / migration / Quickメモ / RAGは変更していない。

## 結果

Laboratoryで検証済みだった操作順をProductionへ再接続した。

```text
本文選択
→ ▽ ● ● ● ● ▷
→ 色clickで即Marker作成
→ Signalを維持し、現在色ringと左Detailを有効化
→ 左: 既存Marker Detail
→ 右: [コピー] [辞書]
```

ProductionのHighlight API、MarkerCore anchor、MarkerDetailAdapter、Question Keep、Immediate Ask、miniMAP、削除lifecycleを正本として維持している。Laboratory component、fixture state、辞書serviceはProductionからimportしていない。

## 回収したLAB資産

以下を動作・寸法・テストシナリオの参照にした。

- `src/laboratory/MarkerQuickActionPrototype.tsx`
- `src/laboratory/marker-quick-action.ts`
- `src/laboratory/marker-quick-action.css`
- `tests/marker-quick-action.test.ts`
- `docs/laboratory/marker-quick-action-prototype.md`
- `docs/marker-quick-action-recovery-audit.md`

回収した考え方は、216 × 44pxのSignal、30px左右操作、4色palette、下優先・上fallback、viewport clamp、右Menuのleft fallback、Escape / outside click、scroll / resize追従、色click即作成である。Lab固有のMarker型、Detail、Question fixture、theme selectorは回収していない。

## 新Production component

### `MarkerQuickActionBar`

`src/client/MarkerQuickActionBar.tsx`へProduction専用の小Componentを追加した。

- 左`▽`: 保存前disabled、保存後に`MarkerCore.beginEdit`経由で既存Detailを開く
- 中央: yellow / red / green / blue
- 右`▷`: compactな横方向Menuをtoggle
- Menu: `コピー`と`辞書`のみ
- `pointerdown`でselectionを不要に崩さず、Signal内操作をoutside clickとして扱わない
- Quick Action成功後は過去Labの単純な挙動に合わせてSignalを閉じる

### Pure positioning helper

`src/client/marker-quick-action.ts`へProduction / Laboratoryのどちらにも依存しないpure helperを追加した。

- Signal: 216 × 44px
- selectionの最終描画矩形を基準
- 8px gapで下側優先
- 下に収まらなければ上側
- viewport四辺を8pxでclamp
- Quick Menuは右優先、保守的な128px幅が収まらない場合は左へfallback

## Adapter構造

`MarkerCore`は未保存selectionと保存済みHighlightを同じSignalへ渡す。

- 未保存: 色clickで既存Highlight POST
- POST中: ref-backed guardで二重実行を拒否
- POST失敗: draft / selection情報 / Signalを保持して再試行可能
- POST成功: API応答HighlightへSignalを結び直し、Detailは自動表示しない
- 保存済み: 色clickで既存Highlight PATCH
- Detail: `MarkerDetailAdapter`の既存経路
- miniMAP: 既存`highlights` stateが更新されるため追加同期なし

`MarkedTurns`には`onQuickDictionary(text)`だけを追加した。`main.tsx`はProduction `RightSidebar`のtyped controllerへ接続する。

## Signal最終外観

```text
▽   ● ● ● ●   ▷  [コピー] [辞書]
```

Soft Grayの面、既存border / radius / shadowに合わせた。色は`highlightColors`と`marker-colors.css`を正本とし、現在色は外周ringで示す。左右glyphと色buttonにはhover / focus / pressedがあり、本文より強くならない密度にした。

## Quickコピー

対象は常にuser-facingな`target_text`である。

- 未保存selection: `draft.target_text`
- 保存済みMarker: `highlight.target_text`
- `navigator.clipboard.writeText`を使用
- 成功時: 小さい一時feedbackのみ
- 失敗時: Signal内に簡潔なerrorを表示し、Signalを保持

実ブラウザで保存済みMarkerのコピー成功feedbackを確認した。focused testではclipboardへ渡った文字列が`target_text`と一致することを確認している。

## Quick辞書

`RightSidebarController.openDictionary(text)`を追加した。呼び出すと次を同時に行う。

1. Sidebarをopen
2. `Quick辞書`tabを選択
3. 渡された文字列をinputへ設定
4. 既存Production辞書serviceで検索

ASCII英単語1語、EJDict-hand、AI不使用、履歴なしという既存仕様は変更していない。複数語や日本語を含むselectionは既存validationで「英単語を1語選択してください」となる。

## Positioning / close

- 新しいselectionは前のSignalを置換
- Escape / outside pointerdownでclose
- selection成立時に`Selection.focusNode / focusOffset`のcollapsed caretからinteraction anchorを保存
- Signalが開いている間はscroll / resizeやMarker保存後も同じanchorを維持
- 複数行selectionも最終描画fragmentの左端ではなく、実際のdrag終点を使用
- 保存済みMarkerを新規clickした場合だけ、そのclick位置から新しいanchorを作る
- 左DetailはSignalと同じinteraction anchorを使用
- Quick Menuは通常右へ8px、右端では左へ8px
- 水平overflowを作らない

### Interaction Anchor Stabilization v0.2.1

短い1行selectionと長い1行selectionを同じ終点へdragした実ブラウザ確認では、どちらもSignal x=`644.188px`で差は`0px`だった。複数行selectionは最終行のdrag終点x=`403.5px`、右→左dragはfocus側x=`522.219px`を使用した。Marker保存前後はx=`522.219px`を維持し、Signalから開いたMarker Detailも同じxで差は`0px`だった。

保存済みMarkerをSignal close後に新規clickした場合は、Marker全体の左端`522.219px`ではなくclick中央付近`583px`から新しいanchorを生成した。

## Responsive実ブラウザ確認

隔離DB `D:\att-Chat\.cache\marker-quick-action-v01.sqlite` とProduction Browser UIで確認した。

| viewport | Right Sidebar | Center幅 | 結果 |
|---|---:|---:|---|
| 1024 × 768 | open | 565px | Signal / Menu表示、横overflowなし |
| 1024 × 768 | closed | 753px | Centerへ幅が戻り、横overflowなし |
| 1280 × 800 | open | 761px | Signal / Menu表示、横overflowなし |
| 1920 × 1080 | open | 1401px | Signal / Menu表示、横overflowなし |

1024pxの右端selectionではSignalが`[778, 994]`へclampされ、Quick Menuは左側`[663, 771]`へfallbackした。実画面で、selection下の表示、色click即保存、青ring、miniMAPへの青Marker反映、左Detail、右横展開、Quick辞書、Quickコピーを確認した。

下端反転、scroll / resize追従はpure helper / component testで固定した。SignalとMenuはいずれもborder-box 44px高とし、位置計算と実寸を一致させた。

## Browser / Electron確認

Browser版は実画面で確認済みである。Electron rendererは同じProduction React entry / CSSを使用し、Electron専用実装は追加していない。

Electron実起動も試みたが、この端末ではElectron配下のACLに`ALL APPLICATION PACKAGES`のread権限がなく、sandboxed rendererが`node_modules/electron/dist`を読めず起動前に停止した。既存の`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`を弱める回避は行っていない。この環境制約のため、今回のElectron実画面確認は未完了である。typecheck / Vite buildとElectron既存testで共有rendererの静的回帰を確認する。

## Tests

Production focused testへ次を追加・更新した。

- selection → Signal
- 保存前の左disabled
- 色click即POST
- ref-backed POST二重防止
- POST failure時のSignal保持とretry
- 保存後ring
- 左Detail open
- 保存済み色変更PATCH
- Quickコピー
- Quick辞書callback / Sidebar open / Dictionary tab選択
- Quick右展開 / 右端left fallback
- Escape / outside click
- scroll / resize時の再配置要求
- Marker / Immediate / Deferred / Question Keep / miniMAP / delete回帰

最終検証結果:

- `npm test`: 342 total / 340 pass / 2 skip / 0 fail
- `npm run typecheck`: PASS（`npm run build`内でも再確認）
- `npm run build`: PASS
- `git diff --check`: PASS

全体テスト初回では既存Keep Context UIの100ms待機に1件の一時的な失敗が出た。対象ファイル単独では2/2件PASSし、全体を一度だけ再実行した結果も上記のとおり0 failだった。テストや待機時間の変更は行っていない。

## 残る候補

- Electron実機確認は上記ACLを安全に直せる環境で再実施する。
- touch操作は対象外。右→左dragのfocus endpointはv0.2.1で確認済み。
- Quickメモ、Search、Explain、Reportは追加していない。
- selection文字列がASCII英単語1語でない場合の辞書validationは仕様どおりであり、token自動抽出は行っていない。
