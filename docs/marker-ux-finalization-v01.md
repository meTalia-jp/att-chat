# Att-Chat Marker UX Finalization v0.1

## Scope

Production UI の Marker を、`読む → Marker → 読み続ける → 見つける → 戻る → 質問する` の一連操作として確認・調整した。MarkerCore、Highlight schema、Question Keep、Immediate Ask、miniMAP、GenerationRun の既存契約は変更していない。

確認には隔離DB `.cache/marker-ux-finalization-v01.sqlite` を使用した。通常ユーザーDBは使用していない。

## Marker作成操作

- 通常UIで開発用 `Marker管理` を非表示にした状態でも、completed Assistant Turn の文字選択後に小さな `Marker作成` UIを表示するようにした。
- 作成UIは選択範囲の近くへ固定表示し、viewport左右端と上下端でclampする。大きなmodalは使わない。
- 作成時に4色を選び、`Marker`を押すと即保存する。メモは作成後のMarker Detailで入力する。
- Escapeまたは`×`で保存せず閉じる。
- Turnまたぎなど選択契約に違反した場合は、通常UIにも小さなエラー表示を出す。
- Assistant completed、同一Turn、同一block、UTF-16 half-open offset、grapheme境界、overlap/contain/duplicate拒否、adjacency許可の既存検証をそのまま通す。

実ブラウザでは長いAssistant Turnから3箇所を赤・緑・青で連続作成し、読書画面を離れず保存できた。

## Marker表示

- 既存のVivid Marker色を維持した。
- 通常時は蛍光ペン表示、hover時は彩度と内枠をわずかに強める。
- Marker Detailを開いたMarkerには選択内枠を表示する。
- jump時は既存の紫輪郭とpulseを維持する。
- Markdown inline要素、長いMarker、隣接Markerのanchor描画契約は変更していない。

## Marker Detail

- Marker引用、今すぐ質問、後で質問、prefix、質問入力、色、Marker memoを維持した。
- `削除`をDetailの常時見える低強調操作として追加し、更新・質問操作と同じfooterへ整理した。
- 1024 / 1280 / 1920で、固定位置・最大幅・最大高・内部scrollがviewport内に収まることを確認した。
- 1024pxではDetailは276×502px、1280pxと1920pxでは320×502px。横overflowは発生しなかった。

## Immediate Ask

- latest completed Assistant Turnのresolved Markerだけ有効という契約を維持した。
- 実ブラウザで最新Turn Markerからprefix `質問`と短い質問をComposerへ追加した。
- Marker-only送信を隔離DBとLM Studioで1件実行し、Assistant回答、GenerationRun、`run_marker_references` 1件を保存した。
- 同一Marker置換、最大5件、通常draft独立、参照解除後も通常draft保持は既存testで確認した。
- 参照1件時のComposer高は229px。参照0件時の136pxを維持した。

## Deferred Ask / Question Box

- 過去Turn MarkerではImmediate Askがdisabledになり、理由表示と`後で質問`が使えることを確認した。
- 質問文とメモを保存するとQuestion Boxへ即時反映された。
- Conversation group、Marker引用、質問文、メモ、`元へ戻る`、`…`、same-chat質問、New Chat Handoffの既存導線を維持した。

## miniMAP

- 本文と同じHighlight stateを使うため、Marker作成直後にminiMAPへ反映された。
- 赤・緑・青の色一致と、同じTurn内の3点表示を確認した。
- miniMAPのMarkerを2件クリックし、exact Highlightへjumpしてpulseすることを確認した。
- Sidebar close / reopen、詳細 / 全体、current Turnの既存state契約は変更していない。

## Jump / pulse

- miniMAPとQuestion Boxの両方からexact IDで元Markerへ復帰した。
- Question Box復帰時は対象Turnを開いた後、Markerをcenter付近へscrollし、50ms後と250ms後の両方でpulse classを確認した。
- unresolvedはTurn fallbackとし、文字列検索によるauto-reanchorは行わない。

## Delete lifecycle

隔離DBの実データで、Immediate Ask RunとQuestion Keepの両方を持つMarkerを削除した。

- live Highlight: 4件から3件
- 関連live Keep: 削除済みで残存なし
- 過去Runの `run_marker_references`: 1件を維持
- historical snapshot: source Conversation / Turn / Highlight ID、offset、source_text、target_text、色、prefixを維持

これにより、live Marker / Keep削除とGenerationRun履歴保持が両立していることを確認した。

## Responsive verification

右Sidebar開閉、Marker Detail、Composer参照ありを実ブラウザで確認した。数値はpx。

| viewport | Sidebar | Left | Center | Right | Composer 0件 | Composer 1件 | Turn max-width | overflow |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1024×768 | open | 180 | 565 | 220 | 136 | 229 | 565 | なし |
| 1024×768 | closed | 180 | 753 | 32 | 136 | 229 | 753 | なし |
| 1280×800 | open | 200 | 761 | 240 | 136 | 229 | 761 | なし |
| 1280×800 | closed | 200 | 969 | 32 | 136 | 229 | 969 | なし |
| 1920×1080 | open | 200 | 1401 | 240 | 136 | 229 | 980 | なし |
| 1920×1080 | closed | 200 | 1609 | 32 | 136 | 229 | 980 | なし |

UI Final Auditで得たCenter幅と通常Composer 136pxは悪化していない。

## Browser / Electron

- Browser: Vite renderer + localhost backend + 隔離SQLiteで作成、miniMAP jump、Immediate Ask実送信、Keep、Question Box復帰、Handoff Preview、削除履歴を確認した。
- Electron: `npm run electron:dev`でbackend 5187、renderer 5186、既存隔離DBを起動した。Electronが読む同一renderer上でAssistant本文を選択し、選択位置に`Marker作成` UIが出ることを確認した。Electron専用MarkerコードやCSSは追加していない。

## Validation

- Marker focused tests: 38 pass / 0 fail
- `npm test`: 341 total / 339 pass / 2 skip / 0 fail
- `npm run typecheck`: PASS
- `npm run build`: PASS（334 modules transformed）
- `git diff --check`: PASS

全体testの初回は既存same-chat Context UIの非同期待ち1件が全体並列時だけ失敗した。単独再実行は2/2 pass、全体再実行は339 pass / 2 skip / 0 failだった。機能・test待ち時間は変更していない。

## Remaining Marker UX issues

- マウス選択には句読点や語の一部が入り得る。anchorを暗黙補正すると原文契約を変えるため、今回は自動trimしない。
- 1024pxでMarker Detailを開くと中央本文の右側を一部覆う。固定popupとして操作可能だが、本番利用後にpopup位置の好みを再評価できる。
- 実モデル確認は送信・保存経路の確認が目的で、回答品質は評価対象外。
