# Laboratory Phase 1: Marker Core分離

## 目的と変更

Laboratory v0.1 Rev.1に基づき、UI依存だけを分離した。既存のMarkedTurns内にあったMarker実装をMarkerCoreへ移し、MarkedTurnsはAtt-Chat固有の追加機能を組み合わせるComponentとした。Markerロジックの別実装は作成していない。

- `src/client/MarkerCore.tsx`: 選択、Highlight APIによる取得・登録・編集・削除、本文描画、一覧、4色filter、memo、60 grapheme抜粋・全文展開、unresolved、jump、miniMAP。
- `src/client/MarkedTurns.tsx`: Question Keep、Related Turns、Context Compareとその選択状態、質問送信callback、Run情報の受け渡し。
- `tests/marker-core.test.ts`: 依存経路と実Componentを描画する操作テスト。

選択・anchor検証、CRUD、jumpの処理は移動前と同じ。marker.ts、marker-list.ts、TurnMarkdown.tsx、MiniMap.tsx、minimap.tsは変更していない。completed Assistant限定、UTF-16半開区間、grapheme境界、source一致、重複・包含・完全一致拒否、隣接許可を維持する。DB・API・migration・schemaは変更していない。

## 再利用境界

拡張なしでは次のpropsだけで利用できる。

```tsx
<MarkerCore
  key={conversationId}
  conversationId={conversationId}
  turns={turns}
  reloadToken={reloadToken}
/>
```

Att-Chatは任意の描画callbackを3箇所に渡す。

- `renderEditorExtras`: 編集対象のRelated表示、Context Compare。
- `renderMarkerActions`: 一覧のKeep / Related / Compareボタン。
- `renderListExtras`: Question Keep一覧・編集パネル。

callbackへはhighlights、editing、beginEditだけを渡す。Marker状態の更新処理はCoreに一元化する。callbackは通常のReact描画用で、Plugin登録・動的ロード・Equipment管理機構ではない。Hooksが必要な拡張は独立Componentとして描画する。

## 残存依存と制限

- React、既存Turn / Highlight型、同一originのHighlight API、既存CSSに依存する。
- 本文のMarkdown描画とanchor用DOM属性は一体として再利用する。任意rendererとの交換は今回対象外。
- miniMAPは既存どおりwindow scrollとページ全体のviewportを前提とする。1画面に1つのMarker Coreを表示する構成を想定する。
- DBテーブルやサーバー構成の分離はしていない。UI依存の分離を、Keepテーブルが不要になったという意味にはしない。
- 保存本文のTurn ID表示など、既存本文UIも維持した。Simple Marker Chatの表示整理は次Phaseで判断する。
- Simple Marker Chat自体、Catalog、Workspace、ExperimentRun、Single Text Generationは未実装。

## 検証結果

- `npm.cmd run typecheck`: PASS。
- `npm.cmd test`: 220件、218 PASS、0 FAIL、2 SKIP。
- SKIPは既存S1実モデル契約・S2実workerモデルテスト。opt-in環境変数未設定によるもの。
- `npm.cmd run build`: PASS。
- `git diff --check`: PASS。

新規テストではViteで実ComponentをSSR用に変換し、React + jsdomで描画した。拡張なしでKeep等のAPIを呼ばないこと、4色一覧、抜粋/展開、filter、登録、編集、削除、再取得、同文別Turnのjump先とfocus・強調class、miniMAPのjump接続を確認した。

Att-Chat構成ではKeep作成・質問callback、Related検索リクエストと結果表示、Context Compareリクエストと結果表示、unresolvedの操作制限、reloadによる拡張選択解除を確認した。HTTPはfixture応答を使用し、実LLM通信は行っていない。

既存のMarker anchor・storage・Keep・Related・Context Preview・通常チャット/streaming/cancel・Semantic・Study P0の自動回帰テストもPASS。実ブラウザでの目視・実モデル検索は今回は未実施。jsdomのスクロールはstubであり、実画面の座標精度やキーボード標準動作を実測したものではない。位置計算の既存単体テストはPASSしている。

テスト用一時bundleは専用cacheディレクトリで作成し終了時に削除。既存の未追跡Study P0・比較文書などは変更していない。package、Study、サーバー、既存契約文書に変更なし。commit / push / tagは未実施。

## 判定と次Phase

UI依存分離は完了。MarkerCore単独利用と既存Att-Chat拡張との組み合わせを自動テストで確認した。次Phaseを阻害する問題は見つかっていない。Simple Marker Chatを構成する際は、既存CSS・同一origin API・ページ全体スクロールを含む実画面回帰を確認すること。
