# Marker Quick Action Prototype

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
