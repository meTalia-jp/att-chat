# Marker Quick Action Prototype

## Current State

最新実験: [Context Correction v0.3 — Same / New](context-correction-v03-report.md)（2026-09-30）。v0.2固定fixtureで履歴T1〜T20あり/なし×局所300/800/1500の24 Run Pilotを完了。24 stop、0 error、自動照合・Codex一次評価済み、Human review pending。500/1100は未実行、最適window・引継ぎ量は未決定。

前回実験: [Context Correction v0.2 — Long Source](context-correction-v02-report.md)（2026-09-29）。2650 UTF-16のT20、局所300/800対全文、4 Marker×4条件を実行。15 stop/1 length、一次評価済み、Human review pending。最適windowは未決定。

最新実験追記: [Context Correction v0.1 Report](context-correction-v01-report.md)（2026-09-29）。40 Turn物理fixture、4 Marker×4条件のPreviewとLM Studio初回回答16件を保存。自動照合とCodex一次評価済み、Human review pending。本番Question Keep/Chatへ未接続。今回だけLab専用CLIからモデル生成を行い、既存UIのAI送信禁止境界は維持する。

最新UI追記: Question Box → New Chat Handoff Prototype v0.1（2026-09-30）。「新規チャット」をLab専用Setup／memory-only Previewへ接続。Conversation作成・保存・モデル送信は未接続、末尾参照。

照合日: 2026-09-26。Repositoryのdirty working treeを根拠とする要約。以下のPhase履歴は当時の記録として保持する。実装完了・技術検証・ユーザー評価・本番採用は別の判定。

- Catalog ID: `marker-quick-action-prototype`
- Catalog status: `TESTING`
- Current phase: Question Box Sidebar v0.2 Conversation折りたたみ整理（2026-09-28、末尾参照）。前段: Question Box Sidebar Prototype v0.1（2026-09-28、末尾参照）。前段: Immediate / Deferred二択試験（2026-09-28、末尾参照）。前段: Marker Immediate Ask Composer v0.2（2026-09-28、末尾参照）。前段: Marker Immediate Ask Handoff最小Lab試験（2026-09-27、末尾参照）。既存Catalogを継続し新規Experiment登録なし。前段: External Data Asset対応 / Phase 0.7 Quick Dictionary Prototype v0.1（Catalog version 0.7）。履歴は初期Marker → Detail/Signal比較 → 0.4.1 → Memo 0.5 → Direction Menu 0.6 → Dictionary 0.7。
- Implemented through: implementation complete（0.7範囲）。D2初期表示、左▽Detail・中央4色Marker・右▷Menu。Signalは選択終端寄せ/下側優先、下端で上反転。Menuは通常右、右端で左反転。現在はQuick Memo / Dictionaryの2項目。
- Technical validation: 0.7に自動テスト/typecheck/buildと実pointer drag検証の記録あり。lazy load再利用・古い応答破棄は自動テスト確認で、実ブラウザの取得回数・初回時間は未実測。今回の再検証は自動のみ。
- User evaluation: 未完了。操作方向・距離、D2外観、辞書訳の読みやすさ、Sidebar配分についてuser evaluation pending。0.4.1のUI検証完了とは別。
- Adopted outputs: 本Experimentから本番への採用なし。既採用Vivid A tokenを利用しているだけで、本Experimentによる採用ではない。
- Production impact: Lab内メモリPrototypeのみ。Quick Marker/Memo/Dictionaryを本番Chat/MarkerCore/API/DBへ接続しない。辞書本体は任意のExternal Data Asset。未配置時は配置案内を表示し、他機能は利用可能。配置した場合だけbuildに同梱する。
- Pending decision: 操作とSidebarのユーザー評価、採否判断。TESTING維持。Search/Explain、保存、touch、本番反映は次Phaseの自動承認ではない。
- Allowed change scope: 今回は本書Current Stateのみ。再開時は明示依頼の範囲でLab専用Quick UI/helper/panel/CSS・専用テスト・記録。辞書データ更新は出典/配布条件の確認と別途scopeが必要。
- Excluded scope: 本番Chat、MarkerCore、API/DB/Storage、Study、AI送信、Dictionary/Search/Explainの範囲拡張、Theme framework、Export/自動保存の無断追加。
- Primary code: [Prototype](../../src/laboratory/MarkerQuickActionPrototype.tsx)、[position helper](../../src/laboratory/marker-quick-action.ts)、[Dictionary service](../../src/laboratory/quick-dictionary.ts)、[Memo panel](../../src/laboratory/QuickMemoPanel.tsx)、[Dictionary panel](../../src/laboratory/DictionaryPanel.tsx)
- Primary tests: [Quick Action](../../tests/marker-quick-action.test.ts)、[Dictionary](../../tests/quick-dictionary.test.ts)
- Known limitations: Memoは1選択1 bullet・重複可・memory-only。Dictionaryはtrim後ASCII英字1語の完全一致、初回有効検索でJSON取得、以後メモリ再利用、最新結果1件。Marker/Memoと独立。狭い画面でMenu重なりやSidebar配置変更あり。
- Reproduction notes: [LAB_GUIDE](../../LAB_GUIDE.md)参照。0.4.1基準commitは本文に記録、0.5以降のコード/記録はdirty/未追跡資産を含みHEADだけでは再現不可。辞書本体は意図的な任意配置でありLab起動の必須資産ではない。以下の上側優先・右▽直追加・4疑似項目・6段落は各Phase当時の履歴。現在は7段落、2項目の実処理。


## Purpose

文章選択後に既存のMarker編集欄まで視線と操作を移す代わりに、選択範囲の近くへ4色だけを表示し、
1クリックでMarker化する操作が自然かを確認する。完成機能ではなく、Laboratory内だけのA案Prototypeである。

## Hypothesis

テキスト選択直後に選択位置付近へ4色だけを表示し、1クリックで保存できる方式は、現在のMarker操作より
短い操作で連続Markerを付けやすい可能性がある。

## Implementation

- Assistant回答を想定した日本語6段落を表示する。
- `Selection`と`Range`から段落番号とUTF-16 offset、選択文字列を取得する。
- `Range.getBoundingClientRect()`をviewport座標へ変換し、選択範囲の上へfixed配置する。
- 上に40px＋余白を取れない場合だけ下へ配置し、左右上下を8px内側へclampする。
- scroll / resize中は保存したRangeから位置を再計算する。
- paletteの色buttonは`pointerdown.preventDefault()`でブラウザselectionの消失を防ぎ、click時にメモリ内Markerを作る。
- Vivid Aのproduction CSS tokenを参照する。色値はPrototypeへ複製しない。
- Markerは画面内メモリだけに保存する。Highlight API、DB、MarkerCore、本番Chatは使用・変更しない。

## Close behavior

- 色を選ぶとMarkerを作成して閉じる。
- palette外のpointerdownで閉じる。
- Escapeで閉じる。
- 閉じるだけの場合、本文selectionはブラウザの通常挙動に任せる。

## Observed issues

- 1131px幅の実ブラウザで、文中・画面下部・スクロール後・複数行選択を確認した。paletteは選択範囲の上へ収まり、本文を大きく隠さなかった。
- 4つの25px色点はマウスで押せたが、連続操作やtouchを想定すると28〜32px案との比較余地がある。
- paletteの色を押してもselectionは保存処理まで維持され、yellowの一時Markerを1クリックで作成できた。
- 外側クリックとEscapeはいずれも直ちに閉じた。
- fixed paletteは本文を大きく隠さないが、短いviewportでは上下の余白が少なくなる。
- selectionが複数段落をまたぐ場合、paletteはRange全体の矩形中央ではなく最初の可視矩形に近い上位置が望ましい可能性がある。
- ドラッグの開始・終了位置によって句読点や空白も選択文字列に含まれる。これはブラウザのselectionどおりだが、細かな選択のしやすさは別途評価が必要。
- touch端末のselection handle、ブラウザ標準メニュー、色覚特性は今回の試験範囲外。
- Prototype Markerはreloadで消える。操作比較用なので意図した制限である。

## Next candidates

- paletteを選択範囲の中央ではなく開始端・終了端へ寄せた場合の比較。
- 色点を28〜32pxへ広げた場合の押しやすさ比較。
- paletteに明示的な閉じるbuttonを加える案との比較。
- A案が有望な場合のみ、既存MarkerCoreのdraft/APIへ接続する本番設計を別Phaseで検討する。

## Validation

- Catalog / Overview / Run / Resultsから独立Experimentとして識別できる。
- 自動テストで上・下・左右端clamp、複数段落範囲、selection保持、1クリック作成、外側クリック、Escapeを確認した。
- 実ブラウザで文中、複数行、スクロール後、画面下部の位置とVivid A 4色を確認した。
- PrototypeはHighlight API、DB、MarkerCoreをimportせず、本番ChatのMarker UIを変更していない。

## Phase 2 — Optional Detail Popup (2026-09-19)

### Purpose / hypothesis
Marker作成は色の1クリックで確定し、その後に必要な人だけ参考メモ・Attentionを入力する。
この分離で軽いMarker操作と考える操作を両立できるかを検証する。ユーザー評価は未実施（user evaluation pending）。

### Implementation / interaction flow
選択 → Quick Palette → 色クリックで即時作成 → Detail Popup。
既設Markerクリックも同じDetail表示を使用。参考メモとAttentionは別々の文字列で入力時にメモリへ反映。
色変更は範囲を変えない。削除はそのMarkerと両入力をまとめて除去。
枠外クリック・Escapeは入力済み内容とMarkerを残して閉じる。未入力も許可。
新規選択とDetailは排他的に表示し、ドラッグでselectionがある間はMarkerのclick編集を開かない。

### Exclusivity rule
段落番号・UTF-16 offsetの順序で半開区間を比較する。
部分重複・包含・逆包含・完全一致を選択時と作成時に拒否。隣接は許可。
本番Highlight型・API・DBへの接続はない。従来同様reloadで消える。

### Popup position
Quickは従来どおり上優先。Detailは実測サイズを使って下優先、下の空間が足りなければ上。
viewport端から8px内側にclampし、狭い画面では幅を縮め、低い画面では内部scroll。
scroll/resizeでも既設Markerの現在DOMから再配置する。

### Observed issues / evidence
実ブラウザで選択、色クリック、直後Detail、未入力の枠外閉じ、Marker保持、既設クリック、
参考メモとAttention入力、redへの変更、Escape、再表示で値保持、重複rejectを確認。
通常viewportでPopupの見切れなし。Detailは後続本文の数行を隠すので操作感のユーザー評価が必要。
隣接・削除・下端反転・左右clampは自動テストで確認。実ブラウザでの隣接の厳密な境界指定、
削除、狭いviewportの実操作は未確認として残す。
複数段落MarkerのDetail位置は先頭の描画断片を基準とする。
touch、ブラウザ標準selectionメニュー、モバイルキーボードは未検証。

### Next candidates
Detailの幅・高さを小さくした場合、作成後の自動Popupを遅らせた場合を今後比較候補とする。
今回は追加案を実装しない。ユーザーによる「Markerだけ付けたい時の邪魔さ」の評価を優先する。

### Phase 2 validation results
- npm test: 253件、251 PASS、0 FAIL、2 SKIP（既存任意Embedding）。
- typecheck / build / git diff --check: PASS。
- Catalog、Color Sample、Simple Marker Chatを含む既存回帰PASS。
- src/client・src/server・packageの差分なし。本番MarkerCore・Highlight API・DB schema・migrationは未変更。
- commit / push / tag未実施。

## Phase 2.1 — Unified Signal Popup (2026-09-19)

### Purpose / hypothesis
Quick PaletteとDetail Popupを別部品に見せず、小型Signal Headerがそのまま下へ展開したように見せる。
通常はMarkerより下へ置き、読み終えた上側の本文を隠しにくくする。参考メモとAttentionは初期状態を小さく保ち、
入力時だけ自然に広げることで、考える操作に必要な空間と本文の見通しを両立できるか確認する。

### Implementation
- CompactとExpandedは同じ`SignalHeader`と同じVivid A CSS tokenを使う。
- Compactは164 × 44px。Expandedは最大320px幅で、同じHeaderの下へ白いDetail bodyを接続する。
- Marker作成時・既設Marker編集時とも、選択色を白いringで示す。
- Quick / Detailとも下側を優先し、現在DOMの実測高で下端に収まらない場合だけ上へ反転する。
- 左右上下はviewportから8px内側へclampする。scroll / resize / textareaの高さ変更時に位置を再計算する。
- 参考メモは2行相当（56px）から最大160px、Attentionは3行相当（76px）から最大181pxまでauto-growする。
- 高さ計算はPrototype内の小さなhelperだけで行い、最大を超えたtextareaだけ内部scrollに切り替える。
- Marker作成・編集・削除、枠外click、Escape、重複拒否、隣接許可のPhase 2契約は変更しない。

### Observed issues / user evaluation pending
一体感、横幅、下基準配置、auto-growの落ち着き、Popupが本文を覆う量はユーザー評価待ち。
長い入力ではtextarea自体は上限で止まるが、2欄を同時に最大化するとPopup全体の内部scrollも発生する。
モバイルのソフトウェアキーボード表示中に利用可能viewportが変わる挙動は今回の対象外とする。

### Next candidates
ユーザー評価後に、Header幅、Expanded幅、各textareaの上限行数、作成直後にDetailを開くかを一項目ずつ比較する。
本番反映、汎用Floating UI化、Marker保存契約との接続はこのPhaseでは行わない。

### Phase 2.1 validation results
- 実ブラウザで選択直後の下側Compact、色クリック後の一体型Expanded、選択色ringを確認。
- Memo 4行、Attention 10行を入力し、自然な拡張と最大高以降の内部scrollを確認。短文へ戻すと初期高へ縮小した。
- 高さ300pxのviewportで下端選択を行い、Signal Paletteが上側へ反転してviewport内に収まることを確認。
- Escape、枠外click、既設Markerからの同一Detail再表示、入力値保持を実ブラウザで確認。
- 削除・重複拒否・隣接許可は自動テストで確認。ブラウザUIからの削除は保存済みPrototypeデータを消す操作なので自動テスト結果を採用した。
- npm test: 254件、252 PASS、0 FAIL、2 SKIP（既存任意Embedding）。typecheck / build / git diff --check: PASS。
- 本番Chat、MarkerCore、Highlight API、DB、migration、packageに差分なし。commit / push / tag未実施。

## UI Comparison v0.1 — Variant A / B / C / D (2026-09-20)

### Purpose / hypothesis
Phase 2.1の操作仕様を固定したまま、Compact SignalとExpanded Detailの外観だけを比較する。
黒い筐体を軽くし、同じHeaderが下へ展開する一体感を維持すると、本番Chatへ馴染む候補を判断しやすくなると仮定する。

### Common behavior
選択、1クリック作成、Detail表示、Memo / Attention、auto-grow、色変更、削除、既設Marker再編集、
枠外click、Escape、下側優先、上側反転、viewport clamp、重複拒否、隣接許可は全案で同じ実装を使う。
variant切替はCSS classと寸法定義だけを変更し、Markerデータは維持する。

### Variants
- **A: Light Controller** — 白〜薄灰、細い境界、弱い影。Vivid Aの色点を主役にする実用品案。
- **B: Soft Dark Header** — 軽い濃紺Headerと白いDetail。Phase 2.1の信号機感を残して黒の重さを下げる案。
- **C: Outline Signal** — 白背景と輪郭中心、影をほぼ除いた最小ノイズ案。
- **D: Compact Industrial** — グレーの筐体、角丸控えめ、薄いinsetを持つ治具風案。

### Input size
全案共通で、参考メモは3行相当の72pxから最大176px、Attentionは4行相当の94pxから最大202pxへ広げる。
内容削除時は初期高まで縮み、最大高以降はtextarea内部scrollを使う。

### Evaluation pending
比較結果はユーザー判断待ち。評価対象はCompact単体の完成度、下方向への一体感、入力欄の圧迫感、
削除操作の自然さ、長文入力時の本文遮蔽量とする。今回の結果を本番へ反映せず、Theme frameworkも作らない。

### Browser observations
- Aは白い本文領域との連続性が高く、Vivid Aの色点が最も主役になる。現時点の暫定有望案。
- Bは信号機としての認識が最も速く、旧黒枠より軽いが、A/CよりHeaderの存在感が強い。
- CはUIノイズが最少。Compact / Expandedの境界も最も薄いため、浮遊部品としての発見性は追加評価が必要。
- Dは治具として分かりやすく押しやすい。通常Chatへ馴染むかは好みが分かれる可能性がある。
- Memo 6行とAttention 12行でauto-growと上限後の内部scrollを確認。短文へ戻すと3行 / 4行相当へ縮小した。
- 枠外click、既設Marker再編集、Escapeを実ブラウザで確認。操作ロジックはvariant間で共通だった。

## Phase 0.4 — Left / Color / Quick Signal (2026-09-20)

### UI structure
Signal Headerを`▽  ● ● ● ●  ▽`へ統一する。左はPersistentなMarker Detail、中央はMarker Color、
右はその場限りのQuick / Context Tool入口である。新規選択と既設Markerで同じHeaderを使う。

### Marker shortest-path hypothesis
Marker作成を「選択 → 色クリック」で完了させ、色クリック後にDetailを自動展開しない。
保存系操作を左、Quick系操作を右へ分離すると、最頻出のMarker操作を妨げず追加機能へアクセスできる可能性がある。
作成後は現在色のringと左右▽を持つCompact Signalを残し、枠外clickや次の選択で閉じられる。

### Left / center / right semantics
- **LEFT**: 参考メモ、Attention、Marker削除。未Marker選択では位置を保ったdisabled表示。
- **CENTER**: yellow / red / green / blue。未Markerでは作成、既設Markerでは現在色ringと色変更。
- **RIGHT**: Markerの有無に関係なくQuick Tool仮パネルを開く。

### Quick Tool placeholder
Signal Headerを残したまま下へ`Quick Tool / Quick Memo / Coming next`を接続する。
Quick Memo保存、Dictionary、Search、Tool切替は実装しない。

### A / D2 appearance comparison
- **A: Light**: 白〜薄灰、細いborder、弱いshadow。Vivid Aの色点を主役にする。
- **D2: Soft Gray**: Aと同寸法・同構造。薄いグレー筐体と控えめなborderで、旧DのIndustrial感を弱める。

旧A/B/C/D比較は本書のv0.3記録として保持する。UI上の評価対象だけをA / D2へ絞る。
最終採用、左右意味の妥当性、Quick入口の自然さはユーザー評価待ちである。

### Phase 0.4 browser observations
- A / D2の両方で`▽ ● ● ● ● ▽`が同じ寸法・順序で表示され、外観だけが切り替わることを確認した。
- 未Marker選択では左▽がdisabled、右▽がenabledで、右▽からQuick Tool仮パネルを開閉できた。
- 色クリックでMarkerが作成され、Detailを自動展開せずCompact Signalが残り、現在色のringと有効化された左▽を確認した。
- 左▽から参考メモ / Attention / Marker削除、右▽からQuick Tool / Quick Memo / Coming nextへ分岐した。
- Memoは4行入力で100px、Attentionは9行入力で上限202pxと内部scrollへ移行し、短文へ戻すと100pxへ縮小した。
- Escapeと枠外clickで閉じ、既設Markerクリックから同じCompact Signalを再表示できた。
- 選択近傍への下側配置とviewport内clampを実画面で確認した。下端反転・左右端clampは自動テストでも固定した。
- 削除はPrototypeデータを消すためブラウザでは実行せず、自動テストで確認した。

ユーザーによる最終評価は、左▽の意味が直感的か、右▽がQuick入口として見つけやすいか、
AとD2のどちらが通常Chatへ馴染むか、色クリック後にCompactを残す挙動が読解を妨げないかを対象とする。

## Phase 0.4.1 — Signal arrow balance (2026-09-20)

D2: Soft Grayを初期比較対象とし、左右▽の意味・位置・操作は変更せず視覚バランスだけを調整した。
▽の表示は15px、buttonのhit areaは30 × 30pxとし、中央26pxの4色より弱く見せながら押しやすさを維持する。
左右は同一classを使い、通常・hover・active・disabledの濃淡だけで状態を表す。disabledでもhit areaは縮めない。
D2のHeader背景は`#e9ecef`から`#eef0f2`へわずかに明るくし、Aとの差はborderと筐体色で維持する。
Quick Memo、MarkerCore、本番Chat、API、DBへの機能変更は行わない。

### Phase 0.4.1 validation results (2026-09-24)
- Codex内実ブラウザ（viewport 1144 × 910）でD2のCompact、Marker作成後、左Detail展開を確認した。
- 修正前のCompactは実測216 × 44px。内部列164px + gap 40px + 横padding 20px + border 2px = 226pxで、内容が指定paddingへ食い込んでいた。ボタン自体の枠外はみ出しは再現せず、左右の実余白は各6pxだった。
- 横paddingだけ10pxから5pxへ変更。合計216pxとなり、実測位置・外観を維持したまま寸法の不整合を解消した。Compact幅216px、gap 8px、ボタンサイズは変更していない。
- 左右▽は実測font-size 15px、hit area 30 × 30px。無効・有効・展開状態を確認し、26pxの色点と対称に配置され、視覚バランスに問題は見られなかった。
- D2背景は実測rgb(238, 240, 242)（#eef0f2）。白い本文と区別でき、色点を邪魔する重さは感じられなかったため変更しなかった。この外観判断は今回の確認環境での目視評価である。
- 選択直後の下側Compact、色クリック後のCompact維持、左▽からのDetail展開を確認。今回の位置ではDetailは下側に収まらず上へ反転した。
- 試験本文の古い「最初の行の上付近」を、下側優先・収まらない場合は上へ反転する説明へ更新し、実画面にも反映されたことを確認した。
- npm run typecheck / npm run build: PASS。Quick Action 6件とLaboratory関連4件の計10件: PASS、FAIL/SKIPなし。
- UI確認はVite単独起動で実施。Laboratoryの記録API未起動による読込エラー表示はあったが、メモリ内Prototypeの確認には影響しなかった。
- Phase 0.4.1のUI仕上げ確認は完了扱いとする。モバイル・touchの評価や最終採用判断は含まない。機能追加、Quick Memo実装、本番Chat反映、Studyファイル変更、commit / push / tagは行っていない。

## Quick Memo Prototype v0.1 — 継続Phase 0.5 (2026-09-24)

### Purpose
気になった箇所を、思考を止めずに一時的に拾っておくメモ帳を検証する。
Attentionの「考える・AIに聞く」とは分離し、Quick Memoは「今は深掘りせず、あとで見る断片」を保持する。
既存のSignal、選択処理、Marker回帰を共通に評価するため、独立Experimentは増やさず同じExperimentの継続Phaseとした。
Phase 0.4.1の完了基準点はcommit `74aae1e5a55047cc41bf1d2af73e911c878d799d`。

### Hypothesis / user evaluation pending
選択した文字列を右▽から1操作で右Sidebarへbullet追加できれば、読書の流れを止めずに「あとで見る断片」を収集できる可能性がある。
追加の速さ、Marker操作との混同、Sidebarへ出る自然さ、読書への影響、幅とbulletの読みやすさはユーザー評価待ち。
実装・動作確認の完了は採用判断を意味しない。

### Interaction flow
- 未Marker本文をドラッグ → 右▽ → 選択文字列を1項目追加 → Sidebarへ即時反映 → Signalとブラウザselectionを閉じる。
- 色クリックは従来どおりMarkerだけを作成し、Quick Memoは増やさない。Detailは左▽から開く。
- 既設Markerクリック → 右▽では、そのMarkerの`selected_text`を追加する。Markerの範囲・色・参考メモ・Attentionは変更しない。
- 同一文字列の重複は許可する。長文・複数行・複数段落も1回の選択を1 bulletにまとめ、選択文字列をそのまま保持する。
- 既存Markerと重なるドラッグ選択でもQuick Memoは追加できる。色ボタンだけを無効化し、作成時の重複拒否も維持する。
- 確認Popup、Quick Tool仮パネル、AI送信はない。追加操作の名称とtooltipを「Quick Memoへ追加」に更新した。

### Data shape
`QuickMemoItem = { id: string; text: string; turnId?: string; createdAt?: string }`。
idはUUID、createdAtはISO時刻。6段落を1つのAssistant fixture Turnとして扱い、
turnIdは`quick-action-fixture-assistant-1`を保持する。本番のTurn IDではなく、Turn番号表示・Jumpはない。
Markerと別のReact state配列に追加順で保持する。ReloadやExperimentを離れて再マウントすると消える。
DB、API、Storageへの保存は行わない。

### Sidebar behavior / display
- 独立した`QuickMemoPanel`を本文の右へ配置。0件でも空状態を表示する。
- 通常幅320px。850px以下は300px、1100px以下ではCatalogを上へ移して本文幅を確保する。
- 620px以下は幅を優先し、Memo Panelを本文上側へ配置する。複数パネル管理・折りたたみはない。
- 白〜薄灰の背景と細い境界。D2 Signalの背景・寸法・15pxの▽・30px hit areaは維持する。
- Panelをsticky配置し、その位置からviewport下端までの高さに収める。項目領域だけ縦scrollし、追加時は内部を末尾へ移動する。
- `ul / li`でbullet表示し、長文を折り返す。テキストとして描画するためMarkdown記号やHTMLは解釈しない。
- Memo本文を通常のドラッグで選択できる。Copy All、Export、Download、編集、項目削除は実装していない。

### Browser observations / observed issues
- Codex内実ブラウザ、viewport 1144 × 910で未Marker本文から追加し、Markerが0件のまま、Signalとselectionが閉じることを確認。
- 異なる選択を3件続けて追加し、選択文字列とbullet内容が追加順どおり一致した。103文字の複数行選択も1件だった。
- 高さ調整後に173文字の複数段落選択を1件追加し、同じ選択の重複追加も確認した。
- 色クリックでyellow Markerを作成してもMemo数は増えなかった。左▽から参考メモ・Attentionを入力し、Escapeで閉じた。
- 既設Markerから右▽でsource textを追加してもMarkerは1件のまま残り、Detailを再表示すると両入力も保持されていた。
- Detailの枠外click閉じ、Memo本文の通常選択（Signalは開かない）を確認した。
- Sidebarは実測320px。項目領域はclientHeight 443px / scrollHeight 661pxとなり、内部scrollTopを218pxから0pxへ戻しても本文側のscrollYは184pxのままだった。
- 820 × 910でもSidebar 300px、本文395pxで横並びを確認。ページの横はみ出しはなかった。確認後viewport overrideは解除した。
- 初期実装ではPanelの開始位置を考慮せず、最新項目がviewport下へ隠れた。実位置から高さを計算する方式へ修正し、最新項目が内部scrollで見えることを確認した。
- 320pxのSidebarで本文は以前より狭くなる。長文bulletは縦方向の面積を取り、追加時の末尾への移動は先頭項目を読み返している場合には評価が必要。
- 右▽の形だけでは「追加」を予測しにくい可能性がある。今回は操作説明とtooltipで補助し、アイコン変更や確認段階は加えていない。
- Vite単独起動のためLaboratory記録APIの読込エラーが表示されたが、メモリ内Prototypeの確認には影響しなかった。モバイルtouchは未検証。

### Validation
- `npm test`: 254件、252 PASS、0 FAIL、2 SKIP（既存任意Embedding）。
- `npm run typecheck` / `npm run build` / `git diff --check`: PASS。
- Quick Actionの対象テストで空状態、追加順、重複、複数段落、selection終了、既設Markerからの追加、Marker編集内容の保持、重複Marker拒否とMemo追加の独立性を確認。
- 全テストにLaboratory、Marker Color Sample、Simple Marker Chatの既存回帰を含む。
- 本番Chat、MarkerCore、DB schema、Storage、Studyファイルは変更しない。commit / push / tagは実施しない。

### Next candidates
ユーザー評価後にSidebar幅、長文bulletの扱い、追加直後の自動scrollの好みを優先して調整する。
機能を拡張する場合は、一時メモの寿命・削除と保存先を先に決め、その後に実Turn参照やCopy / Exportを別Phaseとして設計する。

## Quick Direction Menu — 継続Phase 0.6 (2026-09-25)

### Purpose
「ドラッグ終端 → 右向き操作 → 右Quick Menu → 右側結果」という操作導線、位置、視線・ポインタ移動だけを評価する。
Quick Memo v0.1の保持・Sidebar契約を利用し、Dictionary / Search / Explainの実機能は追加しない。

### Hypothesis / user evaluation pending
Quick系操作を右方向へ統一し、ドラッグ終端近くに右向き入口を配置すると、選択後のポインタ移動が短くなり、Quick Toolへの操作方向を学習しやすくなる可能性がある。
終端からの自然な手の動き、▷の意味、右Menuから右Sidebarへの一貫性、本文の遮蔽、Signalの視覚バランスはユーザー評価待ち。採用判断は行わない。

### Signal position rule
- 構造を`▽ ● ● ● ● ▷`へ変更。左▽は従来のMarker Detail、右▷はQuick Menuの開閉。
- Compactは216 × 44pxを維持。通常の左→右選択ではRangeの最後の有効な描画矩形を使い、その右端より12px右に右▷の中心を合わせる。
- 複数行・複数段落も最後の描画行を基準とする。描画矩形がない場合はRange全体の矩形へfallbackする。
- 既設MarkerのCompactも最後の描画断片を基準にする。Detailは従来の先頭断片・下優先の配置を維持する。
- 既存`palettePosition`の上下判定・8px viewport clampを使い、Compactの水平位置だけ終端基準へ変更する。scroll / resize時にも現在DOMで再計算する。
- 右→左ドラッグのfocus側追従は今回の対象外。論理的な選択終端側へ配置する。

### Signal vertical alignment
44pxのHeaderに上下8pxのpaddingと30px buttonを入れると内部行の高さが不足するため、上下paddingを0、grid行を`1fr`へ変更した。
`align-items:center`、buttonの`min-height:0`と`box-sizing:border-box`で中央配置し、旧`top:-2px`補正を除去した。
▽ / ▷は15px、line-height 1、padding 0、30 × 30px hit areaを維持。色点も26 × 26pxを維持した。
外枠・背景・左右gapと横paddingは変更していない。

### Right Quick Menu behavior
- 右▷クリックでSignalの右に8px空け、164px幅のMenuを表示する。通常はSignalとMenuの上端を揃える。
- `Quick Memo / Dictionary / Search / Explain`の4つのbuttonを持つ独立したgroup。画面の説明で全項目が同じMemo追加の操作試験であることを明示する。
- 全項目が同じ`addQuickMemo`を呼び出し、選択文字列または既設Markerの`selected_text`を1件追加する。
- 項目クリックでMenu / Signal / browser selectionを閉じる。Menuを開いただけでは追加しない。右▷の再クリックはMenuだけを閉じる。
- Menu内pointerdownも外側クリック判定から除外し、selectionを維持する。Escape / 枠外clickは追加せずSignalとMenuを閉じる。
- 左Detailと右Menuは排他表示。Menuの項目選択状態は保存しない。
- Quick Memo Panelは空状態の案内文だけを新操作へ更新。幅、scroll、bullet、重複許可、memory-only、データ型・保存処理は変更していない。

### Fallback反転条件
- Signal下側に高さ44px＋上下余白が収まらなければ上へ反転し、viewport内8pxへclampする。
- `Signal.right + 8px + Menu.width > viewport.width - 8px`のときだけMenuを左へ反転する。
- Menuの実測サイズを使い上下左右を8px内側へclampする。左右とも足りない極端に狭いviewportでは、画面内へ収めることを優先するためSignalと重なる場合がある。

### Browser observations
- Codex内実ブラウザ、通常viewport 1280 × 720で左→右ドラッグを確認。
- 選択終端中心(681.45, 575.75)から右▷中心(693.45, 616.25)まで横12px・縦40.5px、直線距離約42.2px。終端から近い右下へ移動できた。
- 通常時のMenuはSignalの8px右、両上端270.25pxで表示され、横方向へ移動して項目へ到達できた。scroll中も位置が追従した。
- Header実測216 × 44px。6つのbutton中心とHeader縦中心の差はすべて0px。左右30px、色点26pxを維持し、目視でも列が中央に収まった。
- Quick Memo / Dictionary / Search / Explainを実際に順番に選択し、Memoが1→2→3→4件へ増えた。Markerは0件で、各追加後にSignal・Menu・selectionが閉じた。
- 色クリックでyellow Markerだけを作成しMemoは4件のまま。左▽Detailの参考メモ・Attention入力とEscapeを確認した。
- 既設Markerから右▷→Explainでsource textを5件目へ追加し、Markerは保持された。編集内容の保持と削除の独立性は自動回帰でも確認した。
- 右端fallbackは620 × 720で確認。Signal左322.33px、Menu右314.33pxで間隔8px、Menuは左展開。Menu下端712pxでviewport下余白8pxを維持した。
- 選択範囲を下端へ移動すると選択上端668.16pxに対しSignal下端660.16pxとなり、上へ反転して8px空いた。
- Menu表示中のEscapeでSignalとMenuが閉じることを確認。枠外click、Menu内pointerdown、全項目の追加、Marker編集回帰も自動テストで確認した。
- 試験用viewport overrideは解除した。Vite単独起動に伴うLab記録APIエラーは表示されたが、このメモリ内Prototypeの操作には影響しなかった。

### Observed issues / evaluation notes
- 通常時は近い右下の▷から右Menuへ進めるが、Memo直接追加より1クリック増える。操作の自然さ・速さの優劣は人間の評価が必要。
- 下側のMenuは後続本文を一部覆う。下端clampではMenu上端がSignal上端と揃わず、項目ごとの移動に縦方向も必要になる。
- 右端での左反転は安全に画面へ収められる一方、「右右右」の一貫性は弱くなる。狭い画面のSidebar配置は前Phaseのままなので右側結果の評価は通常のdesktop幅を基本とする。
- button中心の実測一致は確認できたが、glyphの見え方はフォント・表示倍率でも変わる。縦位置の最終的な好みはユーザー評価待ち。

### Validation
- `npm test`: 256件、254 PASS、0 FAIL、2 SKIP（既存任意Embedding）。Quick Action / Quick Memo / Laboratory / Marker Color Sample / Simple Marker Chatの回帰を含む。
- `npm run typecheck` / `npm run build` / `git diff --check`: PASS。
- 位置helperに終端整列、左右clamp、上反転、Menu右展開・左反転・上下clampのテストを追加。UI回帰では全疑似項目、Menu内クリック、Escapeと枠外clickを確認。
- 本番Chat、DB、MarkerCore、Studyは未変更。commit / push / tagは実施しない。

## Phase 0.7 — Quick Dictionary Prototype v0.1（2026-09-25）

### Purpose
Marker Quick Action / Quick Memo / Quick Direction Menuの継続Phaseとして、選択した英単語1語を右▷→Dictionaryで調べ、右Sidebarへ一般的な日本語訳を表示する。Lab内だけで実装し、本番Chat・DB・MarkerCore・Studyには反映しない。

### Hypothesis
読書中の英単語を既存の右向き操作で調べ、Memoと同じ右列へ結果を表示すれば、画面や入力欄を切り替えずに読書を継続できる可能性がある。採用判断は行わない。

### Dictionary source
- ユーザー配置済みの `public/dictionaries/ejdict-hand/ejdict.json`、`README.md`、`SOURCE.json` を利用し、内容は変更していない。
- EJDict-hand、47,010項目、JSON 5,009,560 bytes。
- SHA-256: `74bf048fddee2d5bad426f81cc2c10374ae7d8007d7f8550bf42d86c61614e2b`。
- SOURCE.jsonの取得日: 2026-09-25。配布元: https://kujirahand.com/web-tools/EJDictFreeDL.php 、保守元: https://github.com/kujirahand/EJDict 。同梱READMEはPublic Domain / CC0と記載。
- Viteのpublic静的配信を利用し、build時に3ファイルをdistへ同梱する。build後のJSONハッシュ一致を確認。外部辞書サイトへの実行時アクセスはない。

### Input rule / interaction flow
- trim後にASCII英字 `[A-Za-z]+` のみ許可し、その後小文字へ正規化。日本語、内部空白・改行、数字、句読点、ハイフン、アポストロフィ、全角英字などは対象外。
- 活用形変換・曖昧検索・部分一致は行わない。大小文字が同一になる辞書見出しは訳文を失わないよう統合する。
- MenuはQuick MemoとDictionaryの2項目。Search / Explainを削除。Quick Memoの追加処理とDictionary検索を明確に分離。
- ドラッグ→右▷→Dictionaryで選択文字列を確保してSignal / Menu / browser selectionを閉じ、右Sidebarへ結果を表示。既設Markerではselected_textを利用し、MarkerやMemoは増減・変更しない。

### Service / lazy-load behavior
- `quick-dictionary.ts`のDictionaryService.lookupをUIとの境界とし、JSON構造をService内部に閉じ込めた。結果はword / meaning / source / status。
- 初回の有効な検索時だけローカルJSONをfetchし、Mapをメモリ内に保持。同時検索は同じ読み込みPromiseを共有し、2回目以降は再取得しない。対象外入力では取得しない。
- 読み込み失敗時はキャッシュを解除し、次の有効な操作で再試行可能。
- UIごとの要求番号で最新結果だけを採用し、古い応答とunmount後の応答を破棄。辞書キャッシュと表示結果の寿命は独立。
- npm依存、API、DB schema、Storage、保存処理は追加していない。

### Result states / source attribution
- found: 正規化した見出し語と辞書記載の訳文をプレーンテキスト表示。
- not-found: 「見つかりませんでした」。
- invalid: 「英単語を1語選択してください」。
- unavailable: 「辞書を読み込めませんでした」。
- loading: 「辞書を読み込んでいます…」。
- 最新1件のみ表示して次回検索で置換。履歴・AI処理なし。通常の薄灰Panelと穏やかなstatus表示を使用し、警告色は使わない。
- Panel下部に控えめな `Source: EJDict-hand` と保守元リンクを常時表示。原文のライセンスと取得元情報はpublic配下に保持し配布物にも含める。

### Sidebar behavior
- 既存320px（中間幅300px）の右列に共通のsticky枠を置き、Dictionaryを上、Quick Memoを下に配置。Dictionaryは最初の検索から表示する。
- 長い訳文はDictionary内部でscroll。Quick Memoは配列構造、bullet、重複許可、memory-only、追加時の末尾scrollを保持。
- Memoの利用可能高さはDictionary表示変更時も再計測するが、Dictionary検索によってMemoのscrollTopを末尾へ戻す処理は実行しない。

### Browser observations
- Codex内実ブラウザ、1280×720。DOM Rangeは文字の座標読み取りだけに使用し、選択操作は実際のpointer dragで実施した。
- experiment / EXPERIMENT / 前後空白付きexperimentは「実験、試み」を含む実辞書訳を表示。qzxqzxunknownは未収録、日本語 / two words / test123 / experiment, は対象外文言になった。
- 上記の連続検索後もMemo 0件・Marker 0件。検索ごとにSignal / Menuが閉じ、selectionは空になった。
- Dictionary→Quick Memo→Dictionaryでそれぞれの表示が独立。長い段落のMemoを重複追加し計9件を保持した。
- Sidebar実測幅320px。Memo一覧のclientHeight約259px / scrollHeight1005px、追加後scrollTop746pxで末尾へ移動。ホイールで26pxまで戻し、本文scrollY432pxは変化しなかった。
- yellow Marker作成、左▽Detail、Escape、既設Marker→右▷→Dictionaryを確認。Marker 1件・Memo 9件を保持し、Memo scrollTopも26pxのままだった。
- Menu表示中のEscape / 枠外クリックで追加なしに閉じることを確認。
- 初回のみの取得、2回目以降の再利用、同時ロード共有、遅い旧結果の破棄、読込失敗・再試行は自動テストで確認。ブラウザの通信回数や初回所要時間は実測していない。

### Observed issues
- 訳文は辞書原文のため、品詞・用法記号や複数の意味が含まれる。文脈に合わせた意味の絞り込みはしない。
- Dictionary表示分だけMemoの可視領域が小さくなる。内部scrollと手動位置保持は確認したが、読みやすさ・Panel配分はユーザー評価が必要。
- Run画面の先頭では本文開始位置が低いため、初回結果の下部やMemoが画面下へ続く場合がある。本文へスクロールした読書位置では両Panelを同時確認できた。
- Vite単独起動では既存Lab記録APIの接続エラーが上部に表示される。今回のローカル辞書・Memo操作とは独立しており、本Phaseでは変更しない。

### Validation / user evaluation pending
- `npm test`: 260件、258 PASS、0 FAIL、2 SKIP（既存の任意Embedding）。Quick Action / Quick Memo / Laboratory / Marker Color Sample / Simple Marker Chat回帰を含む。
- `npm run typecheck` / `npm run build` / `git diff --check`: PASS。
- Dictionary単体テスト、UI表示・分岐・失敗時文言の回帰、実辞書experimentのsmoke testを追加。Laboratory UIテストは辞書試験段落の追加に合わせて更新した。
- 操作の自然さ、辞書内容の読みやすさ、右Sidebarの配分についてuser evaluation pending。自動採用はしない。
- 本番Chat / DB / MarkerCore / Studyは変更せず、commit / push / tagは行わない。

## External Data Asset対応（2026-09-26）

### Purpose / decision
EJDict-hand本体をRepository必須資産から任意配置のExternal Data Assetへ変更する。辞書なしでもLab起動・Memo・Marker・他Experimentを利用できるようにする。本体JSONだけをignoreし、出典README/SOURCE.jsonは管理候補として保持する。

### Placement / behavior
配置先は `public/dictionaries/ejdict-hand/ejdict.json`。[配置手順・取得元](../../public/dictionaries/ejdict-hand/README.md)と[SOURCE.json](../../public/dictionaries/ejdict-hand/SOURCE.json)に基準サイズ5,009,560 bytes、SHA-256を記録した。自動取得・外部サイトへのruntimeアクセスなし。
初回有効検索で同じローカルURLをlazy loadする。未配置/HTTP失敗/通信失敗/HTML fallbackは `missing-asset` として穏やかな配置案内を表示する。物理的な欠落と一時的な通信失敗は断定せず案内内で区別する。不正JSON/不正辞書構造は従来の `unavailable`。失敗cacheは解除して次回検索で再試行する。
成功cache、入力制限、最新結果だけの反映、Memo/Marker独立性は維持する。Source表示と取得元リンクは案内に残す。

### Test / reproduction policy
通常service/UIテストは小さな辞書fixtureを使う。配置情報テストは常時実行、実EJDict smoke testは配置時だけ実行する。JSONなしのfresh checkoutは通常利用可能で、Dictionary利用には任意配置が必要。辞書の版を比較する場合はSOURCEの基準hashを確認する。
過去Phaseの「3ファイル同梱」は当時の記録。現在はREADME/SOURCEのみ必須、JSONは配置されている場合だけbuildに含まれる。

### User evaluation pending
未配置案内の分かりやすさはユーザー評価待ち。機能の本番採用判断ではない。

### External asset validation
- 辞書ありのworking treeで npm test / typecheck / build / git diff --check: PASS。実辞書のexperiment検索smokeも実行。
- 辞書JSONをコピーしない隔離workspace（既存node_modulesを共有）で npm test: 263件、260 PASS、0 FAIL、3 SKIP。SKIPは既存任意Embedding 2件と未配置辞書smoke 1件。typecheck / buildもPASS。
- 同じ未配置workspaceのbuildを専用Labサーバーで配信し、入口HTTP 200と実HTTP経由のDictionary missing-assetを確認。終了後サーバーを停止。
- UIテストで配置案内とpathを確認し、既存Quick Memo/Marker/Signal/Menu・他Labの回帰もPASS。実ブラウザでの追加目視確認は今回行っていない。
- 元の辞書を移動・削除せず、JSONのみignore対象であることを確認。README/SOURCEは除外しない。実行時のハッシュ強制検査や自動downloadは追加していない。


## Marker Immediate Ask Handoff — 最小Lab試験（2026-09-27）

### Purpose / Marker as active reference
Markerを質問対象の座標として保持し、Detailから通常Chat入力欄相当へ短い質問を渡せるか確認する。既存Quick Action Experimentの継続。React memory-onlyのpreparationとactiveReferenceを分離し、markerId / turnId / turnNumber / sourceTextを保持する。本番Chat・MarkerCore・API・DB・Keep・ContextBuilderへ接続しない。

### Immediate Ask flow / Visible intent prefixes / Short input behavior
「質問受け渡しfixtureを準備（T10 / T25）」で同じ「月がきれいですね」を持つ2つの既設Markerを用意する。Marker → 左▽ → すぐ質問 → 1行入力 → 明示的な「入力欄へ」で転送。質問・しかし…・意見はそれぞれ「質問です。 」「ただ、疑問が残ります。 」「私の考えでは、」を入力末尾へ挿入し、通常の文字として編集可能。参考メモ・Attention・色変更・削除は保持。Detailが高くなった場合は内部scrollする。

### Draft handoff / Reference indicator / Reference clear behavior
確定でDetailとbrowser selectionを閉じ、Lab Chat draftへfocusする。表示は「T10 のMarkerを参照中」等のみで内部IDを出さない。×は参照だけ解除し本文を保持。Escape・外クリックは準備を破棄し転送しない。送信ボタン・モデル呼出しは実装していない。転送済み参照のMarkerを削除した場合も参照だけ解除して本文を保持する。

### Existing draft behavior / Multiple Marker behavior
既存draftがあれば改行を挟んで追記する暫定仕様。空の準備を確定した場合も既存本文は保持し参照だけ設定できる。Bを準備している間は確定済みA参照を保持し、Bの確定時だけ置換。引用文字列比較でMarkerを決めない。元の7段落は既存単一Turn fixture（T1）として扱い、追加2段落はT10/T25。汎用handoff framework・Equipmentではない。

### Browser observations / Observed issues
実ブラウザでT10 → 質問prefix →「質問です。なぜですか？」→ 転送とT10表示を確認。本文追記後の×で本文が残り、同じ本文のT25から確定すると既存文章に追記してT25表示へ切り替わった。T10を再準備してEscapeした場合はT25参照・draftとも保持された。操作はブラウザのキーボード操作と入力APIで確認し、マウスdragの再検証は行っていない。外クリック未転送、3prefix、Marker編集・削除とQuick Memo/Dictionary回帰は自動testでも確認。

入力fixtureは本文末尾にあるため転送時に視点が移動する。追記文は過去Marker向けの質問も含み得る一方、active referenceは最新1件だけであり、混乱しないかは人間評価が必要。既存Attention欄を残しているためDetailが長くなる。Vite単独のLab記録APIエラーは既知の起動制約で、このmemory-only導線には影響しない。

### Validation / User evaluation pending
npm test: 267件、265 PASS / 0 FAIL / 2 SKIP。typecheck / build PASS。最初のtest実行では追加fixtureによる段落数と合成selectionの後処理に起因する2件を修正し再実行。既存入力の無言削除なし、参照解除後本文保持、同文別Turn、未確定close、送信呼出しなしを検証。導線の自然さ・prefixの必要性・1行入力・参照表示・追記方式はuser evaluation pending。AI品質評価・本番採用判断は行わない。


## Marker Immediate Ask Composer v0.2（2026-09-28）

### Purpose / Composer separation / Immediate-question state
通常本文mainDraftとimmediateQuestions（markerId / turnId / turnNumber / sourceText / questionText）を別stateに保持するLab試験。再質問がある場合だけ本文直上に薄い背景・dividerで表示し、共通の送信Previewボタンを1つ置く。前Phaseの単一active referenceと本文への追記を置き換える。Catalog追加なし。本番接続・API・DB・モデル通信なし。

### Main draft independence / Multiple Marker questions
最新Assistant fixtureはT25でA/Bの2段落、過去T10にC。いずれも同じ引用「月がきれいですね」でIDによる区別を試す。準備ボタンでMarkerを作成し、A/Bからすぐ質問→既存prefix→1行入力→入力欄へで再質問だけ追加。本文の内容は追加・削除・編集で一切変更しない。準備のEscape/外クリックは追加しない。

### Read-only quote / Editable question / Removal / Duplicate
引用はq要素によるread-only表示、質問は編集可能なinput。×は該当再質問のみ削除しMarker・本文を保持。0件で再質問領域を除去し、同じ本文textareaを維持する（上の領域が縮む分の垂直位置移動はある）。同一Marker再追加は無視し、既存質問を上書きしない。確定時にDetailを閉じ通常本文へfocusする。Marker本体を後から削除しても既に準備した再質問snapshotは保持する。

### Latest-Turn restriction / Model-facing formatting / Send preview
T25の単一段落内Markerのみ対象。過去Cおよび旧7段落のすぐ質問はdisabled。旧Quick Memo/Dictionary/Marker編集は維持。Send Preview押下時だけ「## 回答への再質問」「・『引用』に相当するかぎ括弧引用＋質問」「## メッセージ」へ整形する。内部ID/offset/Turn IDは出力しない。Markdownをparseしてstateを復元しない。本文空でも再質問ありならPreview可、両方空ならdisabled。編集で古いPreviewを消し、次回押下で更新する。Previewは検証用で本番UI候補ではない。

### Browser observations / Observed issues / User evaluation pending
実ブラウザの入力・キーボード操作で、本文先行→A追加→B追加→質問文編集→並列2件Previewを確認。Aだけ削除してB・通常本文・Marker3件が残り、全削除で再質問領域が消え本文が維持された。Cのすぐ質問disabledを確認。同文同Turnの2引用は見た目が同じなので質問文で区別する必要がある。項目増加時の高さ、全削除時の縦移動、無視される重複操作の分かりやすさは評価課題。外枠の一体感・並列表現・引用read-onlyの安心感はuser evaluation pending。回答品質は未評価。

### Validation
npm test: 267件、265 PASS / 0 FAIL / 2 SKIP。typecheck / build / git diff --check PASS。0/1/複数、本文保持、削除、重複無視、過去Turn除外、prefix、未確定close、Previewと内部ID非混入、通信呼出し増加なしを既存Lab回帰に加えて検証。通常本文空のPreview可否は自動testで確認。本番移植なし、commit/push/tagなし。


## Marker Question Final Design / Immediate・Deferred二択試験（2026-09-28）

### Purpose / Immediate vs Deferred semantics / Exclusive choice UI
MarkerはHuman Attentionかつ質問対象の座標であり、質問を作らなくても存在する。左▽に大きめの「今すぐ質問」「後で質問」を配置し、aria-pressedで排他的選択を示す。下のprefix・1行入力・確定は共通。切替時は入力を保持するが、close時は準備を破棄する。参考メモ/Attentionは折りたたみの既存Markerメモ内へ退避し、保存済み値と編集を維持。削除は最下部。

### Latest-Turn restriction / Deferred-question positioning
fixtureのcompleted Assistant最終TurnはT25（A/B）、過去T10（C）と旧本文T1。今すぐ質問はT25の単一段落Markerだけ有効。過去Turnはdisabledと補足を表示し、後で質問は可能。実Conversationのlatest completed Turn算出は本番接続時に必要で、今回は固定fixtureに限定。
DeferredはLab内memory stateにkeepId / markerId / turnId / turnNumber / sourceText / question_draft / conversationId / start / end / createdAtを保持。元Markerの座標snapshotを使い文字列検索で再同定しない。空欄保存可、1行、既存Marker.memoや本番Keep.memoは上書きしない。同一MarkerのDeferredは既存Keep 1:Nに倣い複数保留可。本番DB/APIと接続せず、reloadで消える。

### Confirm / Cancel / Marker persistence / Question-state badge
明示的な確定だけでImmediateをComposerへ、DeferredをLab Keepへ追加。自動送信なし。Escape/枠外クリックは入力破棄、Marker/座標/既存Composer/既存Keepは保持。二択選択だけでは追加しない。Immediateの重複抑止・mainDraft独立はv0.2を維持。
ComposerまたはKeepに載るMarkerに同じ小dotをCSS疑似要素で表示し、選択対象のtextContentへ記号を混入させない。無質問Markerは無印。Composerから項目を除去しKeepもなければdotは消える。Marker本体削除時は対応Deferredを除去し、既に準備したImmediate snapshotは前Phaseどおり保持する。

### Context correction concept / Experimental parameters
文脈補正は将来の「後で質問」実行時の内部処理。保存時に補正文脈を固定しない。今回のDeferredは保存・一覧だけで、補正戦略を実行経路に埋め込まない。設定画面や補正Preview自体は未実装。
再利用候補は src/mode-b-poc/context-builder.ts の純粋関数。quote_only / same_turn_context、300/600/1000 UTF-16予算、5:5/6:4/7:3、grapheme境界検証を持つ。自由なbefore_chars / after_charsではないので変換できない条件を黙って丸めない。
src/context-preview/service.ts はSQLite/ RetrievalService依存。A（local）/A+B（local+前後Turn）、前後0〜3、上限20000 UTF-16。memory fixtureへ直接持ち込まず、将来取得済みTurnを受けるadapterか独立比較で再利用を検討する。Source Turn全文など全候補は既存戦略と同一ではない。UTF-16文字予算とモデルtoken予算も区別する。
将来Experimental設定はstrategy / before_chars / after_chars / previous_turns / next_turns / max_budget / unit / versionを明示し、要求値と端部・grapheme処理後の実効範囲を記録する。「中」だけで記録しない。今回のUIでは露出しない。

### Future Run recording / Production connection
request_snapshotは実際のモデルrequestを保持し、内部offset/IDをmessagesへ混ぜない。reference_snapshotには元座標・source textと、補正strategy/parameters/version/取得Turnと実効範囲を記録する案。既存GenerationRunにcontext_strategy/strategy_version、参照JSONがあるので新列を前提としない。ただし006_branch_questions.sqlのtriggerはstrategy_version 1/2とsource整合を検証しており、JSON拡張だけで新戦略が動くとは限らない。型・validation・旧snapshot互換を別Phaseで設計する。KeepなしImmediate Runの現行keep_id必須制約も未解決のまま、本番変更しない。
Question Keep→質問する/新規チャットの両方で補正builderを共有する方向。新規の引継ぎなしはFocus+質問のみ、ありは明示戦略で文脈を搬送する将来比較条件。今回実装しない。

### Browser observations / Observed issues / User evaluation pending
実ブラウザでA→今すぐ→prefix/入力→確定→Composer、B→後で→一言→確定→T25 Keepを確認。Cは今すぐdisabled/後でenabled。Cに入力して本文への外クリックでキャンセルし、再open時空欄・Marker3件保持・通常本文保持・Keep追加なしを確認。A/Bにdot、Cは無印をDOMと画面で確認。操作はkeyboardと入力/クリックAPIで検証し、drag再検証はしていない。
小dotは背景や拡大率で見落としやすく、二択の理解・共通入力・取消時破棄・保留一覧の場所はuser evaluation pending。Context品質評価・本番採用なし。Lab Keepの復帰/送信操作は未実装。Vite単独の記録APIエラーは既知の別制限。

### Validation
npm test 267件: 265 PASS / 0 FAIL / 2 SKIP。typecheck / build / git diff --check PASS。二択排他、過去Turn、Immediate/Deferred、空欄保留、キャンセル、Marker保持、dot有無、本文保持と既存Lab回帰を確認。本番コード・DB/API・migration・Run schema変更なし。commit/push/tagなし。

## Question Box Sidebar Prototype v0.1（2026-09-28）

### Purpose / Question Box semantics
質問文ではなく「疑問が生まれた場所」の一覧として、保留したMarkerから元Conversation / Turn / Markerへ戻れるかを試す。既存Quick Actionの継続Phase。実装・技術検証は完了、user evaluation pending。本番採用なし。

### Chat / Question Box switch / Keep read model
Lab専用左Sidebarにチャット / 質問箱を配置し、初期値はチャット。既存memory-only Deferredを共通stateとして使い、keepId / markerId / conversationId / turnId / turnNumber / sourceText / question_draft / start / end / createdAt、fixture用unresolvedを保持する。本番schemaではない。
一覧は追加順の逆順。T番号は1始まり、会話名を小さく、Marker抜粋は最大70文字、一言メモは非空時のみ表示。元へ戻るだけを明示ボタンにし、行全体click・削除・質問する・新規チャットは追加しない。

### Cross-conversation list / Turn-number display
「質問箱fixtureを準備（会話A/B・未解決）」でA/T10 Marker C、A/T25 Marker B、B/T8 Marker D、B/T9 unresolvedの4件を準備する。繰り返し準備してもKeepは重複追加せず、既存ユーザー作成Keepを新しい側に保つ。Aの既存本文・Composer・Quick Memo等のstateは会話切替で保持する。Bは復帰試験専用のread-only fixtureで、通常Chat機能の複製ではない。

### Return-to-source flow / Marker pulse behavior / Unresolved behavior
会話IDで表示を切替後、Turn ID内のMarker IDを探す。Aでは保存済みsource textと範囲snapshotも照合し、同文検索による再anchorはしない。解決済みMarkerをviewport中央へscrollしてfocus、約1.8秒outline/pulse（reduced motionではanimationなし）。チャットタブへ戻す。
未解決は元Turnへscrollし、一時outlineと「Marker位置を確認できません」を表示する。同じ文章を持つ他Markerには移動しない。元Turn自体がない場合も案内に留める。

### New Keep reflection
Marker → 左▽ → 後で質問 → 確定で同じKeep stateへ追加し、質問箱の先頭へ即時反映する。既存質問情報dotをそのまま使用。Keep一覧から削除する機能はない。既存Marker削除時のLab側処理は維持する。

### Browser observations / Observed issues
実ブラウザで質問箱切替、新着順、同文のA/T25 Bへの正確な復帰、別会話B/T8 Dへの復帰・dot・pulse、B/T9未解決のTurn fallbackと案内を確認した。T10から新規「後で質問」を保存し、一覧の先頭反映も確認。操作はキーボードactivationと入力/クリックAPIで行い、drag再検証はしていない。
左幅210pxの小さな一覧として表示する。外側のLab Catalogと内側の試験Sidebarが並ぶため、本番の有効本文幅とは異なる。狭幅の最終設計や多数Keep時の評価は未完了。Vite単独起動の既知の記録APIエラーは本Phaseの対象外。非表示BのMarkerが旧テストの全DOM検索に混入したため、stateを持たないBは表示時だけ描画する。

### Validation / User evaluation pending
npm test: 267件中265 PASS / 0 FAIL / 2 SKIP。質問箱の新着順、二重seed抑止、同文Marker区別、会話横断復帰、未解決fallback、pulse終了、dot、追加即時反映、Composer保持を既存Quick Action回帰に追加。typecheck / build / git diff --check PASS。
一覧の抜粋長・一言メモ・会話名の情報量・元へ戻るの自然さは人間評価待ち。Allowed scopeはLab専用Sidebar / fixture / CSS / tests / 本記録。Excluded scopeは本番Chat・MarkerCore・DB/API・Study・文脈補正・モデル送信・Run・質問実行・新規チャット・Keep削除。commit / push / tagなし。
## Question Box Sidebar v0.2 — Conversation折りたたみ整理（2026-09-28）

### Conversation grouping / Keep-only conversation filtering
質問箱をConversation→Keepの階層へ変更。Keepが存在する会話だけ表示し、名称はチャット一覧と同じLab会話データを参照する。独自の名称snapshot・保存schemaは追加しない。見出しに件数を表示する。

### Latest-conversation initial expansion / Group ordering / Keep ordering
質問箱タブに入るたび、最新Keepを含むConversationだけ展開する。createdAtの降順でKeepを並べ、同時刻なら追加順の新しい側を優先する。グループも内部の最新Keep順。開いている間は個別開閉を保持し、新規Keep反映だけで手動の折りたたみを解除しない。

### Collapse-all behavior / Chat list role separation
「すべて閉じる」は全グループを閉じる。各見出しは独立開閉のみで、会話を開く操作ではない。チャットタブは全会話を探す入口、質問箱はKeepのある会話を分類する入口。項目のT番号・70文字抜粋・任意メモ・unresolved・元へ戻るを維持。操作行に余白を設けたが、将来用メニュー・質問実行・新規チャットは実装しない。

### Fixture / Browser observations
新規Runで「質問箱fixtureを準備（会話A/B/C・未解決）」を押すとA 3件・B 2件・C 1件を作成。KeepなしDはチャットにのみ表示。Cは最新Keepを持つ未解決位置のread-only fixture。既存A/Bの復帰ロジックを変更せず、Cにも元Turnの表示だけを用意した。
実ブラウザでCのみ初期展開、グループ順C→B→A、A/Bの個別開閉、全閉じ、内部新着順、D非表示を確認。B/T8の正確なMarker・dot・pulse、B/T9の未解決案内、A/T25復帰も確認。操作はkeyboard activation中心で、ドラッグ検証は今回の対象外。

### Validation / User evaluation pending
grouping・件数・初期展開・並び順・個別開閉・全閉じ・Keepなし非表示の自動検証を既存Quick Actionテストへ追加。元へ戻る・同文Marker区別・unresolved・新規Keep反映の回帰を維持する。
折りたたみにより見通しは短くなったが、項目到達に開閉が1操作増える。毎回最新グループだけ開く挙動と情報量はuser evaluation pending。大量Keep・狭幅の最終UX判断は未完了。本番コード・DB/API・Marker処理・文脈補正・質問実行・新規チャットを変更しない。commit/push/tagなし。
検証結果: npm test 267件（265 PASS / 0 FAIL / 2 SKIP）、npm run typecheck / npm run build / git diff --check PASS。

### Return action inline text / Txx same-line layout（2026-09-29）
20件fixtureで、下部の枠付き「元へ戻る」をT番号の右へ移動。見た目は下線付きテキスト操作、意味は既存buttonのままでEnter/Space操作と復帰handlerを維持する。右操作群をflexにし、将来の小操作を隣接できる構造だけ残した。メニューは実装しない。

### Vertical-density / Narrow-sidebar observation
独立した下部操作行を除去し、見出し行を24pxに収めた。通常Sidebar幅210pxでサンプル項目は122px、メモなしunresolved項目は100px。高さは本文の折り返しに依存する。viewport幅520px・Sidebar幅150pxでもT番号と操作は同じ行に収まり、重なりなし。既存Conversation見出しは狭幅で折り返すが今回変更しない。
下線を常時表示し、hoverでは色・背景、focus-visibleでは2px輪郭を指定。実ブラウザでキーボードfocusの輪郭とEnter復帰を確認。hoverはCSS定義確認までで、ポインタhoverの実機目視は未確認。
resolved B/T8のMarker復帰、unresolved B/T9のTurn復帰と案内、メモあり・なしを確認。質問箱のgroup/Keep順・開閉・保存・Marker処理は変更なし。

### Validation / User evaluation pending
npm test 267件（265 PASS / 0 FAIL / 2 SKIP）、typecheck / build / git diff --check PASS。密度と操作の見つけやすさの採否はuser evaluation pending。本番移植・commit/push/tagなし。

## Question Box Sidebar v0.3 — 主要操作＋ellipsis menu（2026-09-29）

- Primary action remains visible: T番号の右にテキスト操作「元へ戻る」を維持。復帰handler・Marker pulse・unresolvedのTurn復帰は従来どおり。
- Secondary actions / Future extensibility: 24px幅の「…」を追加。専用の小さな操作領域に「質問する」「新規チャット」を表示し、選択時はT番号付きの「未実装」案内だけを出す。Keep・Conversation・Composer・DB/APIには接続しない。追加候補を置ける構造のみで汎用frameworkなし。
- Menu open / close / One-menu-at-a-time: Keep IDを1件保持。同じ入口で閉じ、別入口で置換、枠外pointerdown・Escape・タブ切替で閉じる。Escapeは入口へfocusを戻す。Tab/Enterで候補を操作できる通常button群として実装。
- Conversation-collapse interaction: 対象グループを閉じる／すべて閉じるでmenuも閉じる。見出し操作は会話遷移しない。
- Narrow-sidebar behavior: Menuは入口直下の通常レイアウト内に右寄せ表示し、開いている1項目だけ高さが増える。浮動配置による画面外はみ出しを避ける最小構成。viewport520px・Sidebar150pxで横scrollなし（clientWidth = scrollWidth = 134px）、T21・元へ戻る・…の同一行とfocusを画面確認。
- Browser observations: 20件fixtureのF/Eでopen・同時1件・別Keep切替・Escape・枠外クリック・グループclose・全close、未実装案内を確認。B/T8 resolved、B/T9 unresolvedの復帰も確認。別入口のpointerdownで旧menuを先に閉じるとclick前に行位置が動くため、入口同士の切替はclickでまとめて処理する。
- User evaluation pending: 補助操作の発見しやすさ、展開による縦方向の移動量は人間評価待ち。本番移植なし。
- Validation: npm test 267件（265 PASS / 2 SKIP / 0 FAIL）、typecheck / build / git diff --check。commit / push / tagなし。

## Context Correction Experiment v0.1（2026-09-29）

- Purpose / Hypothesis: Question Keepから将来質問する際、過去のSource以前の文脈量で最初の回答の対象特定・既知前提・説明開始レベルが変わるかを調べる。
- 実験入口: Run上部の送信前Preview。固定40 Turn物理会話、4 Marker、A補正なし/B局所300 UTF-16/C直前2 Turn/D直前6 Turn。既存Mode Bの純粋builderとLMStudioProviderを再利用し、本番Question Keep・API・DB・Run schemaは変更しない。
- Results: 独立した初回回答16件を取得。投入request、SHA、回答、診断を保存。Automatic checksとCodex first reviewを分離した[評価レポート](context-correction-v01-report.md)と[全回答](context-correction-v01-data/responses.md)を参照。
- Observed issues: 曖昧語の対象特定には差があったが、B/C/Dの差が小さい例もある。作用の説明に残る精度問題は文脈追加だけでは解消しない。Sourceが短くBに全文が入り、長文局所windowの効果は未評価。
- Validation: npm test 268件（266 PASS / 2 SKIP / 0 FAIL）、typecheck/build/diff check、保存16 requestとPreview一致。実ブラウザでMarker/条件切替と投入全文表示を確認。
- Human review: pending、全Run未採用。質問する・新規チャット・本番ContextBuilder接続へ進まない。

## Context Correction v0.2 — Long Source / Local Window（2026-09-29）

- Purpose: 長いSource内部の局所切り出しで対象・前提・冗長性が変わるか。前後Turnは加えない。
- Fixture / Window: 固定32 Turn、T20は2650 UTF-16、同文を異なるoffsetで選ぶ4 Marker。Bは前後計300、Cは800（Marker別枠）、D全文。grapheme境界を保持するLab wrapper、既存builderは変更なし。
- Preview / Runs: Run上部にv0.2 Preview。範囲・使用率・全文を確認可能。独立16 Runを既存LM Studio providerで取得し、request SHAと自動照合を保存。
- Findings: 局所で足りる例、冒頭定義がFullで補える例の両方を観察。Fullで二つの解釈を候補化してlength終了した1件も無修正で残した。[一次評価](context-correction-v02-report.md)、[投入量・全回答](context-correction-v02-data/responses.md)参照。
- Validation: npm test 270件（268 PASS / 2 SKIP / 0 FAIL）、typecheck/build/diff check。全16 request/Preview一致、境界/割合の検証。ブラウザでA/補正なし→B/800切替と範囲808–1621、813文字/30.68%を確認。
- Human review: pending。DB/API、本番Chat/Question Keep、Run schema変更なし。引継ぎ実験・本番採用・commit/push/tagへ進まない。

## Context Correction v0.3 — Same Chat / New Chat Handoff（2026-09-30）

- Purpose: 同一会話相当の履歴がある場合と履歴ゼロで、必要な局所文脈量・対象特定が変わるかを比較する。
- Fixture / Conditions: v0.2の32 Turn・T20=2650 UTF-16・4 Markerを再利用。生成前に24 Run Pilot（300/800/1500）を選択し記録。500/1100未実行。Sameは完了T1〜T20、Newは履歴なし。Source後のTurnと前Run回答は混ぜない。
- Model: 旧unsloth IDが利用不可のためgoogle/gemma-4-12b-qatへ変更し、全24件で固定。旧実験との因果的な直接比較はしない。
- Preview / Results: Lab Runのv0.3 PreviewでMode/Level・範囲・履歴・投入messagesを確認。24 stop / 0 error、全request/Preview・境界・SHA照合PASS。[一次評価](context-correction-v03-report.md)、[全回答とAutomatic表](context-correction-v03-data/responses.md)、[Escalation一次レビュー](context-correction-v03-data/reviews.json)。
- Observations: Cの独自定義はSameで保持され、New1500でも局所範囲外。D/New1500では同文二候補化を観察。Aでは増量の改善が乏しい。一次評価であって人間の採用判断ではない。
- Escalation: literal候補1件、読解追加候補1件を分離保存。追加問い合わせなし。自動Escalation未実装。
- Validation: npm test 272件（270 PASS / 2 SKIP / 0 FAIL）、typecheck/build、git diff --check。ブラウザでSame300/New1500 Previewの履歴・文字数切替を確認。UI-only起動の既存記録APIエラーはPreview検証と区別する。
- Human review: 全24件pending。最適値決定、本番Question Box/新規Chat接続、DB/API/Run schema変更、SOULへ進まない。commit/push/tagなし。

## Question Box → New Chat Handoff Prototype v0.1（2026-09-30）

### Purpose / UI flow

Question BoxのQuestion Keepから `… → 新規チャット` を選び、即作成・即送信せずに `New Chat Handoff Setup` を開く。通常UIは「引継ぎ する／しない」と「少なめ／標準／多め」のみ。初期値はON・標準。`キャンセル`はKeep・会話・draftを変更せず閉じ、`準備`はLab memory内の `Draft New Conversation` Previewだけを生成する。「質問する」は従来どおり未実装表示で、本Phaseでは接続しない。

### Handoff ON/OFF / presets

- ON: 300／800／1500 UTF-16を少なめ／標準／多めへ対応。Markerより前側を指定量、後側は通常0。Marker本文はrangeへ完全包含し、最初のUser messageを「前提文脈／参照箇所／質問」に分ける。
- OFF: Marker Focusと保存済みquestion draftだけ。過去履歴・周辺文脈を入れない。draftが空でも補完文を生成しない。
- Levelは文脈の採用値ではなく操作試験用。標準800を初期表示にするが最適値とは判断しない。

### Experimental Future Context / boundary

Experimental内だけPast 300／500／800／1100／1500、Future OFF／300／800を直接変更できる。通常presetはPastだけを操作する。rangeはSource Turn内のUTF-16 half-open、Marker offsetを構造化保持し、開始・終了をgrapheme境界へ内側に丸める。端では実際に取得できた文字数をPreviewへ表示する。DB全文検索、遠いTurn検索、要約、Semantic Searchは行わない。

### Preview format / unresolved behavior

PreviewはSource Conversation／Turn、Marker ID／本文、question draft、Handoff ON/OFF、Level、実Past／Future文字数、range `[start, end)`、最初のUser messageを表示する。resolvedでも保存座標・source text・grapheme境界が一致しなければ生成停止。unresolvedのONは「Marker位置未解決」で停止し、自動re-anchorしない。OFFは保存済みMarker本文があればPreview可能だが、rangeを未解決と明示する。

### Browser observation

- Conversation A / T25で初期ON・標準を開き、Past 800、Future 0、range `[896, 1704)`、Marker IDとquestion draft、引継ぎmessageを確認。
- OFFでPast/Future 0となり、messageから前提文脈が消えることを確認。少なめ／標準／多めは実Past 300／800／1500へ切り替わった。
- Experimental Past 1100 / Future 300でrange `[596, 2004)`、各実文字数を確認。
- unresolved T9はON Previewを停止し、自動re-anchorなしの案内を表示。OFFでは空draftを空のまま、保存Marker本文だけでPreviewを表示。
- 520px幅でもSetup・preset・Experimental・Previewに横方向の破綻なし。長いPreviewはdialog内の1本の縦scrollを使う。通常幅では背面Question Boxを残した中央overlay。準備後もConversation作成・ネットワーク送信なし。

### Automatic checks / Human evaluation pending

ON/OFF、3 preset、Past 1100＋Future 300、Marker完全包含、UTF-16/grapheme境界、Source端、unresolved、空draft、Previewと内部stateを専用helper/testで確認。既存Question Box統合テストでmenuからSetup、キャンセル、Previewを検証。本番Chat、Question Keep、DB/API、Run schema、既存MarkerCoreを変更しない。

操作語の分かりやすさ、標準800の見せ方、Experimentalの必要性、overlayの大きさはHuman evaluation pending。引継ぎ量を採用決定せず、本番新規Conversation・モデル送信・自動Escalation・SOULへ進まない。commit/push/tagなし。

### Vertical density adjustment（2026-10-01）

New Chat Handoff Setupの機能・state・文言・Preview内容を維持し、Lab専用CSSの縦余白だけを縮小した。Setup内padding、fieldset / section間margin、legend周辺、Experimental、操作ボタン、Preview見出し・定義一覧・入力欄ラベルの余白を調整。ラジオlabelは通常選択で28px、3 presetで34px以上の高さを残し、横配置とfont-sizeは変更しない。

実ブラウザの同じConversation A / T25・ON・標準Previewで、内容全高は約1104pxから847px、Previewは約673pxから501px、10項目のdefinition listは335pxから207pxへ短縮した。Previewは1項目1行と2列配置を維持。In-app Browserではブラウザ倍率を数値取得できないため、通常1101×884pxから150%相当の有効表示領域756×589pxへ一時変更して確認し、横overflowなし、T25 / Marker ID / question draft / 800 UTF-16 / range等の行対応、ラジオ選択、dialog内scrollに破綻なし。確認後は通常viewportへ戻した。読みやすさと密度の最終採否はHuman evaluation pending。

## Question Box → New Chat Handoff Prototype v0.2 — Real Model Send（2026-10-01）

- Purpose / UI flow: v0.1 Previewの最初のUser Messageを編集可能にし、明示的な「新規チャットとして送信」後だけLab専用endpointからLM Studioへ送る。「戻る」は設定へ戻り、自動送信なし。
- Memory-only boundary: requestは固定system + 編集済みuserの2件だけ。旧会話履歴0件。本番Conversation / Question Keep / GenerationRun / SQLiteへ保存せず、UI stateと実験専用JSONだけにtemporary conversation・応答・diagnosticsを保持する。
- Fixture / Preview: 局所で理解しやすいCase 1と、前提を要するCase 2の2 Keep。OFF / 300 / 800 / 1500、Future 0の8独立PreviewとAutomatic checksはPASS。
- Model / execution: `google/gemma-4-12b-qat`をmodel一覧で確認し、temperature 0 / max_tokens 2048でCase 1 / OFFを実行。236秒後に`length`、本文0、reasoning 8028文字で終了し、空回答失敗として保存した。
- Stop boundary: 自動再生成禁止と既存Lab方針に従い、残り7件は未実行。回答差・Noise・不足Contextの一次評価は成立していない。[v0.2 Report](new-chat-handoff-v02-report.md)を正本とする。全件Human review pending、本番接続・自動Escalation・SOULへ進まない。

## New Chat Handoff — Turn-based Stability Experiment v0.3（2026-10-01）

- Purpose: Case 1 / OFFの既存失敗を再実行せず、Target T25全文と直前1／3／5 Turn（Wideのみ後1 Turn）を最初のUser Message内へ加え、同じ生成設定で最終回答へ到達するかを確認した。
- Contract: 各Runは独立したsystem + userの2 messages。Turnは元順序、Target全文は1回、内部ID／offsetなし。model `google/gemma-4-12b-qat`、temperature 0、max_tokens 2048を固定し、自動retry・本番DB書込みなし。
- Results: Minimal / Standard / Wideは全件`stop`で最終回答へ到達。回答59／88／116文字、reasoning 2077／2120／2235文字、所要73.5／71.7／76.5秒。既存OFFは`length`、本文0、reasoning 8028文字、236秒。
- Observation: 少量Turn Contextで正常終了した可能性はあるが、3条件とも好意表現の由来を実質的には説明せず、Targetに説明がないとして回答を控えた。WideはTarget内のExperimental等へ触れ、人工的な長いTarget由来のノイズ候補がある。因果・最適Turn数は断定しない。
- Record: [v0.3 Report](new-chat-handoff-turn-v03-report.md)、[Previewと実Run](new-chat-handoff-turn-v03-data/preview.json)、[Codex一次観察](new-chat-handoff-turn-v03-data/reviews.json)。全件Human review pending。本番接続・自動Escalation・設定変更へ進まない。

## New Chat Handoff — Natural Conversation Experiment v0.4（2026-10-01）

- Purpose / Fixture: 量子力学・LLM数値量子化・量子コンピュータの近い語が続く自然な8 Turn会話を固定し、3 Marker × Minimal／Standard／Wideの9独立New Chatで対象理解を比較した。
- Contract: v0.3と同じsystem prompt、`google/gemma-4-12b-qat`、temperature 0、max_tokens 2048。system + userの2 messagesだけで、Turnは最初のUser Message内に元順序で含めた。自動retry・本番DB書込みなし。
- Results: 全9件`stop`、errorなし。Case AはStandardがMarkerをLLMの工学処理として直接特定し、Wideは後続の量子コンピュータ話題を比較対象にして取り違えるノイズ候補。Case Bの干渉説明とCase Cの古典bit区別はMinimalで成立した。
- Observation: 固定の最適Turn数は示されず、Target内の説明完結度と近接する同形語によって必要量が変わる可能性がある。[v0.4 Report](new-chat-handoff-natural-v04-report.md)、[9 Run Preview](new-chat-handoff-natural-v04-data/preview.json)、[Codex一次観察](new-chat-handoff-natural-v04-data/reviews.json)。全件Human review pending、本番実装・自動Escalationへ進まない。

## New Chat Handoff — User Reasoning Continuity Experiment v0.5（2026-10-01）

- Purpose / Fixture: 対向光の相対速度についての初期誤解、AIの訂正、ユーザー自身の言い換え、波粒子・日常語・数式への抽象化を含む固定8 Turnを使い、4 Marker × Minimal／Standard／Wideの12独立New Chatで reasoning continuityを観察した。
- Contract: v0.4と同じsystem prompt、`google/gemma-4-12b-qat`、temperature 0、max_tokens 2048。system + userの2 messagesだけで、Turnは最初のUser Message内に元順序で含めた。自動retry・本番DB書込みなし。
- Results: 全12件`stop`、errorなし。Case AのT1–T2だけでは接近速度と相対速度の区別が一部不安定で、ユーザー自身の修正理解T3を含むWideでは区別が明確になった。Case B–Dは直前User Turnを含むMinimalで主要な回答が成立した。
- Observation: ユーザー発言をAI自身の発言へ明確に取り違えた例はなかった。C-Wideではfixture外の一般例と長文化が増えた。各Caseで直前User Turnが含まれる設計、AのMinimal / Standardが同一入力になる会話端条件は比較上の制限。[v0.5 Report](new-chat-handoff-reasoning-v05-report.md)、[12 Run Preview](new-chat-handoff-reasoning-v05-data/preview.json)、[Codex一次観察](new-chat-handoff-reasoning-v05-data/reviews.json)。本番実装・自動Context拡張へ進まない。
- Human review: User自身の誤解・言い換え・理解更新と、User / Assistantの往復を「思考の軌跡」として扱う価値を解釈記録として追加した。「思考の節目」は仮説であり、自動判定や実装仕様にはしていない。詳細は[v0.5 ReportのHuman Review](new-chat-handoff-reasoning-v05-report.md#human-review2026-10-01)を参照。
