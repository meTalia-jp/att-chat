# miniMAP最小実装

2026-09-17。基準commit: `4efd2f6af59bd1c53a9684393b0a2daf7d375237`。

## 目的とUI構造

現在Conversationの「どこにMarkerがあるか」を模式的な縦レールで表示する。引用・メモは既存一覧に任せる。Turn開始位置の薄い線、4色の標準button、viewportの薄い帯、折り畳みbuttonで構成する。Marker一覧の色filterとは独立し、miniMAPには「全色を表示」と明記する。

変更: `src/client/MiniMap.tsx`（UIと観測）、`src/client/minimap.ts`（計測）、`src/client/MarkedTurns.tsx`（既存rootとjumpの受け渡し）、`src/client/style.css`、`tests/minimap.test.ts`、本書。

## DOM位置計算・Marker位置計算

保存された発言のrootコンテナを基準に、`(対象rect.top - root.rect.top) / root.rect.height`を0〜1へ丸める。Turnはarticle[data-turn]開始位置。Highlightは既存locateHighlightElementsでID/turn_id/offsetを検証し、分割描画の場合は最初の要素の開始位置を使う。レールの有効高280pxへ写像する。データを並べ替えた描画上の位置であり、Turn IDを順序として使わない。

近接点は22px間隔を確保できる横列へ順に配置する。縦位置は変えない。点は20px、同列で22px未満なら別列。列数を固定して重ねず、密集時はレールを横スクロール可能にする。キーボードで全buttonへ到達可能。

## viewport計算と追従

window viewportと本文rootの交差を計算し、start=`clamp(-root.top/height)`、end=`clamp((innerHeight-root.top)/height)`とする。本文が画面外なら帯を表示せず「本文は画面外」と示す。短い会話が全体表示される場合は帯が全範囲になる。

window scroll/resize、rootおよびbodyのResizeObserver、Turn/Highlight props変更を契機にrequestAnimationFrameで再計測する。閉じている間は観測を停止。会話切替はkeyで状態を初期化し、別会話の位置を持ち越さない。座標、列番号、viewportはDBやAPIに保存しない。

## jump再利用とunresolved

miniMAPは既存MarkedTurns.jumpへ元Highlightを渡すだけ。独自scroll処理なし。focus、既存約1.8秒強調、reduced-motionへの対応もそのまま。miniMAP自身にanimationは追加しない。

unresolvedおよび現在DOMから位置を特定できないHighlightはレールに置かず、「位置不明: N件」「一覧で確認」と表示。元Turnへの推測配置はしない。理由や編集/削除は既存一覧で扱う。

## responsive

1100px以上では右端118pxの補助領域を初期表示し、main右に120pxを確保。既存左サイドバーの列幅は維持。1099px以下では初期折り畳みとし、狭くなった際も閉じる。右下のbuttonから任意で開ける。狭い画面で開くと本文に重なるため、確認後に閉じて読む想定。高さはviewport内に制限し必要なら領域内scroll。

## テスト結果

- npm test: 218件、216 PASS、2 skip、0 fail。実モデルopt-inテスト2件は未実行。
- build成功（tsc --noEmitを含む）。別途typecheck、git diff --checkも確認。
- 新規自動テスト: 0/1/複数Marker、4色、同一Turn複数、密集時クリック領域非重複、短い/長い会話のviewport、scroll/resize、Turn追加、Marker削除、unresolved/DOM不在、会話切替相当のDOM変更、anchor入力不変。
- 実ブラウザ: 分離一時DB、長い16Turn会話に12Marker（1件unresolved）。11点と位置不明1件、4色近接列を確認。中央TurnへclickとEnterでjumpし、正しいdata-turnのfocusを確認。
- scroll前後でviewport帯topが78.312px→115.625pxへ移動。600px幅へのresizeで自動折り畳みと任意展開を確認。広い画面では本文と右補助領域が分離することをスクリーンショットで確認。
- 一覧を全色非表示にしてもminiMAPは11点を維持。空会話へ切替→0件、短いTurnとMarker追加後にアプリ再読込→1件、既存DELETE API後のbrowser reload→0件を確認。
- Turn追加後のレール再計算も確認。会話切替/reloadで折り畳み状態が画面幅に応じて初期化される。
- 既存Marker excerpt/全文切替/filter/edit/delete/jump、Chat/streaming/cancel、Keep、Retrieval、Context、Semantic、Study P0の通常テストも全PASS。実LM Studio生成は今回再実行していない。

## 既知の制限と保全

現在の全文DOM描画を前提とする。非常に大量のMarkerでは計測コストと横列数が増える。高度なclusterや仮想化は対象外。長いHighlightは開始位置を点で示し範囲全長は表示しない。viewportはwindow基準で、将来の独立スクロール本文への変更時は見直す。

migration/schema/package/dependency、Highlight anchor契約、Study P0は変更なし。User Marker解禁なし。検証用サーバーとタブを終了、一時DBは削除する。既存ユーザーDBは使用していない。commit/push/tagは行わない。
