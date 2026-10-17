# METAMI Att-Chat

AIとの会話を、答えを得るだけで終わらせず、Marker、質問、メモ、振り返りを使って考え続けるためのローカルチャットアプリです。

Att-Chatは、会話を読み、気になる箇所を残し、そこから問いを深める流れを一つの画面で扱います。

## Latest Release

最新の正式公開版は **Att-Chat 1.0.0** です。

- [Att-Chat v1.0.0 Release](https://github.com/meTalia-jp/att-chat/releases/tag/v1.0.0)
- Windows x64: [`Att-Chat-v1.0-win-x64.zip`](https://github.com/meTalia-jp/att-chat/releases/download/v1.0.0/Att-Chat-v1.0-win-x64.zip)
- 対応するruntime source: [`Att-Chat-v1.0-runtime-source.zip`](https://github.com/meTalia-jp/att-chat/releases/download/v1.0.0/Att-Chat-v1.0-runtime-source.zip)
- checksum: [`SHA256SUMS.txt`](https://github.com/meTalia-jp/att-chat/releases/download/v1.0.0/SHA256SUMS.txt)

## Windows版を使う

1. v1.0.0 ReleaseのAssetsから `Att-Chat-v1.0-win-x64.zip` をダウンロードします。
2. ZIPを任意のフォルダへすべて展開します。
3. 展開先の `AttChat.exe` を起動します。

配布版はインストーラーではなく、ZIP展開型です。`AttChat.exe` だけを取り出さず、DLLや `resources` フォルダを含む展開内容を同じ場所に保ってください。一般利用にNode.js、npm、Gitは不要です。

## AIモデルについて

Att-Chat自身はAIモデルを内蔵していません。Ver1.0では、LM Studioが提供するローカルのOpenAI互換APIへAtt-Chatのbackendから接続します。

- 同じPC上のLM Studioへ接続できます。
- 詳細設定では、LAN上の別PCで動くLM Studioのhostnameまたはprivate IPを指定できます。
- LM StudioでモデルをロードしてLocal Serverを起動した後、Att-Chatの「設定」→「モデル」で接続確認とモデル選択を行います。
- 既定の接続先は `http://127.0.0.1:1234/v1` です。

OpenAI APIへの直接接続、API keyの保存、一般のインターネット上のProviderへの接続はVer1.0では未対応です。対応範囲の詳細は[モデル接続の実装記録](docs/model-connection-v1-pre1.md)を参照してください。

## Att-Chatの考え方

Att-Chatは「AIに考えてもらうチャット」ではなく、AIを使って人間が考え続けるためのチャットを目指しています。

```text
読む
→ Markerを付ける
→ 疑問やメモを残す
→ AIへ質問する
→ 回答を読む
→ さらに考える
→ 新しい疑問へ進む
```

## Ver1.0の主な機能

- **通常チャット**: streaming応答を表示し、User / Assistant TurnとGeneration Runを保存します。
- **Marker**: completed Assistant Turnの連続した範囲へ4色のMarkerを付け、引用、メモ、質問を関連づけます。
- **Marker一覧・色フィルタ・Jump**: 会話内のMarkerを確認し、元の位置へ移動できます。未解決の位置を文字列検索で自動再アンカーしません。
- **Immediate Ask**: 最新のcompleted Assistant TurnにあるMarkerから質問をComposerへ追加し、最大5件を一つのRunで送れます。
- **Deferred Ask / Question Keep**: Markerから疑問を質問箱へ残し、後で同じチャットまたは新しいチャットから質問できます。
- **Global Question Box**: 複数ConversationのQuestion KeepをConversation単位で確認し、元のTurnとMarkerへ戻れます。
- **Context Correction**: Question Keepから同じチャットで質問するとき、Marker周辺の過去Turnを少なめ・標準・多めから選べます。
- **New Chat Handoff**: Question Keepを新しいConversationへ分岐し、選択した過去Turnを参考文脈として引き継げます。
- **Quick Memo**: 会話中に選んだ断片や入力したメモをMarkdown箇条書きとして保存します。
- **Quick辞書**: EJDict-handを使い、ASCII英単語1語の一般的な意味を確認します。結果はAI生成ではありません。
- **Turn miniMAP**: TurnとMarkerの位置を俯瞰し、会話内を移動できます。
- **System Profile**: `OFF`、`簡潔`、`思考支援`、`非迎合`、`カスタム`からモデルの回答方針を選べます。
- **User Profile**: `OFF`、`初学者`、`実務`、`専門`、`カスタム`から、回答の粒度や前提に使う補助Contextを選べます。
- **Collections**: Conversationを独立した分類情報で整理できます。
- **Settings**: モデル接続、UI、Profile、保存、Electron、開発表示を設定できます。
- **実行状態の記録**: 成功、失敗、cancelled、interruptedをGeneration Runとして追跡します。
- **Electron配布版**: React UI、Node backend、SQLiteを一つのWindows向け配布物として起動します。

### Markerを使う

completed状態のAssistant本文から、一つのTurn内にある連続範囲を選択します。表示されたQuick Actionで色を選ぶとMarkerが作成されます。

Markerには次の情報や操作を関連づけられます。

- 4色の色分け
- 選択した引用
- 自分用のメモ
- 今すぐ質問する内容
- 質問箱へ残すQuestion Keep

本文、Question Box、miniMAPから元のTurnとMarkerへ戻れます。保存した位置を表示できないMarkerは `unresolved` として理由を示し、別の文字列へ自動的に付け替えません。詳しい操作と制約は[Marker UXの検証記録](docs/marker-ux-finalization-v01.md)を参照してください。

### 質問を続ける

Markerから生まれた質問は、その場でComposerへ追加することも、Question Keepとして質問箱へ残すこともできます。後から質問箱を開き、元の位置へ戻る、同じConversationで周辺Contextと一緒に質問する、新しいConversationへ分岐して質問する、のいずれかを選べます。

Context量は固定のTurn窓を使う初期方式です。質問に必要な意味上のつながりを自動判定するRAGやSemantic Searchではありません。統合経路の記録は[Att-Chat Full Integration v0.1](docs/att-chat-full-integration-v01.md)にあります。

### Profileを使う

SettingsのSystem Profileはモデルの回答方針を調整します。User Profileは、利用者の前提知識や求める説明の粒度を回答時の参考情報として加えます。両方を有効にした場合も、Att-ChatはProviderへ送るsystem messageを一つに正規化します。

Profileは回答の方向を調整する補助であり、正確性を保証するものではありません。設定を編集しただけでは反映せず、「適用」後の新しいRunから使用します。

## データ保存

Windows配布版では、次のデータをElectronのユーザーデータ領域内に保存します。

- 会話、Turn、Marker、Question Keep、Generation Runを含むSQLite DB
- `settings.json`
- `collections.json`
- `quick-memo.md`

保存先はPCの利用者ごとに独立しています。アプリのZIPを別PCへ置くだけでは会話履歴は移りません。また、同じSQLite DBを複数のAtt-Chat serverから同時に使用しないでください。

ソース開発時は、repository内の `data` または指定した開発用パスを使用します。配布版の保存領域とは別です。

## ソースから起動する

以下は開発者向けです。一般利用者はWindows配布版を利用できます。

検証環境はWindows / Node.js 24.19.0です。

```powershell
git clone https://github.com/meTalia-jp/att-chat.git
cd att-chat
npm.cmd ci --ignore-scripts
npm.cmd run build
npm.cmd start
```

起動後に <http://127.0.0.1:5181/> を開きます。serverがビルド済みUIを配信するため、この手順ではViteを別に起動する必要はありません。Ctrl+Cで終了します。

開発時にViteを使う場合は、backendとfrontendを別のターミナルで起動します。

```powershell
npm.cmd run server
npm.cmd run dev
```

Viteは <http://127.0.0.1:5180/> で起動し、既定では5181番portのAPIへproxyします。開発用の主な環境変数は `ATTCHAT_DB`、`ATTCHAT_PORT`、`LM_STUDIO_BASE_URL` です。LM Studio接続先はlocal / LANのHTTP URLに限定されます。

## Laboratory / 開発記録

`src/laboratory`、`docs/laboratory`、各Phase文書は、設計判断、実験条件、過去の基準、検証結果を残す開発資産です。現在の一般利用手順や最新仕様の入口ではありません。

実験・比較・再開手順は[Laboratory Guide](LAB_GUIDE.md)を参照してください。

- [Production Integrationの統合確認](docs/att-chat-full-integration-v01.md)
- [Marker Quick Actionの統合記録](docs/marker-quick-action-integration-v01.md)
- [New Chat Handoffの本番接続記録](docs/new-chat-handoff-production-v01.md)
- [System message正規化](docs/system-message-canonicalization-v08.md)
- [Ver1.0公開完了記録](docs/ver1-release-completion.md)

Phase 0〜3B-2等の文書は当時の実装範囲を記録した履歴です。現在のVer1.0仕様を示すものとして読み替えず、変更理由や制約の追跡に利用してください。

<details>
<summary>Phase 0〜3B-2の初期開発記録</summary>

- [Phase 0結果](docs/phase0-results.md)
- [Phase 1A設計・スキーマ](docs/phase1a-design.md)
- [Phase 1A検証結果・判定](docs/phase1a-results.md)
- [Phase 1B設計・状態遷移・制限](docs/phase1b-design.md)
- [Phase 1B検証結果・判定](docs/phase1b-results.md)
- [Phase 2A設計・制限](docs/phase2a-design.md)
- [Phase 2A Markdown対応範囲](docs/phase2a-markdown-support.md)
- [Phase 2A検証結果・判定](docs/phase2a-results.md)
- [Phase 2B設計・制限](docs/phase2b-design.md)
- [Phase 2B検証結果・判定](docs/phase2b-results.md)
- [Phase 3A設計](docs/phase3a-design.md)
- [Phase 3A検証結果](docs/phase3a-results.md)
- [Phase 3B-1設計](docs/phase3b1-design.md)
- [Phase 3B-1検証結果](docs/phase3b1-results.md)
- [Phase 3B-2分岐設計・snapshot](docs/phase3b2-design.md)
- [Phase 3B-2検証結果](docs/phase3b2-results.md)

</details>

## 検証

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

テストはメモリDBまたは一意な一時フォルダのDBを使用し、通常利用のSQLite DBには触れません。公開版で実施したpackaged smoke、公開asset、ライセンス監査の結果は[Ver1.0公開完了記録](docs/ver1-release-completion.md)にあります。

## ライセンス

Att-Chat本体は [MIT License](LICENSE) で提供します。Electron、Chromium、Node.js、npm依存、EJDict-hand、およびMarker基盤の一部へ選択的に改変継承したRpenProof由来コードには、それぞれのライセンスが適用されます。

- [第三者コンポーネントとライセンス](THIRD_PARTY_NOTICES.md)
- [LGPL/MPL対象ソースの提供方法](SOURCE_AVAILABILITY.md)
- [RpenProof由来コードの技術的な追跡記録](docs/rpenproof-contribution-trace.md)
- [EJDict-hand README](public/dictionaries/ejdict-hand/README.md)
- [EJDict-hand取得元とbundled hash](public/dictionaries/ejdict-hand/SOURCE.json)

## Release / source availability

Ver1.0のWindows配布物、対応するruntime source、checksumは同じ[GitHub Release](https://github.com/meTalia-jp/att-chat/releases/tag/v1.0.0)で公開しています。LGPL/MPL対象を含む対応ソース、revision、hash、再構築に必要な情報は [SOURCE_AVAILABILITY.md](SOURCE_AVAILABILITY.md) を参照してください。
