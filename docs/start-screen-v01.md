# Att-Chat Start Screen v0.1

## Start Screen構成

Production React UIの起動時表示としてStart Screenを追加した。起動直後はConversation本文を自動表示せず、次を一画面にまとめる。

- 現在のモデルと接続状態
- User Basic Promptのpresetと本文確認
- 新しいチャット
- 最後の会話
- 最近の会話（`updated_at`の新しい順、最大5件）
- 既存Settings Shellへの導線

Conversation表示中はヘッダーの`Att-Chat`からStart Screenへ戻れる。Start ScreenはProduction clientに置き、Laboratory componentやElectron専用componentへ依存しない。

## Model表示

既存の`GET /api/models`を使用し、Start Screen、通常Composer、Settings / ModelがAppの同じsession stateを参照するようにした。新しいhealth-check APIは追加していない。

状態表示は、モデル一覧取得中を`未確認`、選択中モデルが一覧に存在する場合を`利用可能`、取得失敗・一覧なし・選択モデル不在を`利用不可`としている。Start Screenの`モデル変更`は既存Settings ShellのModel sectionを開く。providerやendpointの詳細はStart Screenへ表示しない。

## 接続状態表示

接続状態は既存model list responseで判断できる範囲に限定した。LM Studioへの新しいprobeや生成requestは行わない。利用可能モデルがない場合もStart Screen自体とConversation導線は表示を維持する。

## User Basic Prompt preset

次のpresetをReact stateで保持する。

- 標準
- 学習
- 開発
- 調査
- カスタム

preset選択時は対応本文へ切り替える。本文を直接編集すると`カスタム`になる。v0.1では表示・選択・編集の確認に限定し、生成request、Conversation、GenerationRun、DBには保存しない。

## 新規 / 継続Conversation導線

`新しいチャット`は既存Conversation作成APIを使い、作成後に通常Conversation画面を開く。`最後の会話を開く`はrecent一覧の先頭、つまり`updated_at`が最新のConversationを開く。Conversationがない場合はdisabledにして説明を表示する。

## 最近の会話

既存`GET /api/conversations`のread modelを再利用する。Start Screen側で`updated_at`降順に並べ、最大5件を表示する。項目選択後は既存のConversation detail取得と通常3カラム画面へ移る。新しいDB queryやschemaは追加していない。

## 起動設定UI

Settings / Generalに次の骨組みを追加した。

- 起動時: スタート画面を表示 / 最後の会話を開く
- モデル: 前回のモデルを自動選択
- ユーザー基本プロンプト: 前回設定を引き継ぐ

選択状態はAppのReact stateだけに保持する。設定UIとstate境界の確認が目的であり、reloadや次回process起動への復元は行わない。

## Browser / Electron確認

隔離DBとdevelopment Viteを使用してBrowser版を確認した。

- Start Screen初期表示
- LM Studio model listを使ったモデル名と`利用可能`表示
- Settings / Modelへの遷移
- preset変更とカスタム本文編集
- 新規Conversation作成
- 最後のConversation表示
- recent Conversation選択
- Conversation画面からStart Screenへの復帰
- Browser console errorなし

Electron Skeletonのdevelopment renderer（Electron用Vite + 隔離DB）でも、同じStart Screen、モデル状態、保存済みrecent Conversation、Settings導線が表示された。Electron専用Start Screenは追加していない。packaged buildやAppData保存は今回確認していない。

## 今回session-onlyにした項目

- 起動時表示の選択
- 前回モデルを自動選択するチェック
- User Basic Prompt presetと編集本文
- 前回User Basic Promptを引き継ぐチェック

Basic Promptは生成requestへも接続していない。v0.1で暗黙にsystem promptを変更しないためである。

## 後で永続化すべき項目

人間評価後に、次を別Phaseで決める必要がある。

- 設定の保存先とBrowser / Electron packaged環境の共通契約
- 前回モデルが利用不能な場合の正式な復旧動線
- User Basic Promptの保存単位とGenerationRun snapshotへの記録
- 起動時に最後のConversationを開く処理の適用タイミング
- Electron AppDataへの正式な保存先

## Validation

Start ScreenのDOM testで、recent順、新規・最後・recent導線、Model / Settings導線、preset切替、カスタム編集、Conversationなし時のdisabled、起動設定session state、共有モデル選択stateを確認した。

- `npm test`: 340 total / 338 pass / 2 skip / 0 fail
- `npm run typecheck`: PASS
- `npm run build`: PASS
- `git diff --check`: PASS

全suite初回のみ、既存Center UIの非同期Marker描画テストが並列実行時に1件失敗した。同テスト単独は4/4 PASSし、全suite再実行も上記のとおりPASSしたため、タイミング揺らぎとしてtestコードは変更していない。
