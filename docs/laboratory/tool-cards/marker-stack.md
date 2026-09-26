# Tool Card: Marker stack

- Classification: Equipment Candidate（共有Component群）
- Code: [MarkerCore](../../../src/client/MarkerCore.tsx)、[MiniMap](../../../src/client/MiniMap.tsx)、[minimap計測](../../../src/client/minimap.ts)、[選択/anchor](../../../src/client/marker.ts)、[一覧/位置特定](../../../src/client/marker-list.ts)、[TurnMarkdown](../../../src/client/TurnMarkdown.tsx)
- Owner / source: att-chat client Marker層。抽出境界は[Phase 1記録](../../laboratory-phase1-marker-core.md)。
- Used by: 本番の[MarkedTurns](../../../src/client/MarkedTurns.tsx)、Labの[SimpleMarkerChat](../../../src/client/SimpleMarkerChat.tsx)
- Evidence: [MarkerCore tests](../../../tests/marker-core.test.ts)、[DOM tests](../../../tests/marker-dom.test.ts)、[miniMAP tests](../../../tests/minimap.test.ts)、[Simple tests](../../../tests/simple-marker-chat.test.ts)

## What it is
MarkerCoreが選択・Highlight編集・一覧を所有し、TurnMarkdownで本文を描画、MiniMapで位置を示すcomposition。単一Equipment interfaceではない。

## What it is for
保存済みAssistant本文への人間の参照Markerと、その位置への移動に使う。

## When to use
既存Conversation/Turn/Highlight契約とAPIを利用する画面。Labでは専用データの完全Labを使う。拡張操作はrender slotを確認し、Coreへ実験固有機能を混ぜない。

## Inputs
conversationId、turns、reloadToken、任意の表示指定/render slots。選択は確定Assistantの対応DOM・同一Turn/同一blockが条件。offsetは原文UTF-16、source_text一致と書記素境界を検証する。MiniMapはroot/Highlight/Turnとjump callbackを受ける。

## Outputs
Highlight編集UI・色フィルタ付き一覧・miniMAP。選択helperはHighlightDraftを返す。位置計測は描画済みDOMから行い、保存anchorを書き換えない。

## Side effects
会話のHighlight APIをGET/POST/PATCH/DELETEし、接続先の永続データを変更する。selection解除、scroll/focus、一時pulse、ResizeObserver・scroll/resize監視がある。API接続先を誤るとLab操作でも本番データに影響する。

## Do not use for
Quick Actionのメモリ内Marker/複数段落選択、Quick Memo、Dictionary、AI自動送信。CoreはTurnまたぎ・複数block・コード/表・原文対応不能な選択を拒否する。Quick Prototypeの挙動をこの契約へ読み替えない。

## Failure and recovery
条件外の選択ではdraftを作らず再選択する。API失敗は画面表示されるので、接続先・対象会話を確認する。unresolvedやDOM位置不明ではjumpせず一覧で理由を確認し、推測anchorで上書きしない。conversationId/reloadToken変更で再取得する。DOM計測値だけで実ブラウザ操作感を検証済みと扱わない。

## Current maturity
本番とSimpleで同じComponent群を再利用し、拡張との依存境界をテストしている。Equipment化の必要性は未決定。browser APIと対応Markdown DOMに依存し、任意文章への汎用Markerではない。
