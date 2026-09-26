# Laboratory asset inventory

最終照合: 2026-09-26、HEAD `74aae1e` + **dirty working tree**（Phase 1、Quick系の未コミット変更、辞書・Study等の未追跡資産を含む）。HEADだけでは再現できません。

## 分類ルール

- Experiment一覧と状態の正本は[Catalog](../../src/laboratory/catalog.ts)。Inventoryは資産分類専用で、Experiment状態を複製しません。
- Catalogの`equipment`文字列だけではEquipment認定しません。再利用実績がないものはFixture / Component / Data Asset等のままです。
- Componentは実装部品、Fixtureは実験専用の画面・治具、Data Assetは入力・参照データ、Test Fixtureはテスト専用の代用品です。
- Equipment Candidateは共有の道具として検討する候補。Equipmentは用途・境界が合意された道具ですが、今回は認定せず0件です。Tool Card作成も昇格を意味しません。
- stack等はまとめて1資産として数えます。Evidenceは参照・テスト・記録であり、実行回数や今回の実ブラウザ検証を意味しません。Maturityは資産の成熟度でありExperiment statusではありません。
- [LAB_GUIDE](../../LAB_GUIDE.md)から対象ExperimentのScope Boundaryを確認し、本書→[Tool Cards](tool-cards/README.md)→コード/Testsと進みます。Cardは利用許可を拡張しません。

## 資産

| Name | Classification | Code path | Used by | Evidence | Side effects | Tool Card | Maturity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LMStudioProvider | Equipment Candidate | [provider.ts](../../src/server/provider.ts) | Core/Simple、Single、Study | [service.ts](../../src/laboratory/single-text/service.ts) | loopback HTTP・推論消費 | [Card](tool-cards/lmstudio-provider.md) | 共有、未昇格 |
| RunFiles&lt;T&gt; | Equipment Candidate | [run-files.ts](../../src/laboratory/single-text/run-files.ts) | Simple、Single | [server.ts](../../src/laboratory/server.ts) | directory/lock/JSON書込 | [Card](tool-cards/run-files.md) | 2種類のRunで共有 |
| Marker stack | Equipment Candidate | [MarkerCore.tsx](../../src/client/MarkerCore.tsx) | Core、Simple | [marker-core.test.ts](../../tests/marker-core.test.ts) | Highlight API・selection/scroll/focus | [Card](tool-cards/marker-stack.md) | 共有Component群、未昇格 |
| Laboratory workspace | Component | [Laboratory.tsx](../../src/laboratory/Laboratory.tsx) | Lab入口 | [laboratory-ui.test.ts](../../tests/laboratory-ui.test.ts) | API読取・子画面操作 | — | 固定Catalog用 |
| Chat | Component | [Chat.tsx](../../src/client/Chat.tsx) | Core、Simple | [SimpleMarkerChat.tsx](../../src/client/SimpleMarkerChat.tsx) | 会話・生成API | — | 共有UI |
| SimpleMarkerChat | Component | [SimpleMarkerChat.tsx](../../src/client/SimpleMarkerChat.tsx) | Simple | [simple-marker-chat.test.ts](../../tests/simple-marker-chat.test.ts) | Chat/Markerの副作用 | — | 専用composition |
| GenerationService | Component | [generation.ts](../../src/server/generation.ts) | Core、Simple | [server.ts](../../src/laboratory/server.ts) | Provider通信・DB更新 | — | Chat契約専用 |
| Core persistence / HTTP | Component | [repository.ts](../../src/server/storage/repository.ts) | Core、Simple | [server.ts](../../src/laboratory/server.ts) | SQLite・HTTP listen | — | 専用Lab保存先が必要 |
| Single Text UI / service | Component | [service.ts](../../src/laboratory/single-text/service.ts) | Single | [single-text.test.ts](../../tests/single-text.test.ts) | Provider通信・Run保存 | — | 専用実行系 |
| SimpleSessions | Component | [simple-sessions.ts](../../src/laboratory/simple-sessions.ts) | Simple | [laboratory-runs.test.ts](../../tests/laboratory-runs.test.ts) | Run JSON記録 | — | 専用recorder |
| RunResults | Component | [RunResults.tsx](../../src/laboratory/RunResults.tsx) | Simple、Single | [laboratory-ui.test.ts](../../tests/laboratory-ui.test.ts) | Run API読取 | — | 最小共通viewer |
| Quick Dictionary service / panel | Component | [quick-dictionary.ts](../../src/laboratory/quick-dictionary.ts) | Quick Action | [quick-dictionary.test.ts](../../tests/quick-dictionary.test.ts) | 初回fetch・メモリcache | — | 単一Prototype内 |
| Quick Memo panel | Component | [QuickMemoPanel.tsx](../../src/laboratory/QuickMemoPanel.tsx) | Quick Action | [marker-quick-action.test.ts](../../tests/marker-quick-action.test.ts) | メモリ状態の表示 | — | 単一Prototype内 |
| Quick Action workspace / positioning | Fixture | [MarkerQuickActionPrototype.tsx](../../src/laboratory/MarkerQuickActionPrototype.tsx) | Quick Action | [marker-quick-action.test.ts](../../tests/marker-quick-action.test.ts) | selection・メモリMarker/Memo・辞書呼出 | — | Coreとは別契約 |
| Marker Color Sample | Fixture | [MarkerColorSample.tsx](../../src/laboratory/MarkerColorSample.tsx) | Color比較 | [marker-color-sample.test.ts](../../tests/marker-color-sample.test.ts) | 画面内palette切替 | — | 専用比較画面 |
| Generation diagnostic | Fixture | [generation-diagnostic.ts](../../scripts/generation-diagnostic.ts) | max_tokens調査・再確認 | [generation-settings-v01.md](../../docs/experiments/generation-settings-v01.md) | HTTP・入力読取・JSON書込 | — | 12 Runの反復記録、汎用契約未確定 |
| EJDict-hand | Data Asset | [配置案内](../../public/dictionaries/ejdict-hand/README.md) | Quick Dictionary | [SOURCE.json](../../public/dictionaries/ejdict-hand/SOURCE.json) | データ自体なし、読込時メモリ使用 | — | External Data Asset。本体は任意配置・ignore、未配置はDictionaryのみ案内 |
| Quick Action fixture本文 | Data Asset | [MarkerQuickActionPrototype.tsx](../../src/laboratory/MarkerQuickActionPrototype.tsx) | Quick Action | [marker-quick-action.test.ts](../../tests/marker-quick-action.test.ts) | データ自体なし | — | paragraphs定数、UI内同居 |
| Color palette dataset | Data Asset | [marker-color-sample.ts](../../src/laboratory/marker-color-sample.ts) | Color比較 | [marker-color-sample.test.ts](../../tests/marker-color-sample.test.ts) | データ自体なし | — | 共通Themeではない |
| Study P0教材 | Data Asset | [problems.ts](../../src/study-poc/problems.ts) | Study独立runner | [study-poc.test.ts](../../tests/study-poc.test.ts) | データ自体なし | — | Study専用 |
| derived Experiment fixture | Test Fixture | [derived-experiment.ts](../../tests/fixtures/derived-experiment.ts) | completion / UI tests | [laboratory-completion.test.ts](../../tests/laboratory-completion.test.ts) | metadataコピー、実行時既存entry利用 | — | 派生定義試験専用 |
| inline fake LM Studio | Test Fixture | [laboratory.test.ts](../../tests/laboratory.test.ts) | Lab/Single tests | [single-text.test.ts](../../tests/single-text.test.ts) | test内HTTP・一時保存先 | — | 共通helper未抽出 |
| FakeEmbeddingProvider | Test Fixture | [fake-embedding-provider.ts](../../tests/fixtures/fake-embedding-provider.ts) | Semantic tests | [semantic-search.test.ts](../../tests/semantic-search.test.ts) | 呼出・失敗の模擬 | — | Semantic test内共有 |

## 補助参照と照合上の注意

- Core persistence / HTTPのHTTP部分は[http.ts](../../src/server/http.ts)、Single UIは[SingleTextGeneration](../../src/laboratory/single-text/SingleTextGeneration.tsx)、Dictionary表示は[DictionaryPanel](../../src/laboratory/DictionaryPanel.tsx)、Quick位置計算は[helper](../../src/laboratory/marker-quick-action.ts)を参照。
- Quick系の利用制限・経緯は[個別記録](marker-quick-action-prototype.md)、Color比較は[個別記録](marker-color-sample.md)、辞書出典は[配布README](../../public/dictionaries/ejdict-hand/README.md)を参照。
- 旧版のExperiment一覧・Catalog件数・起動説明はCatalogとGuideへ集約しました。診断治具の12 Runは反復実績であり、共通Equipmentとしての適用範囲を証明しません。今回はFixtureとして保持します。
- Card対象外にも副作用のある部品はありますが、初期3枚に限定します。未追跡資産へのリンクは現working treeでは実在しますが、別checkoutへの配布時は同梱確認が必要です。
