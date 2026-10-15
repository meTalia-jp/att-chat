# Att-Chat UI Cleanup & Start Screen Simplification v0.9

## User Basic Promptの撤去

User Basic PromptはStart Screenの表示とReactのsession stateだけに存在し、Generation、Provider request、`GenerationRun.request_snapshot`、DB、`localStorage`、`sessionStorage`には接続されていなかった。System ProfileとUser Profileが回答方針と回答対象の前提を担うようになり、Production候補として独立した役割がなくなったため、次をProductionコードから撤去した。

- Start ScreenのPreset selector、textarea、専用props、専用state、専用CSS
- `basicPromptPresets`と`BasicPromptPreset`
- `StartupPreferences.reusePrompt`と「前回設定を引き継ぐ」UI
- Basic Prompt専用テスト

過去の経緯を残すため、`docs/start-screen-v01.md`と`docs/ui-cleanup-v01.md`は変更していない。

## Start ScreenのProfile表示

Start Screenは編集UIを持たず、現在のセッションでApply済みのSystem ProfileとUser Profileの表示名だけを表示する。表示名はProductionのshared preset定義を参照し、UI側に別のID対応表を作っていない。

- System Profile: `OFF` / `簡潔` / `思考支援` / `非迎合` / `カスタム`
- User Profile: `OFF` / `初学者` / `実務` / `専門` / `カスタム`

Settings内の選択はdraftのまま保持され、ApplyするまでStart Screen表示とGeneration設定へ反映されない。実ブラウザでは、System Profileを`簡潔`へ変更してApply前は`OFF`のまま、Apply後は`簡潔`へ変わることを確認した。User Profileも同様に、`初学者`の選択だけでは`OFF`のまま、Apply後に`初学者`へ変わった。reload後は両方が`OFF`へ戻り、既存のsession-only契約を維持する。

## Conversation title

選択中Conversationのタイトルをクリックすると、同じ位置で編集フォームを開く。

- Enterまたは「保存」で前後空白をtrimして保存
- Escapeまたは「キャンセル」で変更を破棄
- trim後が空なら保存ボタンを無効化
- 成功後にConversation詳細と左一覧を再取得し、一覧へ即時反映
- `PATCH /api/conversations/:conversationId`からRepositoryへ保存
- `updated_at`を単調に更新し、最近の会話にも変更を反映

隔離DBを使った実ブラウザ確認では、Start Screenから新規Conversationを作成して改名できた。別のConversationを`UI v0.9 実ブラウザ確認`へ変更し、reload後もStart Screenの最近の会話に同名が復元された。repository testでもファイルDBのclose/reopen後にタイトルが保持されることを確認した。schemaとmigrationは変更していない。

## Header固定とscroll構造

Conversation表示ではrootをviewport高のflex columnとし、Headerをmain scroll領域の外に置いた。Headerは44px、3カラムlayoutは残りの高さを使用し、Center、Left、Rightがそれぞれ必要に応じて内部scrollする。`body`はConversation表示中にページ全体をscrollしない。

実ブラウザで測定した結果:

| viewport | Header | Left | Center | Right | body横overflow |
|---|---:|---:|---:|---:|---|
| 1280 x 800 | 44px | 200px | 776px | 240px | なし |
| 1024 x 768 | 44px | 180px | 580px | 220px | なし |
| 800 x 768 | 44px | 150px | 400px | 210px | なし |

1254 x 884の確認ではCenterの`scrollTop`が`0`から`182`へ変化した一方、`window.scrollY`は`0`、Header上端は`12px`のままだった。会話を下へscrollしてもAtt-Chat、状態、再読込、設定が残る。

## Marker回帰確認

Header固定後も、既存MarkerをクリックしてQuick Actionを表示し、左`▽`からMarker Detailを開けた。1280 x 800ではSignalは選択箇所の近くに表示され、1024 x 768と800 x 768ではMarker Detailがviewport内へclampされ、内部scrollを維持した。Centerをscrollした後もQuick ActionとDetailを開けた。

今回、Markerのinteraction anchor、Highlight offset、保存、Immediate Ask、Deferred Ask、Question Keep、miniMAP、削除lifecycleは変更していない。

## Validation

- focused tests: 27件中、sandbox内でlocal HTTP接続だけがOS権限制約により失敗。該当HTTP testを権限付きで再実行してPASS
- `npm test`: 379 total / 377 pass / 2 skip / 0 fail
- `npm run typecheck`: PASS
- `npm run build`: PASS
- `git diff --check`: PASS（既存working treeのCRLF警告のみ）
- 実ブラウザ: PASS。通常DBを変更しないよう、`data/attchat.sqlite`の作業用コピーを`.cache/ui-v09.sqlite`として使用

## 未対応事項

- SettingsとProfileの永続化
- 新規Conversation開始時のProfile確認
- AIによるConversation title自動生成
- Conversation summary、history圧縮
- Marker anchor方式の変更

これらはv0.9の範囲外であり、今回の実装には含めていない。
