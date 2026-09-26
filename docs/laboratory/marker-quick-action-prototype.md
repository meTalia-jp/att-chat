# Marker Quick Action Prototype

## Current State

照合日: 2026-09-26。Repositoryのdirty working treeを根拠とする要約。以下のPhase履歴は当時の記録として保持する。実装完了・技術検証・ユーザー評価・本番採用は別の判定。

- Catalog ID: `marker-quick-action-prototype`
- Catalog status: `TESTING`
- Current phase: External Data Asset対応 / Phase 0.7 Quick Dictionary Prototype v0.1（Catalog version 0.7）。履歴は初期Marker → Detail/Signal比較 → 0.4.1 → Memo 0.5 → Direction Menu 0.6 → Dictionary 0.7。
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
