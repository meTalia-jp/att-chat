# Att-Chat User Profile Preset Comparison Experiment

実施日: 2026-10-09<br>
実験ID: `att-chat-user-profile-preset-comparison-v0.3`

## 1. 背景

Att-ChatのUser Profileは、回答相手の前提知識、説明量、専門用語の使い方を調整するための補助Contextである。User Profile Strength Experiment v0.2では、Profileの有無による適応は確認できた一方、Weak / Standard / Strongの3段階wrapperは一貫した段階差を作らなかった。

そこで本実験ではwrapper強度を増やす代わりに、用途が異なる3つのProfile本文を仮Presetとして固定し、Profile OFF / Beginner / Practical / Expertで回答戦略が分かれるかを調べた。

## 2. 目的

同じモデル・同じ質問に対して、Profileだけを変更したときに次の差が現れるかを確認する。

- Beginnerが、初出説明、比喩、段階説明、数式抑制を行うか
- Practicalが、BeginnerとExpertの中間的な難易度だけで終わらず、用途、判断、運用上の注意へ展開するか
- Expertが、基礎説明を省き、正式理論、数式、前提条件、例外まで扱うか
- 上記の役割がBusiness / Math / Physics、および2モデルをまたいで識別できるか

モデル能力の順位付けは目的にしていない。

## 3. Ver1.0で想定する仮Profile

### Beginner / 初学者向け

```text
この分野については初学者です。
基礎知識を前提にしすぎず、専門用語は初出時に短く説明してください。
必要に応じて身近な例や比喩を使い、考え方を段階的に説明してください。
数式や専門的な理論名は、理解に必要な場合だけ使用してください。
```

### Practical / 実務系

```text
この分野について基礎知識があります。
基本用語の説明は最小限で構いません。
理論だけでなく、実際にどう使うか、どのような場合に重要かも説明してください。
必要な専門用語や数式は使用して構いませんが、説明の流れを優先してください。
```

### Expert / 専門系

```text
この分野について専門的な知識があります。
基礎的な説明は不要です。
専門用語、数式、標準的な理論名称はそのまま使用してください。
可能であれば、背景となる理論、例外、前提条件、より厳密な説明まで踏み込んでください。
```

3 Profileとも現行ProductionのStandard User Profile wrapperでsystem messageへ変換した。Profile OFFはsystem messageを追加していない。

## 4. 使用モデル

LM Studioのmodel listで確認した完全一致IDは次のとおりである。

- `google/gemma-4-26b-a4b-qat`
- `qwen/qwen3.6-35b-a3b`

LM Studio側のThinking / Reasoning設定はAPIから取得できなかった。各モデル内では試験中に設定を変更していないが、モデル間で同一だったことは確認できない。

Gemmaは全Runでreasoningを別フィールドへ出さず、`reasoning_chars=0`だった。Qwenはreasoningを別フィールドで返した。この差はProfile効果ではなく、モデルまたはruntime設定の差として扱う。

## 5. 使用問題

### Business

> 売上が伸びているのに、会社の現金が減ることがあるのはなぜですか？

### Math

> 平均値と中央値は、どのように使い分ければよいですか？

### Physics

> なぜ熱は高温の物体から低温の物体へ移動するのですか？

問題文は全Profile・全モデルで同一にした。

## 6. 実験条件

2モデル × 3問題 × 4 Profile条件の24 Runを独立に実行した。

| 項目 | 値 |
|---|---:|
| temperature | 0 |
| max_tokens | 4096 |
| streaming | ON |
| usage取得 | ON |
| 自動再試行 | なし |
| timeout | 600秒 |

各RunはProfile system messageと固定質問だけから開始し、前の回答を次のRunへ渡していない。実際にProviderへ渡したrequest objectと保存した `request_snapshot` は同じobjectである。

24 Runすべてが `finish_reason=stop` で完了した。timeout、provider error、再試行はなかった。

## 7. Business結果

### Automatic facts

| モデル | Profile | 回答文字数 | reasoning文字数 | 所要時間 |
|---|---|---:|---:|---:|
| Gemma | OFF | 1,546 | 0 | 52.450秒 |
| Gemma | Beginner | 1,625 | 0 | 37.227秒 |
| Gemma | Practical | 1,947 | 0 | 44.673秒 |
| Gemma | Expert | 2,014 | 0 | 39.450秒 |
| Qwen | OFF | 1,463 | 919 | 52.440秒 |
| Qwen | Beginner | 1,192 | 4,395 | 73.149秒 |
| Qwen | Practical | 1,104 | 4,358 | 71.480秒 |
| Qwen | Expert | 2,292 | 6,089 | 121.830秒 |

### 観察

**Beginner**

- Gemmaは「売上は約束、現金は現実」という対比、カフェとリンゴ、バケツの比喩を使った。
- `売掛金` を「商品を引き渡したが、まだ代金を受け取っていない権利」と初出説明した。
- Qwenも喫茶店の例から始め、売掛金、在庫、資金繰りを短く定義した。
- Qwenには `在庫（ざこ）` という読みの誤記と、本文中に英語の `tied up` が混在した。

**Practical**

- Gemmaは運転資本、CAPEX、ROI、営業・投資・財務キャッシュフローを使い、「健全な先行投資か、危険な売掛・在庫膨張か」を判断する流れへ展開した。
- QwenはCCCを式 `売掛回収日 + 在庫持有日 - 買掛支払日` で示し、営業CF、在庫回転、与信条件、ABC分類、投資シミュレーションという実務対応を挙げた。
- 両モデルとも、単なる中級向け用語説明ではなく、診断指標と対応策を提示した。

**Expert**

- GemmaはDSO、DPO、CAPEX、発生主義と現金主義、収益認識、成長の罠を扱い、簡易Cash Flow式を示した。
- QwenはΔWorking Capital、CCC、DSO/DIO/DPO、FCF、IFRS 15/16、収益の質、業界別前提、Factoring等の例外・緩衝手段まで踏み込んだ。
- Qwen Expertは他Profileより回答長・reasoning量とも明確に増えた。

### 解釈

Businessでは3 Profileの役割が最も明確だった。Beginnerは日常例、Practicalは資金繰り判断と改善策、Expertは会計基準・財務指標・前提条件へ分かれた。Practicalは独立したPresetとして十分な意味を持つ。

## 8. Math結果

### Automatic facts

| モデル | Profile | 回答文字数 | reasoning文字数 | 所要時間 |
|---|---|---:|---:|---:|
| Gemma | OFF | 1,610 | 0 | 34.580秒 |
| Gemma | Beginner | 1,649 | 0 | 37.519秒 |
| Gemma | Practical | 1,961 | 0 | 42.053秒 |
| Gemma | Expert | 1,933 | 0 | 40.137秒 |
| Qwen | OFF | 846 | 1,542 | 33.684秒 |
| Qwen | Beginner | 1,347 | 4,534 | 85.012秒 |
| Qwen | Practical | 1,136 | 4,334 | 73.652秒 |
| Qwen | Expert | 2,740 | 6,053 | 127.659秒 |

### 観察

**Beginner**

- 両モデルとも平均値と中央値の定義、外れ値の意味、年収の簡単な数値例、判断手順を段階的に示した。
- Qwenは「バランスの中心」と「真ん中の位置」という言い換えを使い、計算例を明示した。
- 数式は基本的な加算・除算に留まり、推定理論やロバスト統計へ進まなかった。

**Practical**

- Gemmaは所得、不動産、Web滞在時間、製品寸法を例にし、ヒストグラム・箱ひげ図、外れ値の原因確認、平均と中央値の併記という判断フローを示した。
- Qwenはビジネスレポートと意思決定を明示し、可視化、注記、平均と中央値の差を分布の歪みの信号として使う方法、回帰とロバスト回帰の使い分けまで触れた。
- 両モデルとも用途と判断手順を示したが、GemmaはPositive Skewの式や統計用語が多く、実務Presetとしてやや理論寄りだった。

**Expert**

- Gemmaは歪度、ロバスト性、推定量、正規分布、t検定、Q-Qプロットまで扱った。
- QwenはL1/L2損失、影響関数、崩壊点、漸近分散、相対効率、M-estimator、trimmed mean、weighted median、大規模データ向けquantile algorithmまで展開した。
- Qwen ExpertはProfile間で最大の2,740文字になり、専門的な開始位置が明確だった。

### 精度上の観察

- Gemma OFFの年収例は「1億200万円」と式中の `1200`、算出した平均 `2,500万円` が相互に整合していない。
- Qwen Expertの「中央値がMLEとなる分布」の記述には疑義があり、一般的なLaplace分布の位置母数に関する説明との照合が必要である。

### 解釈

BeginnerとExpertの差は明確だった。Practicalも「可視化→外れ値評価→用途に応じた採用・併記」という作業手順を示し、独立した意味を持つ。ただしGemma Practicalは理論語がやや多く、Profile本文に「判断・報告の具体例を先にする」意図を足す余地がある。

## 9. Physics結果

### Automatic facts

| モデル | Profile | 回答文字数 | reasoning文字数 | 所要時間 |
|---|---|---:|---:|---:|
| Gemma | OFF | 1,217 | 0 | 26.375秒 |
| Gemma | Beginner | 1,460 | 0 | 31.872秒 |
| Gemma | Practical | 1,859 | 0 | 41.938秒 |
| Gemma | Expert | 2,050 | 0 | 43.002秒 |
| Qwen | OFF | 715 | 2,238 | 32.837秒 |
| Qwen | Beginner | 1,135 | 3,824 | 65.892秒 |
| Qwen | Practical | 1,540 | 4,774 | 86.820秒 |
| Qwen | Expert | 2,362 | 6,228 | 120.056秒 |

### 観察

**Beginner**

- Gemmaは粒子の動きをピンポン玉の箱に例え、温度、衝突、エントロピーを3段階で説明した。
- Qwenは「元気な子ども」と「静かな子ども」の比喩を使い、粒子衝突と均一化を説明した。
- 両モデルとも数式を使わず、専門語は初出説明を付けた。

**Practical**

- Gemmaは統計力学とエントロピーの説明に加え、カルノー効率、熱伝導、対流、ヒートシンク、材料熱伝導率へ展開した。
- Qwenは熱交換器、冷却システム、熱機関、ヒートポンプ、断熱、半導体熱管理を表で整理し、温度差、界面熱抵抗、fouling、材料選択などの設計上の論点を示した。
- 両モデルとも工学用途へ展開し、Practicalの独立性は明確だった。
- Gemmaは `S=k_B ln W`、カルノー効率、Fourierの法則まで導入し、実務系としては理論量が多かった。

**Expert**

- Gemmaは状態数、Fourierの法則、Maxwell–Boltzmann分布、逆温度、熱力学極限、局所熱平衡、非平衡Green関数まで扱った。
- QwenはClausius不等式、分配関数、Boltzmann原理、Onsager線形応答、エルゴード性、H定理、負温度、揺動定理、量子・強結合・小系の例外まで展開した。
- Qwen Expertは基礎説明をほぼ省き、前提条件と境界領域を明示した。

### 精度上の観察

- Beginner回答には「低温から高温へは絶対に起きない」「自然界が乱雑になろうとする」といった教育用の強い単純化がある。有限小系の揺らぎや外部仕事を考慮すると、文字どおりの普遍命題ではない。
- Gemma Expertのエントロピー収支式は熱量の符号定義が曖昧で、その後の不等式が通常の `ΔS=-Q/T_high+Q/T_low` と整合していないように読める。
- Qwen Expertは広範な例外を扱ったが、一部に日本語以外の文字が混ざり、負温度・量子系の記述は専門家レビューが必要である。

### 解釈

PhysicsではProfile差が最も階層的だった。Beginnerは比喩、Practicalは熱設計・冷却・効率、Expertは統計力学・非平衡・例外へ移った。Practicalは独立しているが、Gemmaでは専門理論の比重が高く、想定する実務ユーザーによっては難しすぎる。

## 10. Beginner比較

### 共通して確認できたこと

- 3題材すべてで、定義、初出説明、段階構造、具体例または比喩が増えた。
- 数式は基本計算以外ほぼ抑制された。
- Businessではカフェ・リンゴ・バケツ、Mathでは年収例、Physicsではピンポン玉・子どもの比喩が使われた。
- QwenではOFFより回答が短くなるBusinessと、長くなるMath / Physicsがあり、Beginnerが単純に回答を長文化するPresetではない。

### 課題

- 初学者向けの言い換えに誤記や過剰な単純化が混入した。
- GemmaのOFFも元から説明的で、Beginnerとの差が主に比喩と構造に留まる題材があった。

**判断:** BeginnerはOFFとの差と独自の説明戦略が確認でき、Ver1.0の仮Preset候補として成立する。

## 11. Practical比較

### 共通して確認できたこと

- BusinessではCF区分、CCC、ROI、回収・在庫・投資の判断と改善策へ展開した。
- Mathでは可視化、報告時の併記、意思決定、分析手法の選択へ展開した。
- Physicsでは熱交換、冷却、断熱、熱機関、材料・半導体設計へ展開した。
- 両モデル・全題材で「どこで使うか」「何を判断するか」が回答に現れた。

### 課題

- GemmaのMath / Physicsでは数式と理論説明が増え、Expertとの境界が弱い部分があった。
- QwenではPracticalがBeginnerより短いBusiness / Mathもあり、回答量ではなく内容の方向で区別する必要がある。
- Profile本文の「必要な専門用語や数式は使用してよい」が、モデルによっては理論を広く展開する許可として強く働いた。

**判断:** Practicalは単なる中間難易度ではなく、用途・判断・設計への独立した展開を確認できた。仮Preset候補にはできるが、Ver1.0前に「理論は判断に必要な範囲に留め、具体的な利用・注意点を優先する」方向の文面調整を比較検証する価値がある。

## 12. Expert比較

### 共通して確認できたこと

- 基礎的な用語説明を省き、正式名称、数式、前提条件、例外へ早く移った。
- Businessでは財務指標・会計基準、Mathではロバスト統計・推定理論、Physicsでは統計力学・非平衡・境界領域を扱った。
- Qwen Expertは全題材で回答長・reasoning量が大きく増えた。
- GemmaでもExpertは各題材で最長またはほぼ最長となった。

### 課題

- 専門性が上がるほど、数式の符号、分布名、例外条件など、もっともらしい細部の誤りを人間が見落としやすくなる。
- Expertは「正確性保証」ではなく、「説明開始位置と内容範囲を専門側へ移すPreset」として扱う必要がある。

**判断:** ExpertはOFF・Beginner・Practicalとの差が明確で、Ver1.0の仮Preset候補として成立する。

## 13. Profile OFFとの差

### 回答文字数の3題平均

| モデル | OFF | Beginner | Practical | Expert |
|---|---:|---:|---:|---:|
| Gemma | 1,457.7 | 1,578.0 | 1,922.3 | 1,999.0 |
| Qwen | 1,008.0 | 1,224.7 | 1,260.0 | 2,464.7 |

### 観察

- Gemma OFFは元から長く説明的で、Businessでは対策、Mathでは可視化、Physicsではエントロピーまで含んだ。
- Qwen OFFは比較的短く、Profile適用後の戦略差がより見えやすかった。
- Beginnerは両モデルで比喩・初出説明を増やした。
- Practicalは両モデルで用途・判断へ広がった。
- Expertは両モデルで正式理論・数式・前提・例外が増えた。

Profileは単なる長さ指定として働いたのではない。QwenのBusiness / MathではPracticalがBeginnerより短い一方、内容はより意思決定寄りだった。

## 14. モデル間の違い

### Gemma

- reasoningを別フィールドへ出さず、全条件を26〜52秒で完了した。
- OFFでも丁寧で長い説明を返し、Beginnerとの差が小さい題材があった。
- Practicalで実務例と同時に理論・数式を広く展開する傾向があった。
- Expertへの移行は確認できたが、Qwenほど回答長が急増しなかった。

### Qwen

- Profile条件でreasoning量と所要時間が増加した。
- Beginnerは比喩・段階説明、Practicalは判断手順、Expertは理論深度という分化が明確だった。
- Expertでは回答長がBusiness 2,292、Math 2,740、Physics 2,362文字へ増えた。
- 専門的な詳細が増える一方、用語・数式の正確性を別途確認すべき箇所も増えた。

LM Studio内部設定がモデル間で同一か確認できないため、速度・reasoning量からモデル能力を順位付けしない。

## 15. 各Profileが独立した意味を持つか

| Profile | 独立性 | 根拠 |
|---|---|---|
| Beginner | 明確 | 初出説明、日常例、比喩、段階構造、数式抑制 |
| Practical | 確認できた | 診断指標、判断フロー、運用策、設計・応用への展開 |
| Expert | 明確 | 基礎説明省略、正式理論、数式、前提、例外・境界領域 |

Practicalは3題材すべてで実務方向の追加情報を出したため、「少し詳しいBeginner」に留まらなかった。ただしGemmaでは専門説明との重なりがあり、Profile本文の調整余地が残る。

## 16. Ver1.0の仮Presetとして採用可能か

**BeginnerとExpertは、そのまま仮Preset候補にできる。Practicalは役割の独立性を確認できたため候補に含められるが、文面を再比較した上での条件付き候補とする。**

推奨する現時点の扱いは次のとおりである。

- Beginner: 採用候補
- Practical: 採用候補。ただし理論量を抑えて用途・判断優先をより明示する改訂候補を比較する
- Expert: 採用候補
- OFF: Profileを使わない基準として維持

これは正式UI実装や永続化の決定ではない。今回確認できたのは、3 Profileがモデル出力へ異なる方向性を与えることまでである。

## 17. 問題点・限界

- 各条件は1 Runだけであり、条件内の再現性を統計的に確認していない。
- 題材は3問で、法務、医療、コード生成、文章作成などへ一般化できない。
- temperature 0でもruntimeが完全決定的とは限らない。
- LM StudioのThinking / Reasoning設定をAPIから取得できず、モデル間の厳密な生成条件差を把握できない。
- Profile適応度と回答正確性は別である。Mathの計算不整合、専門分布名の疑義、Physicsの符号・単純化などが観察された。
- OFF回答が元から説明的・実務的な場合、Profile差は小さくなる。
- 回答文字数は戦略差の補助指標であり、品質や実用性そのものではない。
- Blindな第三者評価は行っていない。
- Production会話履歴、System Prompt、Marker Context等との同時利用は今回検証していない。

## 18. 今後の検証候補

1. 各条件を複数回実行し、Profileごとの再現性を確認する。
2. Practicalの改訂案を、現行文とA/B比較する。
3. コードレビュー、障害対応、文章要約など、実務Presetの価値が出やすい題材を追加する。
4. 回答をProfile名なしで第三者に提示し、どのPresetか識別できるかblind評価する。
5. 正確性、説明適合、実用性を別軸で人間評価する。
6. Productionの既存system contextと併用した場合に同じ差が残るか確認する。

## Appendix / 再検証用資産

- [実測Run JSON](./user-profile-preset-comparison-v03-data/runs.json): request snapshot、Profile本文、system message、回答、usage、diagnostics、時刻
- [回答全文](./user-profile-preset-comparison-v03-data/answers.md): 24条件の最終回答
- `src/laboratory/user-profile-preset-v03.ts`: model、Profile、質問、24条件matrix
- `scripts/run-user-profile-preset-v03.ts`: LM Studio実行harness
- `scripts/write-user-profile-preset-v03-appendix.ts`: 回答全文Appendix生成
- `tests/user-profile-preset-experiment.test.ts`: matrix、本文固定、Standard wrapper、request構造の検証
