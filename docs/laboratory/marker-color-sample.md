# Marker Color Sample Experiment

## Current State

照合日: 2026-09-26。Repositoryのdirty working treeを根拠とする要約。以下のPhase履歴は当時の記録として保持する。実装完了・技術検証・ユーザー評価・本番採用は別の判定。

- Catalog ID: `marker-color-sample`
- Catalog status: `TESTING`
- Current phase: v0.1、Vivid Aの暫定標準採用後の比較資産を保持。
- Implemented through: implementation complete（比較画面の範囲）。5 palette、本文/一覧/miniMAP相当のsurface比較。Theme Settingsは未実装。
- Technical validation: 本文Validationに自動・実ブラウザ検証記録あり。本番CSSのVivid A 12値・import・MarkerCoreの色選択classをコード/専用テストで照合。全背景/selection/focus組合せの検証完了は確認できない。
- User evaluation: Vivid A選択についてはユーザー判断済み（2026-09-19）。全palette・全表示条件の評価完了ではない。
- Adopted outputs: Vivid Aの4色×3 surface表示tokenを通常Markerの暫定標準として本番採用済み。ほかのpaletteは不採用確定せず保持。
- Production impact: [marker-colors.css](../../src/client/marker-colors.css)、[style.css](../../src/client/style.css)、[MarkerCore](../../src/client/MarkerCore.tsx)へ表示を反映済み。保存色ID/Highlight/anchor/DBは変更しない。
- Pending decision: 色覚特性・環境差・Markdown/selection/focus/重なりの未評価範囲と将来Theme要否。TESTINGは部分成果採用と矛盾しない。全体評価完了の判断がないためADOPTEDへ自動変更しない。
- Allowed change scope: 今回は本書Current Stateのみ。再開時は明示依頼の範囲でLab比較画面・専用paletteデータ・テスト/観察。過去の本番採用は追加の本番変更許可ではない。
- Excluded scope: 本番への追加自動適用、DB/Highlight契約、Study、Theme registry/Settings/Custom editor/永続化の無断追加。
- Primary code: [比較画面](../../src/laboratory/MarkerColorSample.tsx)、[palette](../../src/laboratory/marker-color-sample.ts)
- Primary tests: [Color Sample](../../tests/marker-color-sample.test.ts)
- Known limitations: dark referenceは正式dark themeではない。本文「本番採用Phaseで再確認」は全組合せの確認記録がない項目として残す。採用事実を取り消す意味ではない。
- Reproduction notes: [LAB_GUIDE](../../LAB_GUIDE.md)のUI-onlyで比較可。Currentは現在の本番色ではなくVivid A採用前の比較基準。本文「Catalogに4件目」は登録当時の履歴。


## Definition

- ID: `marker-color-sample`
- Title: Marker Color Sample
- Version: 0.1
- Status: TESTING
- Kind: example
- Runnable: yes
- Derived from: none
- Entry: `marker-color-sample`
- Equipment metadata: Marker color IDs、Visual Sample Workspace

目的は、Marker色を本番へ採用する前に、人間が本文・Marker一覧・miniMAP相当の同一条件で比較すること。
「現在より彩度を上げると位置を認識しやすくなるが、高彩度すぎる場合は本文可読性を低下させる」
という仮説を確認する。自動採点はしない。

## Palettes

- Current: Vivid A採用前の本番CSS 4色を比較基準として保持。
- Vivid A: 現在の色相を保ちながら彩度を上げる第一候補。
- Vivid B: 赤をマゼンタ、緑をティール寄りにし、色相差も広げる第二候補。
- Pastel: 長文の穏やかさを優先する参考案。
- High Contrast: 一覧と小点での識別性を優先する参考案。

保存上のIDは全案で `yellow / red / green / blue` のまま。paletteは表示専用で、DB、Highlight、
offset、source_text、MarkerCoreへ入らない。

## Surface intensity

Currentは採用前の本番どおり本文・一覧・miniMAPを同色にした。ほかの案では意味色を維持したまま、
本文を比較的穏やかにし、一覧を強め、miniMAPの小点を最も強くした。各paletteを明るい本文、
暗い参考面、一覧、miniMAP相当で同時表示する。

## Procedure and evaluation

1. Laboratory CatalogでMarker Color Sampleを選ぶ。
2. Runを開き、Current、Vivid A、Vivid B、Pastel、High Contrastを同じ距離・画面輝度で見る。
3. 4色の区別、発見性、本文可読性、長文での騒がしさ、小点の識別、明暗面を評価する。
4. 本番採用は別Phaseで決める。今回のExperimentは色を自動適用しない。

## Decision

- Selected palette: Vivid A
- Decision date: 2026-09-19
- Adoption target: Att-Chat normal Marker
- Decision: Vivid Aをユーザー向けの暫定標準として採用する。
- Reason: CurrentよりMarkerの視認性が高く、Vivid Bより明瞭で、ユーザーがVivid Aの強さを選択した。
- Other palettes retained: Current、Vivid B、Pastel、High Contrastは将来のMarker Theme候補として保持する。REJECTEDにはしない。
- Production files changed: `src/client/marker-colors.css`、`src/client/style.css`、`src/client/MarkerCore.tsx`

Vivid Aは唯一の正解ではなく、今回の通常用途に対する暫定標準である。保存色IDやHighlight recordは
変更せず、既存Markerも再読込時に新しい表示tokenで描画される。

## Future Marker Theme Settings

将来は保存色IDと表示themeを分離し、SettingsでVivid / Pastel / High Contrast / Customを選べる。
Customは4つの意味色を個別指定する。実装する場合もHighlight recordは色IDだけを保持し、
themeは表示設定として扱う。本文・一覧・miniMAPは同じthemeからsurface別tokenを取得できる。

今回はTheme registry、Settings、Custom editor、永続化を作成していない。まず人間評価で必要なpaletteと
surface差を絞り、その後に最小の設定契約を設計する。

## Records and fixtures

Experiment definitionはCatalog正本へ登録した。目視比較なのでExperimentRun JSONや自動scoreは作らない。
palette datasetはExperiment-localであり、新規の汎用fixtureやEquipmentへ昇格させていない。

## Known limitations

- 色覚特性別のシミュレーションや測色は行っていない。
- OS、monitor、browser、輝度によって見え方が変わる。
- dark referenceは比較用で、正式なdark themeではない。
- 実際のMarkdown背景、選択、focus、重なりの全組合せは本番採用Phaseで再確認が必要。

## Validation

- Catalogに4件目として表示し、Overview / Run / Resultsを実ブラウザで確認。
- Runで5 palette、明暗本文、近接4色、Marker一覧、miniMAP小点を目視確認。
- Currentが旧本番4色を保持し、本番のsurface tokenがVivid Aと一致する自動テストを追加。
- palette registryをMarkerCoreから参照せず、Vivid Aの12表示値だけを小さなproduction CSS tokenへ集約。
- 全test: 248件、246 PASS、0 FAIL、2 SKIP（既存の実Embedding任意test）。
- typecheck / build / `git diff --check`: PASS。
- package、DB schema、migration、Study、Generation設定の変更なし。
