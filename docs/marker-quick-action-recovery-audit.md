# Att-Chat Marker Quick Action Recovery Audit

監査日: 2026-10-05
対象: 現在のworking tree、Laboratory / Experiment / Dummy / fixture / CSS / test、現行Production Marker UI
変更範囲: 本文書のみ。Production source、Laboratory source、schema、testは変更していない。

## 結論

探していたUIは既に存在する。初出の再現可能な基準点はcommit
`74aae1e5a55047cc41bf1d2af73e911c878d799d`（`feat: prototype marker quick actions`）で、
当時の構造は正確に次の並びだった。

```text
▽   ● ● ● ●   ▽
```

左はMarker Detail、中央はyellow / red / green / blue、右はQuick Toolである。
その後の継続Phaseで右端は操作方向を示す`▷`へ変更され、現在のdirty working treeでは次の形になっている。

```text
▽   ● ● ● ●   ▷
```

過去実装の操作順も確定している。

1. 本文選択直後はCompact Signalを表示する。左DetailはMarker未作成なのでdisabled、中央色と右Quickは利用可能。
2. 中央の色を1回押すと、その色でMarkerを即時作成する。Detailを自動展開しない。
3. 作成後もCompact Signalを残し、現在色にringを付け、左Detailを有効にする。
4. 左は既存Markerの質問・メモ・削除、右は選択またはMarker本文をQuick Memo / Dictionaryへ渡す。
5. Escape、枠外click、次の選択で閉じる。scroll / resizeでは位置を再計算する。

したがって、最終UIを新規設計する必要はない。ただしLaboratory component全体をProductionへimportしてはならない。
見た目、配置helper、イベント規則を回収し、既存Productionの保存・質問・Sidebar契約へ接続する薄いadapterが適切である。

## 見つかったファイル

### Primary implementation

| File | 内容 | 現在の状態 |
|---|---|---|
| [`src/laboratory/MarkerQuickActionPrototype.tsx`](../src/laboratory/MarkerQuickActionPrototype.tsx) | Signal Header、選択、色作成・変更、Detail、Quick Menu、Immediate / Deferred、Memo / Dictionary接続 | trackedだが基準commit以降の継続Phase差分を含む |
| [`src/laboratory/marker-quick-action.ts`](../src/laboratory/marker-quick-action.ts) | palette / end signal / quick menu位置、clamp、textarea、Lab anchor helper | tracked、現在clean |
| [`src/laboratory/marker-quick-action.css`](../src/laboratory/marker-quick-action.css) | 216 × 44px Signal、30px左右操作、26px色点、A / D2外観、Detail / Menu | trackedだが継続Phase差分を含む |
| [`tests/marker-quick-action.test.ts`](../tests/marker-quick-action.test.ts) | 位置、作成、色、開閉、Memo / Dictionary、Immediate / Deferred、Question Box回帰 | trackedだが継続Phase差分を含む |
| [`docs/laboratory/marker-quick-action-prototype.md`](laboratory/marker-quick-action-prototype.md) | Phaseごとの設計意図、実ブラウザ観察、既知課題 | trackedだが継続Phase差分を含む |

### Supporting Laboratory assets

| File | 関係 |
|---|---|
| [`src/laboratory/QuickMemoPanel.tsx`](../src/laboratory/QuickMemoPanel.tsx) | 選択断片をmemory-onlyで追加する過去Panel |
| [`src/laboratory/DictionaryPanel.tsx`](../src/laboratory/DictionaryPanel.tsx) | Quick Dictionary結果表示 |
| [`src/laboratory/quick-dictionary.ts`](../src/laboratory/quick-dictionary.ts) | Lab用EJDict-hand検索と古い非同期結果抑止 |
| [`src/laboratory/CollapsibleTools.tsx`](../src/laboratory/CollapsibleTools.tsx) | Dictionary / Memo tabとminiMAP共存の後続Prototype |
| [`src/laboratory/AttChatIntegratedDummy.tsx`](../src/laboratory/AttChatIntegratedDummy.tsx) | 統合後のMarker Detail、Composer、Quick tools、miniMAPのVisual Reference |
| [`src/laboratory/att-chat-integrated-dummy.css`](../src/laboratory/att-chat-integrated-dummy.css) | 統合DummyのMarker / Detail / Sidebar外観 |
| [`docs/laboratory/att-chat-integrated-dummy-v01.md`](laboratory/att-chat-integrated-dummy-v01.md) | Frozen Visual / Interaction Reference |
| [`src/laboratory/catalog.ts`](../src/laboratory/catalog.ts) | `marker-quick-action-prototype`をTESTINGとして登録 |
| [`src/laboratory/Laboratory.tsx`](../src/laboratory/Laboratory.tsx) | Prototype実行入口 |

### Current Production counterparts

| File | 既存責務 |
|---|---|
| [`src/client/MarkerCore.tsx`](../src/client/MarkerCore.tsx) | anchor取得、Highlight API、4色、描画、jump / pulse、miniMAP、選択時の小型作成popover |
| [`src/client/marker.ts`](../src/client/marker.ts) | completed Assistant、同一Turn / block、UTF-16、grapheme、source_text検証 |
| [`src/client/MarkerDetailAdapter.tsx`](../src/client/MarkerDetailAdapter.tsx) | Immediate Ask、Deferred Ask / Keep、prefix、色、memo、削除 |
| [`src/client/RightSidebar.tsx`](../src/client/RightSidebar.tsx) | Production Quick辞書 / Quickメモ / miniMAP shell |
| [`src/client/MiniMap.tsx`](../src/client/MiniMap.tsx) | Marker色、Turn、詳細 / 全体、jump |
| [`src/client/marker-colors.css`](../src/client/marker-colors.css) | Productionで採用済みの本文・一覧・miniMAP用4色token |
| [`src/client/MarkedTurns.tsx`](../src/client/MarkedTurns.tsx) | MarkerCoreへProduction adapter群を合成 |
| [`src/client/Chat.tsx`](../src/client/Chat.tsx) | Immediate Ask参照配列と通常draftを分離したComposer |

## 過去UIの構造

### Signal Header

`SignalHeader`は`role="toolbar"`を持ち、CSS gridは次の固定構造である。

```css
grid-template-columns: 30px repeat(4, 26px) 30px;
gap: 8px;
width: 216px;
height: 44px;
```

- 左右操作: 30 × 30px、glyph 15px
- 色点: 26 × 26px、円形
- 4色順: yellow / red / green / blue
- current color: `aria-pressed`とring
- buttonの`pointerdown.preventDefault()`で色クリックまでbrowser selectionを維持
- D2: Soft Grayが後期Prototypeの初期variant

commit `74aae1e...`では左右とも`▽`だった。Quick Direction Menu Phaseで右だけ`▷`へ変え、選択終端から右方向へ進む意味を強めた。検索対象のイメージと一致する版は履歴上に残っており、現在コードはその発展版である。

### Positioning

[`marker-quick-action.ts`](../src/laboratory/marker-quick-action.ts)のpure helperは次を実装する。

- 下側を優先し、収まらない場合だけ上へ反転
- viewport四辺から8px内側へclamp
- 後期Compactは最終描画行を基準に、右操作の中心を選択終端の12px右へ寄せる
- Quick MenuはSignal右へ8px、右端で左へ反転
- scroll / resize時に現在のDOM矩形から再配置

この規則は、現行Productionの小型作成popoverが持つ単純な中央配置より検証範囲が広い。

## 過去UIの状態管理とイベント処理

Prototypeは次のReact local stateを持つ。

- `draft`: 未保存selection
- `editing`: 選択中Marker ID
- `panel`: `none | detail | quick`
- `position` / `menuPosition`: SignalとMenuのviewport座標
- `markers`: memory-only Marker配列
- `preparation`: Immediate / Deferred質問準備
- `immediateQuestions`: Composer相当のMarker質問配列
- `deferredQuestions`: Question Keep fixture
- `quickMemos` / `dictionaryResult`: 右側ツール状態

主なevent規則:

- `mouseup`: selectionをLab座標へ変換し、RangeをcloneしてSignalを開く
- 色click: 未作成ならMarker作成、既存Markerなら色変更
- 左click: Markerがある場合だけDetailをtoggle
- 右click: Quick Menuをtoggle。左Detailとは排他
- Quick action click: selectionまたは既設Markerの本文を処理してSignalを閉じる
- outside pointerdown / Escape: 保存・転送せず閉じる
- scroll / resize: 再配置

現在のLab Quick Menuの実処理は`Quick Memo`と`Dictionary`の2項目である。過去のPhaseではSearch / Explainを同じMemo処理へ接続した操作試験もあったが、独立機能として完成したものではない。

## 現行Productionとの差

### Marker creation

Productionは[`captureSelection`](../src/client/marker.ts)で正本anchorを作り、[`MarkerCore`](../src/client/MarkerCore.tsx)からHighlight APIへ保存する。現在の小型popoverは、引用、4色、`Marker`確定、closeを持つ。色clickは選択色の変更であり、保存には別の`Marker` clickが必要である。

過去Prototypeは色clickそのものが保存操作だった。したがって最終Signalへ戻す場合の最大のUI差は、**中央色を選択と保存の兼用に戻すか**である。過去記録とテストは一貫して「選択 → 色clickで即作成」を検証している。

### Anchor and persistence

Labの`QuickMarker`はparagraph indexとoffset、`selected_text`を持つmemory-only fixtureで、複数paragraph描画helperも持つ。ProductionはTurn ID、UTF-16 half-open offset、`source_text`、`target_text`を保持し、現在は同一Turnかつ同一Markdown block内の選択だけを受け付ける。overlap / contain / duplicateはDB triggerで拒否し、adjacencyは許可する。

Lab座標型、`renderParagraph`、Lab `overlaps`をProductionへ持ち込むと正本anchorが二重化するため衝突する。

### Marker Detail and questions

Labの左Detailは後続PhaseでImmediate / Deferred、prefix、質問入力、メモ、色、削除まで拡張された。しかしすべてlocal fixture stateである。

Productionには同じ責務を持つ[`MarkerDetailAdapter`](../src/client/MarkerDetailAdapter.tsx)が既にあり、最新completed Assistant判定、最大5件のImmediate Ask、Question Keep API、削除lifecycleへ接続済みである。Lab Detailを再利用するとProduction契約を迂回する。

### Quick辞書 / Quickメモ

LabはQuick Menuからlocal stateへ直接書き込む。Productionの[`RightSidebar`](../src/client/RightSidebar.tsx)はDictionary / Memo stateを内部に所有し、現在はdocument selectionをinputへ取り込むが、外部から「この文字列をDictionaryへ」「この文字列をMemoへ」と命令するinterfaceを持たない。

したがってQuick Menuの見た目は回収できるが、実処理にはRightSidebarへ渡す小さなcontroller / callback adapterが必要である。Lab `QuickMemoPanel`やLab辞書serviceをProductionからimportするべきではない。

### miniMAP / deletion

Production miniMAPは`MarkerCore`のlive Highlight stateを直接受け取るため、作成・色変更・削除が同じstate更新を通れば追加契約なしで反映される。

Production削除はHighlight APIを使う。live Question KeepはFK cascadeで削除され、`run_marker_references`は`run_id`以外にlive FKを持たずhistorical snapshotを保持する。Labの配列filter処理を再利用してはならない。

## 再利用分類

### A: そのまま再利用可能

| Asset / contract | 理由 |
|---|---|
| Production `highlightColors`と`marker-colors.css` | 4色IDとVivid tokenの正本。Signalもこの値を使える |
| `MarkerCore`のcapture / create / update / delete / jump | anchor、API、miniMAP、pulseの既存正規経路 |
| `MarkerDetailAdapter` | 左メニュー候補のImmediate / Deferred / memo / deleteを既に実装 |
| `RightSidebar`のProduction Dictionary / Memo | Quick実処理の正規実装。状態の置き場所を増やす必要がない |
| `MiniMap` | Signal導入後も既存Highlight stateだけで追従する |
| Immediate Ask Composer / Question Keep / delete lifecycle | 既存契約を再実装する必要がない |

### B: 小さなadapterで再利用可能

| Past asset | 必要なadapter |
|---|---|
| `SignalHeader`の`▽ + 4色 + 右操作`構造 | Production Highlight / draftとcallbackをpropsで受ける小Componentにする |
| `palettePosition` / `endSignalPosition` / `quickMenuPosition` | Laboratory依存を避け、Production側のUI helperへ移すか同等のpure helperとして再配置する |
| Signal CSSの寸法・focus・pressed状態 | Production classへ限定して移し、Lab A/D2 selectorを持ち込まない |
| outside / Escape / scroll / resize規則 | Productionの既存popover / Detail closeと競合しないよう1つのcontrollerにまとめる |
| Quick Menu → Quick辞書 / Quickメモ | RightSidebarへtext、tab、open要求を渡すcallbackが必要 |
| `marker-quick-action.test.ts`の操作シナリオ | Production component/API mockへ置き換えて回帰testとして再利用できる |

### C: 見た目・観察結果だけ参考

| Asset | 理由 |
|---|---|
| A / D2 variant selector | 比較用fixtureでありProduction設定ではない |
| Integrated DummyのMarker Detail / Sidebar | Visual Reference。Production componentへコピーしない方針が既に固定済み |
| Search / Explain placeholder履歴 | 実処理がなく、現在の候補にも含まれない |
| Lab Question Box / New Chat fixture | Production Question Box / Handoffが既に存在する |
| Labのparagraph rendererと作成済み一覧 | Experiment専用表示 |

### D: 現行契約と衝突

| Past asset / behavior | 衝突内容 |
|---|---|
| `QuickMarker` / `SelectionPoint`をProduction modelとして使用 | Turn ID、UTF-16、source / target、DB anchor契約と不一致 |
| Lab `markers` / `deferredQuestions`のlocal配列を正本にする | Production API / DB / Question Keep lifecycleを迂回する |
| Labの複数paragraph Marker描画をそのまま採用 | 現行Production selectionは複数Markdown blockを拒否する |
| fixtureの`canAsk`判定 | hard-coded T番号で、Productionのlatest completed Assistant判定と異なる |
| Lab削除時の直接Keep filter | Production FK cascadeとhistorical Run保持を迂回する |
| Lab辞書service / panelをProductionから直接import | Production `RightSidebar`と外部資産処理が二重化する |
| Prototype全体のProduction import | Question Box、Handoff、fixture、Lab CSSまで依存し、境界を壊す |

## 想定最終構成との対応

```text
▽   ● ● ● ●   ▽ または ▷
```

| UI | 過去実装 | Production接続先 |
|---|---|---|
| 左 | Marker Detail。現在のLabでは今すぐ質問 / 後で質問もここ | `MarkerDetailAdapter`を開く |
| 中央 | 未作成時は色clickで即作成、作成後は色変更 | `MarkerCore`のPOST / PATCH |
| 右 | Quick Menu。現在はQuick Memo / Dictionary | Production `RightSidebar`へのcallback |
| コピー | 過去Quick Menuには未実装 | 新規機能としてではなく、必要なら右Menuの小さなbrowser clipboard actionとして別途判断 |
| Marker詳細 | 過去は左専用 | 右にも置くと重複するため、初期統合では左だけを推奨 |

検索対象にあった「今すぐ質問」「後で質問」は左Detail内で実装済みで、Quick Menuには置かれていなかった。
「Quick辞書」「Quickメモ」は右Quick Menuと右Sidebarの組み合わせで検証済みである。

## 最小統合案

実装する場合は、次の順序が最小である。

1. Production専用の小さな`MarkerQuickActionBar`を作る。Lab componentはimportしない。
2. `MarkerCore`の未保存draftと保存済みHighlightの両方から同じBarを表示する。
3. 未保存時は左をdisabled、中央色clickで既存POSTを1回だけ実行する。別の`Marker`確定buttonは置かない。
4. POST成功後に返ったHighlightへBarを結び直し、現在色ringと左Detailを有効にする。自動でDetailは開かない。
5. 保存済み時の中央色clickは既存PATCHを使う。
6. 左は`beginEdit`を通して既存`MarkerDetailAdapter`を開く。質問、Keep、memo、削除をBar内へ複製しない。
7. 右は選択中なら`draft.target_text`、保存済みなら`highlight.target_text`を渡す。Copy / Dictionary / Memoを小Menuに置き、Dictionary / MemoはRightSidebarをopenして既存stateへ渡す。
8. miniMAPは既存Highlight stateをそのまま使用する。追加stateや同期処理を作らない。
9. selection保持、Escape、outside、scroll / resize、上下左右clampは過去helper/testをProduction境界へ移して回帰を作る。

操作順については過去実装を踏襲するのが最も根拠がある。

```text
選択
→ Signal表示（左disabled、右利用可）
→ 中央色clickで即作成
→ Signal維持（現在色ring、左有効）
→ 読み続ける / 左Detail / 右Quick
```

右glyphは履歴どおりの`▽`と、後期評価済みの方向性を示す`▷`の2候補がある。
機能配置の根拠は右方向へ進む`▷`の方が強いが、左右対称性を優先するならcommit `74aae1e...`の`▽`を復元できる。
これは外観判断であり、Marker / Keep / Quick tool契約には影響しない。

## リスクと注意点

- 現在のworking treeにはPhaseをまたぐ多数のdirty / untracked差分がある。本監査では削除・整理・stageを行っていない。
- Laboratory Quick Actionの基準版はcommitで再現可能だが、現在ファイルはImmediate Ask、Question Box、Handoff等の後続差分を含む。現在ファイル全体を移植対象にしてはならない。
- one-click色作成へ変える場合、POST中の二重click防止と失敗時にselection / Signalを保持する挙動を明示的にtestする必要がある。
- RightSidebarは現在stateを内部所有するため、DOMイベントやselectionの再利用で接続せず、typed callback / controllerを追加する方が安全である。
- 「コピー」は過去Quick Actionの実装実績がなく、今回の回収対象からはC相当の新規候補である。
- Touch、右から左へのdrag、極端に狭いviewportは過去記録でも最終評価されていない。

## 監査判断

過去UIは失われていない。Visual構造、寸法、操作順、位置計算、主要event、テストが揃っている。
Production統合に必要なのは新しいMarker機能ではなく、次の2点だけである。

1. 過去SignalをProduction `MarkerCore`へ接続する小さな表示adapter。
2. 右Quick Menuから既存Production `RightSidebar`へ文字列と表示先を渡す小さなtool adapter。

Marker anchor、4色、Immediate / Deferred、Question Keep、miniMAP、Marker Detail、削除lifecycleは既存Productionをそのまま正本として維持できる。
