# Context Correction v0.3 Report

## Pre-run decision（2026-09-30、生成前に記録）

**24 Run Pilot**: v0.2で全文条件に長い生成とlength終了があったため、許可されたL1=300/L3=800/L5=1500を選ぶ。500/1100は実行しない。4 Marker × Same/New ×3 Level。失敗や途中終了も保存し、良い回答を得るための再生成・追加問い合わせはしない。

## Purpose / Fixture / Mode

v0.2の固定32 Turn・2650 UTF-16のT20と4 Markerをそのまま使用。[fixture](../../src/laboratory/context-correction/long-fixture.ts)。A=局所の運動量、B=少し前の時間比Δ、C=冒頭定義の台帳Q、D=同文の空間比ε。全質問「質問です。これはどういう意味ですか？」。

S（Same）: 完了履歴T1〜T20をrole/content順に送る。**Source自身の全文も既存履歴に含む**。その後に局所Context/Focus/質問を同一のuser messageとして追加する。N（New）: 履歴ゼロ、同じuser messageだけ。systemは両Mode同一。

通常Chatの[repository](../../src/server/storage/repository.ts)はcompleted Turnをrole/contentへ写像して送る。この履歴構成をLabで模擬するが、本番Question Keep経路は現状quote-onlyであり、今回のSが本番Keepの実装を再現したものではない。新規会話作成も行わない。

Sは履歴が省略されず残っている上限側の条件。T21以降は除外。履歴切り詰めがある実運用への一般化はできない。NへのSource全文＋前Turnの複合引継ぎはしない。S/Nの差は履歴の有無だけであり、Sでは局所量を減らしても総入力は小さくならない点を評価で分離する。

## Level / Fixed model

300/800/1500はv0.2と同じくMarkerを除く前後合計UTF-16予算、5:5。端で不足する場合のみ反対へ再配分、grapheme境界へ内側丸め。Source内に選択タグを挿入して同文を区別。文字数/使用率はタグを除くslice、総入力はsystem+履歴+最終user本文（JSONやroleラベル除外）。

`unsloth/gemma-4-12b-it-qat`、temperature0、max_tokens2048、v0.1/v0.2と同じsystem prompt。seed・LM Studio内部設定・model file hashは完全固定保証なし。各Run独立、前の生成結果を次へ渡さない。順番はMarker A→D、Mode S→N、Level300→800→1500。

生成前のモデル確認で旧unsloth IDはAPI一覧とローカル一覧に存在せず停止（生成0件）。利用可能な`google/gemma-4-12b-qat`へv0.3だけ変更する。以降全24件でこのIDを固定し、v0.1/v0.2の結果との差をContextの効果だけには帰属しない。旧実験の設定/結果は変更しない。

ロード確認: Q4_0、loaded_context_length=16384、parallel=1。ロード時CLI設定ファイルのEPERM警告は出たがロードは成功し、APIでloadedを確認。履歴文字数は全Sで3116、全Nで0。S入力3596〜4802、N入力480〜1686 UTF-16。各生成のtimeoutはv0.2同様240秒。

## Preview / Reproduction

Lab → Marker Quick Action Prototype → Run → `Context Correction v0.3 — Same / New Preview`。3 selectorでMarker/Mode/Levelを変更し、履歴Turn ID、Source長、範囲、割合、総文字数、最終messages配列を確認する。Nもincluded_turn_idsには局所Source T20が出るがhistory_turn_idsは空配列。

```powershell
# 出力先は毎回新しくする。最初は送信しないPreviewのみ
node --experimental-strip-types src/laboratory/context-correction/handoff-run.ts docs/laboratory/context-correction-v03-rerun
# Previewを確認後、固定モデルをLM Studioで利用可能にする
node --experimental-strip-types src/laboratory/context-correction/handoff-run.ts docs/laboratory/context-correction-v03-rerun --execute
node --experimental-strip-types src/laboratory/context-correction/handoff-report.ts docs/laboratory/context-correction-v03-rerun
```

[送信前24 Preview](context-correction-v03-data/preview.json)、[Automatic表・全回答](context-correction-v03-data/responses.md)。実験専用JSONへrequest/sha/時刻/回答/diagnosticsとescalation_candidateを保存し、既存結果の上書きは拒否する。既存Run schema/APIは使用しない。通常テストはモデル不要。

Escalationは回答の不足表現のliteral screeningと一次読解で扱う。文字列一致は品質判定ではない。「場合による」が正しい物理条件を示すだけのこともあるため誤検出/見逃しをレポートで区別する。追加Context要求・再問い合わせはしない。

## Technical validation / Browser

- npm test: 272件、270 PASS / 2 SKIP / 0 FAIL。typecheck/build PASS。新規境界テストは結合文字/emoji、両端再配分、Marker完全包含を確認。
- S/Nの最終userとsystemは一致し、差は履歴messagesだけ。履歴T1–T20、N履歴ゼロ、未来Turnなし、3 Level固定と総量差3116を自動検証。
- 実ブラウザでA/S/300を開き履歴3116・総入力3596を確認。N/1500へ切替後、履歴0・総入力1680・range0–1510・使用率56.98%と2messages表示を確認。UI-onlyの既存記録APIエラー表示は残るがPreviewは利用可能。全24件手動巡回はしていない。

## Scope / Human review

Lab専用wrapper/Preview/CLI/保存結果/一次評価のみ。DB/API、本番Chat/Question Keep、Run schema、既存ContextBuilderを変更しない。最適値、自動Escalation、引継ぎUI、SOULへ進まない。**全Run Human review: pending**。

## Codex first review（主観、採用判定ではない）

○=対象/必要前提を観察、△=部分的、×=不成立。ノイズは無関係な話題への牽引であり、対象を区別するための短い対比はノイズと数えない。回答長はUTF-16、長さのみで優劣を決めない。

### Marker A — 局所で完結する総運動量

| Mode | Level | 対象特定 | 前提十分 | ノイズ | Context量 | 回答長 |
|---|---:|---|---|---|---:|---:|
| Same | 300 | ○ P | ○ 外力ゼロ | なし | 310 | 279 |
| Same | 800 | ○ P | ○ | なし | 810 | 295 |
| Same | 1500 | ○ P | ○ | エネルギーとの短い対比 | 1510 | 255 |
| New | 300 | ○ P | ○ 外力ゼロ | なし | 310 | 286 |
| New | 800 | ○ P | ○ | なし | 810 | 221 |
| New | 1500 | ○ P | ○ | 一台だけの場合を補足 | 1510 | 303 |

Same300 vs New300: 内容上ほぼ同じ、P・合外力ゼロ・個別速度とは別を説明。Same800 vs New800も主要説明は同じで、Newが短いがそれだけで優位とはしない。Same1500 vs New1500は対比の選択が違うだけで、対象理解の改善は見えない。New300→800→1500で前提不足の解消は観察せず、既に300で必要な局所定義が入る。遠い定義や履歴の寄与を示す証拠は乏しい。既知のF=maを再講義した回答なし。6件とも不足表現のliteral検出なし。

### Marker B — 少し前の時間比Δの定義

| Mode | Level | 対象特定 | 前提十分 | ノイズ | Context量 | 回答長 |
|---|---:|---|---|---|---:|---:|
| Same | 300 | ○ Δ | ○ | なし | 313 | 438 |
| Same | 800 | ○ Δ | ○ | 数値例・要約の反復 | 813 | 565 |
| Same | 1500 | ○ Δ | ○ | なし | 1513 | 352 |
| New | 300 | ○ 時間間隔/周期 | △ 頻度と時間間隔の表現が曖昧 | なし | 313 | 285 |
| New | 800 | ○ Δ | ○ | なし | 813 | 253 |
| New | 1500 | ○ Δ | ○ | なし | 1513 | 146 |

Same300 vs New300: 両者とも時間測定と周期の比を同定した。Sameでは履歴の定義を利用できたように見えるが、Newも周辺から推測したため、履歴が対象特定に必須だったとは言えない。New300の「測定の頻度（時間間隔）を高くする」は相反する量を同一視したように読める。Same800 vs New800: 定義と目的は同じで、Sameは数値例・要約が多い。New300→800で定義名と分母が明確になり、言い換えの問題もなくなった。Same1500 vs New1500: 対象は同じ。New800→1500で主要な対象/定義の改善は見えず、短くなる違いが中心。空間比εへ取り違えた回答なし。NoetherやF=maの基礎再説なし。6件ともliteral不足検出なし。量の増加だけで長文化するという仮説には反する例。

### Marker C — 遠い独自定義の台帳Q

| Mode | Level | 対象特定 | 前提十分 | ノイズ | Context量 | 回答長 |
|---|---:|---|---|---|---:|---:|
| Same | 300 | ○ Qの具体的構成 | ○ 条件も説明 | なし | 310 | 443 |
| Same | 800 | ○ Qの具体的構成 | △ 条件省略 | なし | 810 | 193 |
| Same | 1500 | ○ Qの具体的構成 | ○ 条件も説明 | Δ/Pとの適切な区別 | 1510 | 429 |
| New | 300 | △ Qの合計一般 | △ 内訳と条件なし | なし | 310 | 227 |
| New | 800 | △ Qの合計一般 | △ 定義参照が必要と述べる | 代入禁止を繰り返す | 810 | 264 |
| New | 1500 | △ Qの合計一般 | △ 内訳と条件なし | 代入禁止を繰り返す | 1510 | 275 |

Same300 vs New300: Sameだけが二台の並進運動＋ばねの弾性位置エネルギーを特定し、摩擦/外部仕事条件を説明した。Same800 vs New800: Sameは定義を保持、Newは最初の約束への参照を促す。Same1500 vs New1500: Sameは定義・条件を両方説明、Newは依然「各項の合計」に留まる。これらは履歴の遠い定義が寄与した可能性を示す。ただしSのSource全文とT1–19の寄与は分離できない。

New300→800→1500で核心の内訳・条件は改善しない。量が足りないというより、増量しても冒頭へ届かない範囲の問題。NewがΔやPをQと断定する誤答はないが、正しい具体的定義を補ったわけでもない。New800の「どの量を合計し、どの区間に条件を限定したかについては、最初の約束（定義）を参照する必要があります」をCodex一次レビューのescalation_candidate=trueとする。これはSourceの文の言い換えでもあるため、モデルの明示的な追加情報要求と断定しない。rawのliteral検出はfalseで、その見逃し候補を別レビュー記録へ保存する。New300/1500も内容不足だが、同種の不足表明はなく候補false（十分という意味ではない）。

### Marker D — 同じ表現の空間比ε

| Mode | Level | 対象特定 | 前提十分 | ノイズ | Context量 | 回答長 |
|---|---:|---|---|---|---:|---:|
| Same | 300 | ○ ε | △ 二次近似を保証しすぎる | Taylor説明の反復 | 313 | 691 |
| Same | 800 | ○ ε | △ 二次近似を保証しすぎる | 物理操作ではないと断定 | 813 | 705 |
| Same | 1500 | ○ ε | ○ 係数条件も留保 | Δとの適切な区別 | 1513 | 387 |
| New | 300 | ○ ε | ○ 平衡点付近への限定 | なし | 313 | 247 |
| New | 800 | ○ ε | ○ 高次係数・二次項消失を留保 | なし | 813 | 375 |
| New | 1500 | △ 二つの候補 | △ 選択箇所を確定しない | 時間比Δの説明を追加 | 1513 | 565 |

Same300 vs New300: 両者ともεを特定するが、Sameは小さい比だけで二次近似が許されるように説明する。履歴には係数の注意があるのに利用できておらず、履歴が多いだけでは精度を保証しない。New300は運動範囲の限定に留まり、二次近似を保証しない。Same800 vs New800: Newは近似の例外を拾い、Sameは高次項を無視できると強く述べる。Same800の「物理的な操作ではありません」も、Sourceが要求していない限定の候補。Same1500 vs New1500: Sameは対象を確定して条件を留保する一方、Newは同文二箇所を両方説明し、選択タグがあるにもかかわらず対象を絞れない。

New300→800では近似の注意事項を補える。New800→1500では時間比の同文が含まれ、対象特定の悪化候補が生じた。遠い定義が必要だった例ではなく、局所だけで対象を解決できる例である。Same300/800は既知のTaylor展開を長めに再説明し、履歴の理解状態を十分尊重したとは言い切れない。New1500の「以下のいずれか」はliteral/一次評価ともescalation候補。ただし不足というより、存在する選択タグを使い切れない曖昧化であり、追加Contextで解決する証拠ではない。

## Automatic results / Escalation review

24/24保存、24 stop、0 length、0 error。保存requestとPreview・SHA、Marker完全一致、grapheme/window境界、未来Turnなし、Mode/Level、入力/出力文字数の照合PASS。[各Runの事実と全回答](context-correction-v03-data/responses.md)に範囲・割合・量を掲載。

[全24件の追加レビュー記録](context-correction-v03-data/reviews.json)はraw生成結果を変更せず、literal検出と一次読解を区別する。Human reviewは全件pending。

- D/N/1500: literal=true、Codex review=true。「以下のいずれか」。同文の対象を絞れないが、増量すべきとの判断はしない。
- C/N/800: literal=false、Codex review=true。「最初の約束（定義）を参照する必要があります」。literal検出の見逃し候補。Sourceの言い換えでもあり、明示的な追加情報要求とは断定しない。
- 残り22件: literal=false、Codex review=false。falseは回答品質が十分という意味ではない。

再問い合わせ・自動追加・生成し直しは0件。500/1100は未実行。

## Hypotheses / Cross-condition observations

| 仮説 | このPilotでの観察（一次評価） |
|---|---|
| 1 Same300〜800で十分な例が多い | A/Bは対象・前提を保持、Cは履歴の独自定義を利用。ただしC800の条件省略、D300/800の近似の過剰断定があり、一律には言えない。 |
| 2 Newはより広い文脈が必要な例が増える | B300→800で定義が明確化。Cは履歴なしで不足するが1500でも解決せず、「増量すれば十分」の支持にはならない。 |
| 3 New800で十分な例が存在 | A/B/Dで今回必要な対象・前提を観察。Cは不十分。 |
| 4 1500でも改善しない例 | Aは既に300で主要説明が成立、B800→1500は主に短文化、Cは冒頭定義へ届かず改善しない。 |
| 5 増量で別話題を拾う例 | D/N/1500で時間比と空間比の二候補化。1回の観察であり再現頻度は未評価。 |

Sameは全Levelで追加履歴3116文字を含むため、Same300とNew300は同じ総投入量ではない。回答長は146〜705文字で、増量による一方向の長文化はない。B/Newは285→253→146、D/Newは247→375→565。長いほど良いとも短いほど良いとも評価しない。

## Next experiment candidate / Human review pending

人間が回答・選択位置・一次評点を確認した後、必要ならCの遠い定義だけを補う比較、Dの選択箇所表示方法の比較、同一条件の反復によるばらつき確認を次の候補とする。今回は実施しない。最適window、Same/Newの既定値、追加Contextの自動判断は決定しない。**全24件Human review: pending**。

## Interpretation limits

Same/NewというConversation IDをモデルが記憶しているわけではなく、毎Runのmessages配列だけを比較する。Source全文を含む履歴の効果と、それ以前の短いT1–T19の効果はこの実験では分離できない。したがってSameが良くても「過去の理解状態が効いた」とまでは断定できない。

Marker Cの冒頭定義はNew1500のstart834より前にあり、**1500でもその定義へ届かない**。量を増やせば必ず必要前提へ届く設計ではない。反対にA1500はSource上端へ達し、余りを後ろへ再配分する。D1500は下端へ達する。同じLevelでも話題の分布とwindow位置が違う。

単一人工Conversation、4 Marker、各セル1回、固定順。モデル変更もあるためv0.2との数値差を因果効果として扱わない。条件を知っているCodexの一次レビューであり、盲検でも人間評価でもない。誤り・不足を述べず断定する回答はescalation_candidateがfalseでも不十分になり得る。
