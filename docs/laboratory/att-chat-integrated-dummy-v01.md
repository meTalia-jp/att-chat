# Att-Chat Integrated Dummy UI v0.1

## Current State

- Catalog ID: `att-chat-integrated-dummy`
- Catalog status: `TESTING`
- Current phase: v0.1 layout preview
- Implemented through: 3カラム、Marker Detail、Immediate Ask cards、Question Box、New Chat Handoff setup/result、Quick Tool、Turn miniMAP
- Technical validation: `npm test` / `npm run typecheck` / `npm run build` / `git diff --check` pass。実ブラウザで1024px・1280pxと9 fixtureを確認
- User evaluation: pending
- Adopted outputs: none
- Production impact: none
- Pending decision: 統合UIの密度・優先順位・1024px付近の許容幅
- Allowed change scope: `src/laboratory/AttChatIntegratedDummy.tsx`, 専用CSS、Catalog/Laboratory登録、専用記録とLab test
- Excluded scope: production Chat/MarkerCore/Question Keep/New Chat Handoff、DB/API/schema、LM Studio、GenerationRun
- Primary code: `src/laboratory/AttChatIntegratedDummy.tsx`
- Primary tests: `tests/laboratory.test.ts`, `tests/laboratory-ui.test.ts`

## Purpose

本番機能を接続せず、Att-Chatの完成予想UIを一画面へ合成し、左Sidebar、Conversation、右Sidebar、Marker質問導線の占有と優先順位を目視評価する。

## Visual Reference Status

Status: **FROZEN AS INTEGRATION REFERENCE**

Att-Chat Integrated Dummy UI v0.1 is the current visual and interaction reference
for the first full production integration.

Production integration should reuse existing production architecture and connect
functionality into this interaction structure rather than rebuilding production
components from the dummy implementation.

今後の最初の本番統合では、次の役割分担と操作導線を完成予想形の基準として扱う。

- Left Sidebar: Conversation一覧とQuestion Box。Question KeepはConversation単位でまとめ、`元へ戻る`と`…`からの補助操作を置く。
- Center: Conversationを主役とし、Turn、Marker、Turn ★、Marker Detail、Ask、Composerを配置する。通常入力とImmediate Askは分離する。
- Right Sidebar: Quick辞書、Quickメモ、Turn miniMAPを補助情報として配置し、Conversationより優先しない。
- New Chat Handoff: Question Boxから開き、引継ぎ量を選択し、Preview後の明示操作で送信する。新ConversationのUser Turn表面には質問だけを表示する。

この固定は見た目と操作導線に対するReferenceであり、Dummy実装のProductionへのコピーやProduction architectureの置換を意味しない。接続時は既存Production component、API、DB schema、Generation flowを優先する。spacing、width、padding、responsive behavior、overflow、popup位置は実使用に合わせて調整できるが、Left / Center / Rightの役割分担は維持する。

1024pxでMarker Detailが本文を覆うこと、Question Box密集時の情報量、Immediate Ask複数時のComposer高さ、Right Sidebar内の高さ競合、Handoff Preview長文化は既知課題として残す。このFreezeでは解決せず、本番統合後の実使用を観察して調整する。

## Created UI

- 左: Chat / 質問箱tab、Conversation group、Question Keep、元へ戻る、ellipsis menu。
- 中央: User / Assistant Turn、4色Marker、Marker Detail、通常draftとImmediate Askを分けたComposer。
- 右: Quick辞書 / Quickメモtabと、常設Turn miniMAP。
- overlay: Question Boxから開くNew Chat Handoff setup。送信操作は結果fixtureへ表示を切り替えるだけ。
- Lab shellのCatalog幅を評価へ混ぜないよう、Run初期状態では全画面プレビューを表示する。`Lab表示へ戻る`で通常のLab内表示へ戻せる。

すべてReact local stateと固定fixtureで動く。fetch、DB、API、LM Studio、GenerationRunは使用しない。

## Fixture states

1. 通常Conversation
2. Marker Detail open
3. Immediate Ask 1件
4. Immediate Ask 3件
5. Question Box open
6. Question Box Keep多数
7. New Chat Handoff setup
8. Handoff後の新Conversation
9. 長いConversation / miniMAP密集

Debug selectで各状態へ直接切り替えられる。通常操作でもMarker DetailからComposer/質問箱への追加、Question Box menuからHandoff setup/resultへの遷移を確認できる。

## Layout observations

- 1024 × 768では、左184px・中央545px・右220pxとなり、3カラムは横スクロールなしで成立した。中央本文とComposerの操作幅は残るが、右miniMAP見出しは折り返しやすい。
- 1280 × 800では、左220px・中央715px・右264pxとなり、本文が間延びせず、左の一覧と右のQuick Tool / miniMAPにも十分な幅がある。
- Chat / 質問箱の役割分担はtab名と補助文で判別できる。Keep多数時は左Sidebar内scrollへ収まり、Conversation本文を押し下げない。
- Marker Detailは1024pxでも操作できるが、中央本文の右側を大きく覆う。短い質問準備には使える一方、本文参照と同時操作するにはやや大きい。
- Immediate Ask 3件はComposer内scrollで破綻しない。ただしComposerが中央の縦領域を大きく使い、本文を読める高さが減る。
- Quick Tool領域を固定高、miniMAPを残余領域としたため、右Sidebarは情報量が多くてもminiMAPが消えない。密集fixtureでは42 Turnの★・Marker分布を一画面で確認できた。
- New Chat Handoff setupは1024px内に収まり、Previewと明示送信の順序は追える。設定項目とPreviewが同時に出るため、日常操作としては重く、Question Boxから必要時だけ開くoverlayが妥当そうに見える。
- Marker DetailからComposerへのlocal handoff、Question Box menu、Handoff result切替はいずれも外部送信なしで成立した。

## Issues to address before integration

- Marker Detailをpopoverのままにするか、本文を隠しにくい固定位置へ寄せるかを本番統合前に決める。
- Immediate Askが3件以上になった場合の要約表示・折りたたみ閾値を検討する。今回は内部scrollだけで表現した。
- 1024px付近では右miniMAP headerと左Question Keep抜粋が窮屈になる。レスポンシブ完成時は、文字を縮めるより表示優先度を決める必要がある。
- Handoff setupは機能上必要な情報を一度に見せているが、通常操作としては工程が重い。Previewの既定折りたたみ等は人間評価後の候補とする。
- fixtureは全体レイアウト評価用であり、Production component、保存契約、実送信の適否は検証していない。

UI観察から本番契約変更や採用判断へ自動的に進まない。

## User evaluation

Pending.
