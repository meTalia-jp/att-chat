# att-chat Laboratory Guide

Laboratoryは、既存部品や小さな試験用fixtureを使い、仮説・操作・結果・制限を記録して、本番採用の判断材料を得る場所です。Agentを交代してもRepositoryから再開できることを目指します。

## 最初に読む順番

1. 作業前に `git status --short` を確認し、既存の変更・未追跡ファイルを把握する。dirtyなworking treeはHEADと同一ではない。既存変更を上書き・整理しない。
2. このガイドで起動方法、正本、作業境界を確認する。
3. [Catalog](src/laboratory/catalog.ts)で対象IDを見つけ、`document_path`の文書を読む。Overviewにも同じRepository相対パスを表示する。文書配信・Markdown viewerはないので、Repositoryのエディタで開く。
4. 対象文書の最新Phase、判断理由、未評価項目、Scope Boundary（変更可能範囲と対象外）、完了条件を確認し、記載された実コードとTestsへ進む。古いPhaseの挙動を現在仕様と取り違えない。
5. 再利用部品を探すときは[Inventory](docs/laboratory/current-laboratory-inventory.md)も参照する。これは日付付きの補助資料であり、現在のCatalogと実コードで照合する。

対象ExperimentのScope Boundary外は変更しない。専用欄がない文書では「対象・制限・今回やらないこと」を読み、現在の依頼と合わせて範囲を確定する。不明な境界を推測で広げず確認する。技術検証の完了から、次Phaseや本番反映の許可を推定しない。

## 正本と境界

| 情報 | 正本・参照先 |
| --- | --- |
| ExperimentのID、version、status、実行入口、primary document | [catalog.ts](src/laboratory/catalog.ts)の固定登録 |
| 用語・読む順番・lifecycleの運用 | このガイド |
| 設計判断、Phaseの現在地、採否理由、観察、評価待ち | 対象Experimentのprimary document。過去の記録も保持 |
| 実際の動作と検証可能な契約 | 実コードとTests |
| 一度の実行の状態・定義snapshot・出典 | 保存済みExperimentRun。後のCatalog変更で過去snapshotを更新しない |
| 再利用資産の発見 | Inventoryを補助に、コードの参照先・使用実績を確認 |

本番Chatは通常の会話・Turn・GenerationRun・Highlightを永続化するアプリです。完全Labは既存のChat/Provider/Marker部品を専用データで使います。Lab内の視覚Prototypeにはメモリ保持だけのものもあり、Lab全体がDB不使用という意味ではありません。

Study P0は独立runnerを持つ別実験です。CatalogではRecord onlyであり、Labから起動・統合しません。起動・制限は対象documentを参照してください。

このガイドにExperiment一覧・Phase別結果を複製しません。Simple/Singleの初期文書にある「Catalog未実装」等は当時の状態です。現在の共通Run運用は[Phase 5](docs/laboratory-phase5-run-records.md)、定義正本と旧snapshot互換・Markerイベントは[Phase 5.1](docs/laboratory-phase51-completion-fixes.md)も参照してください。

## 起動モード

依存導入済みのRepositoryルートで実行します。Node環境は[README](README.md)を参照してください。

| | UI-only確認 | 完全Lab |
| --- | --- | --- |
| 用途 | Color Sample、Quick Action等の画面・メモリ内操作確認 | Simple/Singleの実行・保存・Results確認 |
| 起動 | `npm.cmd run dev` | `npm.cmd run build` の後、`node --experimental-strip-types src/laboratory/serve.ts` |
| URL | http://127.0.0.1:5180/laboratory.html | http://127.0.0.1:5195/ |
| 保存 | Prototypeごとの契約に従う | 既定 `data/laboratory/`。`LAB_DATA`で変更可 |

Viteの`/api` proxyは5181固定で、Labサーバー5195へは接続しません。Vite単独ではLab記録APIエラーが出ます。UI-onlyはAPIを遮断するsandboxではないため、5181に本番サーバーがいる状態で会話作成・生成などを試さないでください。保存を伴うLab操作には完全Labを使います。

完全Labの公開portは`LAB_PORT`で変更できます。既定データは本番の`data/attchat.sqlite`と分離されています。既存データの上書きを避けるため検証専用の`LAB_DATA`を使い、同じ保存先を複数プロセスで開かないでください。生成試験にはLM Studioが必要です。終了はCtrl+C。

## 用語と道具

| 用語 | 意味 |
| --- | --- |
| Experiment | 何を・なぜ・どう検証するか。定義と判断の単位 |
| ExperimentRun | 一度の実行記録。Singleは1 Generate、Simpleは開始から明示終了までのsession。視覚Prototype等は自動Run JSONを持たない |
| Component | 実在するUI/Service等の部品。再利用できても自動的にEquipmentにはならない |
| Fixture / jig | Experimentやtestの条件を作る専用データ・画面・治具。汎用化を前提にしない |
| Equipment Candidate | 複数用途での使用実績があり、共通の道具として検討する候補。未昇格 |
| Equipment | 用途、入出力、副作用、利用境界が合意された共通の道具。現時点では正式なEquipment契約・registryは未実装 |

Catalogの`equipment`は使用設備名の文字列metadataです。登録名だけでEquipment実装済みと判断しません。既存部品を調べても足りない場合は、依頼の範囲内で小さなExperiment-local fixtureを作れます。用途・副作用・制限・使用結果を対象文書へ残し、複数Experimentで繰り返し必要になってからEquipment候補とします。最初から汎用Frameworkを作りません。

## status / lifecycleの最小運用

以下は既存status値の運用定義です。現在のCatalog状態を自動変更するものではありません。

| Status | 意味と残す記録 |
| --- | --- |
| IDEA | 仮説段階。目的と仮説を残す |
| DRAFT | 手順・範囲・fixtureを設計中 |
| TESTING | 実行または評価中。未評価項目を明記 |
| PARTIAL | acceptanceの一部だけ確認済み。完了部分・未達部分を分ける |
| ADOPTED | 採用判断済み。対象・採用先・日付・根拠を残す |
| REJECTED | 評価後に不採用。理由・再検討条件を残す |
| PAUSED | 一時停止。停止理由・再開条件を残す |
| SUPERSEDED | 後続に置換。後継ID/versionを示す |

基本は `IDEA → DRAFT → TESTING`。評価に応じてADOPTED / REJECTED / PARTIAL / PAUSEDへ進み、PARTIAL / PAUSEDは条件を満たしたらTESTINGへ戻せます。後続に置換した場合はSUPERSEDEDとします。変更理由を対象文書へ残し、採用・不採用は人間の判断または明示的な委任に基づきます。過去の失敗や不採用案を削除しません。

実装完了、技術検証（test/build等）、user evaluation（操作感や目的への適合）、production adoption（本番への採用・反映）は別々に記録します。テストPASSだけで採用扱いにしません。Experiment内の一部成果物だけ採用済みでも、残りが評価中ならTESTINGのままで構いません。採用範囲は個別文書で確認します。

Runの`completed`は実行の終了であり、Experimentの採用でも検証合格でもありません。`validation_status`は別項目です。

## 観察の範囲

Glass LabとAgent監視は未実装です。現在のRun情報やSimpleのMarkerイベントは、Agentのfile read・command・equipment利用を追跡する完全な操作ログではありません。道具を使わなかった理由、fixture作成、試行やtest失敗も実験の観察材料として記録できますが、これを理由に依頼された変更範囲を広げません。
