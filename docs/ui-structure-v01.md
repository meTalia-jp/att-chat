# Att-Chat UI Structure Phase v0.1

## 3カラム構成

Frozen `Att-Chat Integrated Dummy UI v0.1` の役割分担を、本番React UIへ接続した。

- Left: Chat / Question Box
- Center: Conversation / Marker Detail / Composer
- Right: Quick tools / Turn miniMAP

左Sidebarと中央Conversationのデータ経路は変更していない。右Sidebarは開閉可能で、閉じた場合は中央Conversationが空いた幅を使用する。

## Right Sidebar仕様

上部を `Quick辞書 / Quickメモ` のタブ領域、下部を常設miniMAP領域とした。Sidebar全体はviewport内へ収め、Quick toolsとminiMAPがそれぞれ内部scrollを持つ。

### Quick辞書

- ASCII英単語1語だけを受け付ける。
- EJDict-hand JSONを最初の有効な検索時にlazy loadし、その後はメモリ内で再利用する。
- fuzzy search、lemmatization、AI処理、履歴保存は行わない。
- 辞書本体が未配置の場合は配置先と取得元を穏やかに案内する。
- Laboratory実装をproduction dependencyにせず、同じ結果契約と外部資産方針を本番用の小さなserviceへ適用した。

### Quickメモ

- memory-only。
- 複数件を追加順に保持し、重複を許可する。
- 編集、削除、export、永続化は行わない。
- 本文選択を入力へ反映でき、直接入力もできる。

### Turn miniMAP

MarkerCoreが保持する既存Highlight、jump、pulse、描画位置計測を再利用し、Portalで右Sidebarへ配置した。詳細モードはTurn行とMarkerを表示し、全体モードは既存の比例rail、viewport、current Turn、Marker色を表示する。Sidebarを閉じてもcomponent stateは保持される。

本番schemaにはTurn Importantの状態が存在しないため、Laboratoryの `★ Turn目印` は今回本番へ追加していない。新しいDB列やmemory-onlyの別契約を作らず、現行本番miniMAPが持つMarker色とcurrent positionを維持した。

## Settings構成

Settings Shellに次のsectionを設けた。

- General
- Model
- UI
- Marker
- Storage
- Electron
- Developer / Experimental

Model sectionへ既存のモデル一覧更新とモデル選択を移した。通常Composerには現在モデル名だけを小さく表示し、クリックするとModel settingsを開く。Providerや生成経路は変更していない。

設定値の永続化は行わない。Settings ShellとDeveloper表示状態は現在のReact sessionだけで保持する。

## 通常UIから移動した開発機能

`Developer / Experimental` に次の初期OFF toggleを追加した。

- Marker管理を表示
- Run詳細を表示

Marker Detail、Question Box、Context/Handoff Previewなど実利用経路のUIは隠していない。Context/Handoff Previewは該当する質問準備中だけComposer内へ表示する。

## Browser / Electron確認

隔離DBを使用したBrowser版で次を確認した。

- Quick辞書で `experiment` を検索しEJDict-handの結果を表示。
- Quickメモへ同一内容を2件追加し、duplicateを保持。
- miniMAPの詳細 / 全体切替。
- Right Sidebarのclose / reopenとQuickメモ内容保持。
- Settingsの全section遷移。
- Model sectionで既存LM Studio model一覧を表示。
- Developer toggleでMarker管理 / Run詳細を表示・非表示。

Electron Skeletonも隔離DBで起動し、`http://127.0.0.1:5186/` のrendererに3カラム、Quick tools、Turn miniMAP、既存ConversationとMarkerが表示されることを確認した。Electron専用UIやproviderは追加していない。

## 1024 / 1280での所感

| viewport | Left | Center | Right | Quick tools | miniMAP area | horizontal overflow |
|---|---:|---:|---:|---:|---:|---|
| 1280 × 800 | 220px | 689px | 268px | 218px high | 550px high | なし |
| 1024 × 768 | 200px | 523px | 230px | 218px high | 518px high | なし |

1280pxではConversationに十分な余白がある。1024pxでは中央幅523pxで読書とComposer操作は成立したが、Marker Detailを同時に開く場合は既知の重なりを引き続き観察する必要がある。Sidebarを閉じると1280px時の中央幅は689pxから919pxへ広がった。

Quick toolsは固定218px、miniMAPは残りを使用するため、高さ競合は起きなかった。Quickメモや辞書結果が長い場合はQuick tool領域内だけがscrollする。

## 次に中央Conversationで整理すべき項目

- 1024px付近でMarker Detailを開いた場合の本文被覆。
- Immediate Askが複数件ある場合のComposer最大高とConversation末尾の余白。
- Context / Handoff Previewが長い場合のComposer内表示密度。
- User / Assistant Turnの見出し、余白、長文Markdownの最終polish。
- 本番Turn Importantを導入する場合の状態契約とminiMAP表示。今回はschema変更禁止のため対象外。
