# Att-Chat UI Center Finalization v0.1

## Scope

Production Integration v0.1、Electron Skeleton v0.1、UI Structure Phase v0.1を基準に、Production React UIの中央Conversation領域だけを整理した。DB schema、API、Generation request、snapshot、Marker anchorの契約は変更していない。

## Turn表示変更

- Conversation titleの下を読む領域として整理し、Turn表示幅を最大860pxに制限した。
- roleは`You` / `Assistant`、sequenceは1始まりの`Txx`、statusは`完了` / `生成中` / `キャンセル` / `失敗`として小さな見出し行へまとめた。
- User Turnは右寄せの控えめな面、Assistant Turnは本文幅を使う読み物として分けた。
- Turn間余白と段落間隔を詰めすぎず、装飾は境界線と薄いUser面に限定した。
- Markdownの見出し、段落、list、inline code、code block、tableへ中央UI専用の余白とoverflowを追加した。横長tableとcode blockはTurn内で横スクロールする。
- Marker色、クリック、anchor、jump、pulseは既存`TurnMarkdown` / `MarkerCore`を維持した。

## Marker Detail変更

- Detailはfixed popoverのまま、幅を`250px〜320px`へ制限した。
- 1024px以下では276pxを上限とし、右Sidebar側へ寄せてConversation本文の被覆を減らした。
- viewport上下には余白を残し、内容が長い場合はDetail内部をscrollする。
- 1024×768ではCenter 523pxのうち本文との重なりは約204pxだった。Detail表示中はRight Sidebarの一部を覆うが、通常時のConversation幅は変化しない。
- Marker更新、今すぐ質問、後で質問、色、memoの契約は変更していない。

## Composer変更

- 通常入力欄を先頭に維持し、現在モデル名は小さなSettings導線のままにした。
- Immediate Ask 1〜2件は引用と質問欄を通常密度で表示する。
- 3〜5件ではcompact classを適用し、listを最大112pxの内部scroll領域に収める。
- 最大5件、同一Marker置換、通常draftとの独立、解除時の通常draft保持は変更していない。

## Preview変更

- Keep Context PreviewとNew Chat Handoff Previewを`details`で開閉できるようにした。
- 初期表示はopenのままとし、情報を確認した後だけ折りたためる。
- Preview本文は最大176px、model-facing textは最大104pxの内部scrollとした。
- Preview内容、明示送信、accepted後clear、validation failure時保持、request / reference snapshot契約は変更していない。

## Handoff表面表示

- `turn_based_handoff` Runの`reference_snapshot`に保存済みのsource Conversation ID / Turn IDを利用し、`元の会話「Conversation名」 / Txx から引継ぎ`をConversation title下へ表示する。
- 参照元titleとsequenceは既存Conversation detail APIからread-onlyで解決する。取得できない場合は、会話一覧で判明しているtitleまでを表示する。
- Handoffで保存された最初のUser Turn本文は変更しない。表面のTurn表示だけは構造化本文の`## 質問`以降を表示し、過去Contextは保存データとRun snapshotに残す。

## 1024 / 1280確認

隔離DBとProduction UIを使い、長文Markdown、list、code block、table、Marker付きAssistant Turnを表示して確認した。

| viewport | Right Sidebar | Left | Center | Right | horizontal overflow |
|---|---|---:|---:|---:|---:|
| 1024×768 | open | 200px | 523px | 230px | なし |
| 1024×768 | closed | 200px | 715px | 38px | なし |
| 1280×800 | open | 220px | 689px | 268px | なし |
| 1280×800 | closed | 220px | 919px | 38px | なし |

UI Structure v0.1で確認した1024px時Center 523pxを維持した。Composerは試験データ0件時で約242px。固定Composerによる本文下端の余白も既存方式を維持している。

## Browser / Electron確認

- Browser: 隔離DB、backend `5199`、Vite renderer `5200`でProduction UIを確認した。
- Electron: `npm run electron:dev`でElectron main、既存backend、Vite rendererが起動した。Electron renderer `5186`で同じTurn / Composer / Right Sidebar表示を確認した。
- Electron rendererの1280px相当表示ではCenter 689px、Turn 4件、horizontal overflowなしだった。
- Electron専用UIやElectron専用styleは追加していない。

## Tests

- Turn role / sequence / status、Markdown list / code / table、Marker renderingをUI testで確認した。
- Handoff User Turnの保存本文を変えず質問部分だけ表示することと、source title / T番号表示を確認した。
- Immediate Ask 5件がcompact scroll classへ入り、5件policyを維持することを確認した。
- Marker Detail、Preview、Immediate Askの高さ制約を確認した。
- 既存MarkerCore、Normal Chat、Keep Context UIの集中回帰を実行した。

最終結果:

- `npm test`: 336 total / 334 pass / 2 skip / 0 fail
- `npm run typecheck`: PASS
- `npm run build`: PASS
- `git diff --check`: PASS（既存working treeのCRLF警告のみ）

## 残るUI polish

- 1024pxでMarker Detailを開くと、Conversation本文約204pxとRight Sidebarの一部へ重なる。常設領域を増やさず一時操作を優先した結果で、実使用後にpopover位置の追従を検討できる。
- fixed Composerは0件時でも約242pxを使う。入力欄を主役にする現行方針では許容したが、画面高がさらに小さい環境は別途確認が必要。
- code blockは読みやすい固定幅表示とscrollまでで、syntax highlightingは追加していない。
- source Conversationが削除済み、またはreadに失敗した場合は、Handoff元Turn番号を表示できない。
