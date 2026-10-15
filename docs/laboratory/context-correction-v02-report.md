# Context Correction v0.2 Report

## Purpose / Fixture

2026-09-29。長いSource Turnの局所文脈と全文を比較するLab専用実験。最適windowや本番採用を決定しない。Human review: pending。

[固定fixture](../../src/laboratory/context-correction/long-fixture.ts) `physics-long-32-v2` は人工32 Turn、User/Assistant交互。系の境界→運動量とエネルギー→台車とばね→撮影→無次元量→近似を積み上げ、T20で一つの長い説明へまとめる。T20は**2650 UTF-16**、14段落。以降のTurnはfixture閲覧用のみで送信しない。

Long Sourceの順序: 実験の約束・台帳Qの定義 → 慣性系 → 運動量 → 系の境界 → 時間分解能Δ → 測定上の注意 → 時間比 → エネルギー移動 → 台帳Qへの参照 → 摩擦の補足 → 空間近似ε → 高次項の条件 → 別の保存量 → 読み方。保存と小さい比を異なる対象で反復する。

| Marker | T20 offset [start,end) | source text | expected topic / required prerequisite | irrelevant sections / ambiguity |
|---|---|---|---|---|
| A | 510–520 | これは保存されます。 | 二台の総運動量P、合外力ゼロ | 撮影・Q・近似は不要。局所で完結 |
| B | 1208–1221 | この比を十分小さくします。 | Δ=フレーム間隔/振動周期、少し前の定義 | Q・空間近似は不要。300では定義外、800で含む |
| C | 1584–1594 | これは保存されます。 | Q=二台の並進運動＋ばねの弾性位置エネルギー、摩擦/外部仕事なし | 測定・自由粒子は不要。冒頭の独自記号定義は800でも範囲外 |
| D | 2128–2141 | この比を十分小さくします。 | ε=abs(x)/ℓ、高次項との比較 | Δ・Qは不要。Bと同文だが別の対象 |

質問は全Markerで「質問です。これはどういう意味ですか？」に固定。metadataの期待話題・必要前提・無関係箇所・曖昧さはモデルへ送らない。外部教材の転載ではなく独自fixture。同じ物理の基本事項は[v0.1で照合した資料](context-correction-v01-report.md)を引き継ぐ。

## Conditions / Window contract

- A: Marker Focusと質問だけ、Context0。windowなし。
- B: Marker前150＋後150 UTF-16を基本とする。Markerを加えて310または313文字。
- C: Marker前400＋後400 UTF-16を基本とする。Markerを加えて810または813文字。
- D: Source T20全文2650文字。
- 300/800は**前後合計、Marker本文を除いた予算**。既存Mode Bの定義に合わせた。B/Cは全文にならない。
- BはMode B既存builderをそのまま再利用。Cは同builderの1000予算でanchor検証した後、Lab wrapperで800へ狭める。端の不足分のみ反対側へ配分、grapheme境界へ内側丸め。UTF-16半開区間、Marker完全包含。
- B/C/Dは選択箇所に「【選択箇所開始】」「【選択箇所終了】」を挿入。同じ引用が複数ある全文でもどれが対象かを明示するため。タグとFocus重複はContext文字数・割合には含めず、Input総量には含める。
- 前Turn/後続Turnは一切入れない。Source内のMarker以降は含む（今回の比較対象）。断片の文頭/文末が文途中でもgraphemeは切らない。

## Model / Execution

v0.1と同じ `unsloth/gemma-4-12b-it-qat`、temperature0、max_tokens2048、stream=true。system promptもv0.1の固定文字列を再利用。既存LMStudioProvider経由のlocalhost:1234への独立したsystem+user、各セル最初の1回答。A→DのMarker順、各A→D条件順。前回答は持ち越さない。seed/サーバー内部設定・モデルファイルhashは固定保証していない。

送信前Previewは `Marker Quick Action Prototype → Run → Context Correction v0.2 — Long Source Preview`。Source長、window両端、使用割合、Marker offset、モデル条件、最終送信文を表示する。UIは送信せず、Lab専用CLIで実行する。

```powershell
node --experimental-strip-types src/laboratory/context-correction/long-run.ts docs/laboratory/context-correction-v02-rerun
# preview.json確認後。既存結果のない新しい出力先を使う
node --experimental-strip-types src/laboratory/context-correction/long-run.ts docs/laboratory/context-correction-v02-rerun --execute
node --experimental-strip-types src/laboratory/context-correction/long-report.ts docs/laboratory/context-correction-v02-rerun
```

既存結果があれば送信前停止。通常testはモデル不要。保存結果は実験専用JSONであり、本番Run schemaを拡張しない。

## Automatic / factual

[送信Preview](context-correction-v02-data/preview.json)と個別request/回答JSONを保存。[投入量と全回答](context-correction-v02-data/responses.md)は保存データから生成する。request SHA、現在Previewとの一致、Marker一致、grapheme境界、Source外混入なし、他Turnなし、文字数/割合、回答長、error、finish_reasonを照合する。全Run Human review: pending。

## Codex first review

主観の一次評価。○は対象/必要前提を確認、△は部分的、×は特定できず。採用スコアではない。Context量/回答長はUTF-16実測。冗長性は長さだけでなく質問への関連で判断する。

### Marker A（局所で完結）

| 条件 | 対象特定 | 前提十分 | 別話題混入 | 冗長性 | Context量 / 回答長 |
|---|---|---|---|---|---|
| A | × データ保存 | × | 情報保存の候補列挙 | 高め | 0 / 317 |
| B | ○ 総運動量P | ○ 合外力ゼロ | なし | 低い | 310 / 216 |
| C | ○ 同上 | ○ | なし | 低い | 810 / 247 |
| D | ○ 同上 | ○ | なし | 単位等の補足が増える | 2650 / 317 |

Bで質問への説明は成立しているように見える。C/Dに明確な内容上の改善は見えない。Dは単位の補足を増やすが、不要な撮影やQへは移らない。既知のF=maを再説明していない。Fullが常に悪いという結果でもない。

### Marker B（少し前に定義）

| 条件 | 対象特定 | 前提十分 | 別話題混入 | 冗長性 | Context量 / 回答長 |
|---|---|---|---|---|---|
| A | × 一般的な比の語義 | × | 技術一般へ広がる | 高め | 0 / 346 |
| B | △ 時間標本の比 | △ 分母に「周期または変化の速さ」 | なし | Cより繰り返し多い | 313 / 371 |
| C | ○ Δの定義通り | ○ | なし | 簡潔 | 813 / 198 |
| D | △ 二つの意味のいずれかと述べる | △ 時間比は正しい | 別の比も候補化 | 途中終了で比較制限 | 2650 / 223 |

Bは定義を含まなくても周辺から時間測定だと推測した。「局所では必ず誤認」という想定は支持されない。ただし「変化の速さ」を分母候補にしたため次元が曖昧。Cは明示定義を含み、この曖昧さが消えた。Dは対象タグがあるにもかかわらず「2つの異なる意味のいずれか」と述べ、時間側の説明の途中で`length`終了した。空間側を実際に説明し終えたわけではないので、**別話題混入は候補化まで確認**。223文字を「簡潔な良回答」と評価しない。

### Marker C（冒頭の前提）

| 条件 | 対象特定 | 前提十分 | 別話題混入 | 冗長性 | Context量 / 回答長 |
|---|---|---|---|---|---|
| A | × 情報保存 | × | 情報保持へ逸れる | 中 | 0 / 155 |
| B | △ 台帳Qとエネルギー合計 | △ 正確な構成・条件なし | なし | 適度 | 310 / 273 |
| C | △ 台帳Qの合計 | △ 各項の定義なし | なし | 短いが不十分 | 810 / 145 |
| D | ○ Qの具体的定義 | ○ 摩擦/空気抵抗/外部仕事条件 | なし | 必要な補足 | 2650 / 318 |

Bは近傍のエネルギー移動から概略を推測できたが、台車二台と理想ばねの正確な範囲・条件を示していない。Cも「各項の合計」の言い換えに留まる。Dは冒頭の定義と条件を明示し、Fullによる改善が観察された。これはQのような独自記号を遠くで定義した今回の事例であり、全文一般の必要性を証明しない。

### Marker D（同文・別対象）

| 条件 | 対象特定 | 前提十分 | 別話題混入 | 冗長性 | Context量 / 回答長 |
|---|---|---|---|---|---|
| A | × どの比か不明 | × | 技術一般の説明 | 高め | 0 / 337 |
| B | ○ 空間のε | ○ 係数/二次項の留保あり | Δとの区別のみ | 長め、要約の反復あり | 313 / 665 |
| C | ○ 空間のε | △ 高次項の留保なし | Δとの区別のみ | 簡潔 | 813 / 308 |
| D | ○ 空間のε | △ 高次項の留保なし | Δとの区別のみ | 無次元性を補足 | 2650 / 342 |

B/C/Dとも時間のΔへ対象を誤移動しなかった。Δへの言及はSourceが求める区別であり、無関係な話題への牽引とは数えない。Bは高次項・二次項消失の留保を保持するが長い。C/Dは意味の説明には合うものの、近似の成立条件を省略。DがBより多くの情報を保持したとは言えない。v0.1同様、入力を増やしても必要前提が単調に増えるわけではない。F=maの基礎講義へ戻る回答はなかったが、Bの三段落は今回の短い質問には長めに見える。

## Hypotheses / Findings

1. Marker onlyよりlocalが対象特定に有利: 今回4箇所で支持する観察。ただし曖昧な引用を意図的に選んだ。
2. 300〜800程度で十分なケース: AのB、BのC、DのB等で観察。Dでは簡潔さと留保の保持が別評価になる。
3. Fullでも改善しない: AではB/Cと主要説明が同じ。DもFullが明らかに上回らない。
4. Fullで無関係な話題混入: B/D Runで二つの解釈を候補化。途中終了のため完成回答の誤混入とは断定しない。他のFull3件では明確な別話題牽引なし。

Fullが必要そうだったのはCの冒頭定義。Fullの悪化候補はBの対象の再曖昧化とlength終了。Context量と回答長は単調ではない（D/B665→D/C308→D/D342）。局所window不足はBの比の定義、Cの合計内訳/条件に現れた。全条件で一般語義から始める必要はなく、既知内容の再説明の多寡はSource量だけでは説明できない。

## Limitations / v0.1 comparison

v0.1は短いSourceがBに全文入った。v0.2では初めて長いSourceの約12%/31%/100%を比較する。4 Markerは**同一T20**の異なる位置であり、4つの独立した会話事例ではない。特定の教材・曖昧な表現を意図的に選んだ単一モデル各1回の探索実験。条件順のランダム化や反復はしていない。回答長と品質は同義でない。

選択タグにより引用位置は明確にしたが、その補助表記の効果は独立評価していない。A同士ではA/CとB/Dがそれぞれ同一requestとなり、差があれば文脈差でなく生成の揺れとして扱う。語義からの推測と実際の前提継承も区別する。

Allowed: Lab専用fixture/wrapper/Preview/CLI/結果/専用tests。Excluded: 本番Chat/Question Keep、DB/API、Run schema、既存ContextBuilder変更、前後Turn追加、要約/retrieval、引継ぎ、本番採用。Human review pending。

16 Run取得、API error0、stop15件/length1件（Marker B・条件D）。同じ2048上限を維持し、打ち切りを隠す再生成はしていない。B/Dのreasoning_charsは7336、表示回答223文字。token usageはnullなので内訳や打ち切り原因の詳細は断定できない。全16件のAutomatic照合PASSは「回答品質PASS」とは別。

次の実験候補: 人間評価後、今回固定条件の反復と順序変更、同文の位置表示の比較、別の長いSourceでの追試。打ち切りの影響を調べるなら全条件共通の上限を別実験として設定する。今回はいずれも実施せず、最適windowを決めない。

## Validation / Browser

- npm test: 270件、268 PASS / 2 SKIP / 0 FAIL（Lab回帰含む）。typecheck/build/diff checkもPASS。最初のtypecheckでfixtureのfinalized_at不足を検出し修正済み。モデルへの送信文・offsetは変化なし。
- 専用tests: Source長、全4 Marker、window完全包含・Source端・結合文字/emoji境界・不正anchor拒否、期待する定義の範囲内外、選択タグ、モデル条件固定を確認。
- long-report.tsで全16保存requestと現在Previewの一致・SHA・範囲・割合を照合。length1件は失敗を隠さず表示。
- 実ブラウザ: localhost:5190の新タブで既存Experiment → Run → v0.2 Previewを開く。A/補正なしからB/Cへ切替しSource2650、window808–1621、Included813/30.68%、Marker1208–1221、最終送信文の変化を確認。全16組合せの手動巡回はしていない。
- 旧タブは操作が反映されず、Viteを再起動して新タブで確認した。UI-onlyの既存「APIがありません」はRun記録APIの案内で、今回のPreview/CLI生成には影響しない。

今回の追加: long-fixture.ts / long-experiment.ts / LongPreview.tsx / long-run.ts / long-report.ts / tests/context-correction-long.test.ts / 本Reportとv02-data。更新: Preview.tsxの入口、primary documentの継続記録。既存dirty差分を保持し、他機能は変更していない。
