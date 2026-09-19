# att-chat Laboratory current state

調査日: 2026-09-19

## 分類上の注意

現行コードにEquipment registry、Equipment interface、動的探索機構はない。
`ExperimentDefinition.equipment` はCatalogに表示する文字列メタデータであり、そこへ記載された名前だけを
「実装済みEquipment」とは判定しない。本書では、実在するmodule / Component / Service、テストfixture、
再利用候補を分けて記載する。

## Experiments

正本は `src/laboratory/catalog.ts` の固定配列である。

| ID / title | kind | runnable | entry | Run記録 | 状態 |
| --- | --- | --- | --- | --- | --- |
| `simple-marker-chat` / Simple Marker Chat | example | yes | `simple-marker-chat` | Simple session JSON + Core SQLite GenerationRun | TESTING |
| `single-text-generation` / Single Text Generation | example | yes | `single-text-generation` | ExperimentRun JSON | TESTING |
| `study-p0` / Study P0 | existing-experiment | no | なし | Lab内ではrecord-only。Study自身はメモリ上 | TESTING |
| `marker-color-sample` / Marker Color Sample | example | yes | `marker-color-sample` | 自動Run JSONなし。定義と目視手順を記録 | TESTING |

Color Sampleは本調査で追加した。固定登録であり、Plugin discoveryは行わない。

## Components and services with code identity

| 名前 | 種類 | 使用中のExperiment | 使用実績 | 状態 / reusable |
| --- | --- | --- | --- | --- |
| `Laboratory` | React Catalog / Workspace | 全登録Experiment | Catalogから4件を表示 | Lab入口として使用中 |
| `SimpleMarkerChat` | React composition | Simple Marker Chat | Phase 2以降のtest・実ブラウザ | reusable。ChatとMarkerCoreをcomposition |
| `Chat` | React Component | Core Chat、Simple | 複数画面・回帰test | reusable。通常Generation UI |
| `MarkerCore` | React Component | Core Chat、Simple | Phase 1以降のtest・実ブラウザ | reusable。Highlight操作の正本 |
| `MiniMap` + `minimap.ts` | React + position logic | Core Chat、Simple | MarkerCore経由 | reusable。DOM位置から算出 |
| `MarkerColorSample` | React Experiment-local Component | Marker Color Sample | 今回のRun画面とtest | 専用。共通Theme Componentではない |
| `SingleTextGeneration` | React Component | Single Text Generation | Phase 3以降のtest・実ブラウザ | Conversation非依存UIとして使用中 |
| `SingleTextService` | Service | Single Text Generation | Unit / HTTP / UI test | 専用service、汎用Runnerではない |
| `LMStudioProvider` | Provider | Simple/Core、Single、Study P0 | 複数経路・実モデル検証 | 実体のある共有module |
| `GenerationService` | Service | Core / Simple | CoreとLab gateway | Chat用。汎用Runnerではない |
| `Repository` / Core HTTP server | persistence / HTTP | Simple Marker Chat | Lab専用SQLiteで使用 | Core再利用。Lab用コピーなし |
| `RunFiles<T>` | JSON persistence Component | Simple、Single | 2種類のRun directory | reusableな保存部品。正式Equipment registryなし |
| `SimpleSessions` | session recorder | Simple Marker Chat | session、Generation ID、Marker event | Simple専用 |
| `RunResults` | React results viewer | Simple、Single | 2種類のJSON Run | 最小共通表示。Color/Studyには適用しない |

使用回数を実行回数として正確に取得できない項目は `unknown` とする。上表の「複数画面」「test」は
参照箇所・検証実績であり、利用者の実行回数ではない。

## Equipment

### Explicitly implemented as Equipment

**なし。** Equipmentという型、registry、lifecycle、共通UI契約は実装されていない。

### Catalog metadata labelled as equipment

- Simple: Local LLM、Conversation / Turn、Marker、Marker List、miniMAP
- Single: Local LLM、Text Input、Output Viewer、Run JSON
- Study: 既存Study P0 runner
- Color Sample: Marker color IDs、Visual Sample Workspace

これらはExperiment定義上の使用設備名であり、コード上のEquipment宣言ではない。

### Equipment candidates

| 候補 | 根拠 | 現在の判定 |
| --- | --- | --- |
| Local LLM access (`LMStudioProvider`) | Core、Single、Studyで同一moduleを再利用 | 強い候補。ただしEquipment contractなし |
| Run JSON (`RunFiles<T>`) | SimpleとSingleで共用 | 強い候補。保存対象schemaはExperiment別 |
| Marker stack (`MarkerCore` / MiniMap) | CoreとSimpleで再利用 | Componentとして確立。Equipment化の必要性は未決定 |
| GenerationDiagnostic | 12実モデルRunで再利用 | reusable fixture / Equipment候補。未昇格 |

## Fixtures

| 名前 | 分類 | 使用箇所 | 確認できる使用実績 | reusable | Equipment候補 |
| --- | --- | --- | --- | --- | --- |
| `scripts/generation-diagnostic.ts` | 作業用診断fixture | max_tokens比較 | 先行9 + 続編3 = 12 Run | yes候補 | yes候補、未昇格 |
| `tests/fixtures/derived-experiment.ts` | Lab completion fixture | Catalog / Run派生実証 | 2 test fileから参照 | metadata手動コピー例として限定的 | no |
| inline fake LM Studio providers | test-local fixture | Lab / Single / Chat test | 実行回数 unknown | test helper抽出候補 | no |
| Study P0 problems | Experiment-local fixture | Study P0 | 6教材fixture | Study内のみ | no |
| `tests/fixtures/fake-embedding-provider.ts` | Semantic test fixture | S0〜S3系test | 実行回数 unknown | Semantic test内でreusable | no（Lab Equipmentではない） |
| Marker Color palette dataset | Experiment-local visual dataset | Marker Color Sample | 今回の画面・3 test | Theme検討へ再利用可能 | 現時点ではno |

Generation diagnosticは入力・上限・反復を変えて複数回使われているため「1回しか使っていない治具」ではない。
ただしprivacy、artifact lifecycle、Provider対応、result schemaが未確定なので共通Equipmentとは呼ばない。

## Run records

- Laboratory既定data directory: `data/laboratory`（`LAB_DATA`で専用directoryへ変更可能）。
- Simple: `simple-marker.sqlite`をCoreデータの正本とし、`simple-session-runs/*.json`へ
  Experiment snapshot、GenerationRun ID、model、Marker ID-only eventを保存する。
- Single: `single-text-runs/*.json`へ入力・出力・partial、request body、settings、provenance、
  Experiment snapshotを保存する。
- RunFilesはowner lock、temporary write、fsync、renameを使用する。
- Study P0はLab Resultsから文書へ案内し、統一Run JSONには入れない。
- Marker Color Sampleは目視比較であり、今回自動Runや評価スコアを保存しない。

## Catalog / Workspace / Results

- Catalog: TypeScript固定配列。title、status、purpose、kind、runnableを表示。
- Workspace: Overview / Run / Resultsの3 tab。IDE型paneや動的Plugin discoveryはない。
- Run: entryを明示的に既存Componentへ対応付ける。任意entryの動的実行はしない。
- Results: Simple / Singleの保存Runを最小表示。Studyは既存文書、Color Sampleは目視評価の案内。
- 生成中、またはSimple session中は別Experimentへ切り替えない。

## Composition evidence

### Simple Marker Chat

`SimpleMarkerChat -> Chat + MarkerCore -> MiniMap`。Server側はCoreのRepository、GenerationService、
LMStudioProvider、HTTP serverをLab専用data directoryで起動する。Question Keep、Related Turns、
Context CompareはSimple構成へ入らない。Marker、Chat、miniMAP、jumpのコピーはない。

### Single Text Generation

`SingleTextGeneration -> SingleTextService -> LMStudioProvider + RunFiles`。
Conversation、Turn、Marker、GenerationServiceへ依存しない。同じProviderを使うが実行serviceは専用である。

## Current conclusion

Laboratory v0.1は固定Catalog、軽量Workspace、既存Componentのcomposition、Experiment別Run記録を持つ。
一方、Equipmentはまだ概念とmetadataの段階であり、ComponentをEquipmentと自動的に読み替えない。
Marker Color Sampleもこの方針に従い、専用比較画面として追加し、本番Theme systemへ昇格させていない。
