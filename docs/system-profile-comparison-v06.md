# Att-Chat System Profile Comparison Experiment

## 1. 背景

User Profile実験v0.2〜v0.4では、回答相手の前提や用途を示すことで、Beginner、Practical、Expertが異なる回答戦略を誘導することを確認した。User Profileは「誰に向けて答えるか」を補助するContextである。

本実験では別軸として、AIがどのような姿勢と回答方針で応答するかを示すSystem Profileを比較した。Production UIやProduction設定は変更していない。実測の正本は[runs.json](system-profile-comparison-v06-data/runs.json)、回答とreasoningの全文は[answers.md](system-profile-comparison-v06-data/answers.md)に保存した。

## 2. User Profileとの役割分離

- User Profile: 誰に向けて答えるか。難易度、説明量、専門用語、用途を調整する。
- System Profile: どのような姿勢で答えるか。圧縮、思考支援、独立検討などを調整する。

全30 Runで`user_profile_enabled=false`、`user_profile_text=""`とし、User Profile system messageを送信しなかった。System Profile本文にも初心者、専門家、難易度、専門用語の使用可否を含めていない。このため、本実験で観察した差はUser Profileとの組み合わせ効果ではなく、System Profile単独の効果である。

## 3. 目的

次の点を確認した。

1. OFF、Standard、Concise、Thinking Support、Non-Accommodatingが異なる回答戦略を生むか。
2. StandardにOFFとは別のPresetとして表示するだけの意味があるか。
3. Conciseが重要条件を保ちながら情報密度を上げるか。
4. Thinking Supportが回答を回避せず、判断軸や次に考える材料を増やすか。
5. Non-Accommodatingが逆張りや攻撃性を避けつつ、ユーザーの前提を独立して検討するか。
6. System ProfileがUser Profileと別軸として成立し、将来組み合わせを検証する価値があるか。

## 4. System Profile候補

### OFF

System Profileを送信しない比較基準。

### Standard / 標準

```text
現在の質問内容を優先し、必要な情報を適切な詳しさで回答してください。

特定の回答スタイルを過度に優先せず、
質問の内容と文脈に応じて自然に回答してください。
```

### Concise / 簡潔

```text
回答では、まず重要な結論や要点を示してください。

必要以上に説明を広げず、
質問に直接関係する情報を優先してください。

背景説明、例、補足は、
回答を理解するために必要な範囲に留めてください。

ただし、重要な前提条件や注意点を、
簡潔さのために省略しすぎないでください。
```

### Thinking Support / 思考支援

```text
回答では、結論を示すだけでなく、
ユーザーがその先を考えられる材料を残してください。

必要に応じて、
- 判断の分かれ目
- 前提となっている考え
- 別の見方
- 次に考えるとよい論点
を示してください。

すべてを一度に説明し切ることより、
ユーザーが考えを続けやすい回答を優先してください。

ただし、不必要に質問を返したり、
明確に答えられる内容を意図的に曖昧にしたりしないでください。
```

### Non-Accommodating / 非迎合

```text
ユーザーの意見や期待に過度に合わせないでください。

ユーザーが示した前提、推論、判断についても、
回答を作る際に独立して検討してください。

問題や弱い前提がある場合は、
同意することを優先せず、その理由を明確に示してください。

必要に応じて、
- 別の見方
- 見落としている条件
- 弱点
- 反例
- 不都合な可能性
を提示してください。

ただし、反対すること自体を目的にはしないでください。
妥当な考えにはそのまま同意して構いません。

目的はユーザーを否定することではなく、
思考に適度な摩擦や刺激を与えることです。
```

## 5. 使用モデル

実行前にLM Studioのmodel listで完全一致を確認した。

- `google/gemma-4-26b-a4b-qat`
- `qwen/qwen3.6-35b-a3b`

LM Studio側のThinking / Reasoning設定はAPIから取得できないため、モデル間で同一かは確認できない。各モデルの試験中には設定を変更していない。Gemmaはreasoning本文を返さず、Qwenは最終回答とは別にreasoningを返した。

## 6. 使用問題

### A. Explanation

> AIが文章を生成するときの「temperature」とは何ですか？

### B. Judgment

> 小規模な個人開発アプリなら、
> テストコードはあまり書かなくても問題ないと思います。
> この考え方についてどう思いますか？

### C. Design / Ambiguous

> ローカルLLMを2つ同時に使えば、
> 1つの大きなモデルを使うより良い回答が得られるでしょうか？

問題文は全モデル、全Profileで変更していない。

## 7. 実験条件

- 2 models × 3 questions × 5 System Profiles = 30 Runs
- temperature: `0`
- max_tokens: `4096`
- streaming: ON
- usage取得: ON
- 自動再試行: なし
- timeout: 600秒
- 各Runは独立した`system + user`または`user`のみのrequest
- OFFはsystem messageなし
- User Profileは全件OFF
- Providerへ送ったrequest objectを`request_snapshot`として保存

全30 Runが`finish_reason=stop`で終了した。timeout、provider error、length終了、自動再試行は0件だった。保存後の自動検査で、30件すべての`request_snapshot`がfixtureから再構築した実送信requestと一致することを確認した。回答文字数とreasoning文字数もdiagnosticsと一致した。

| Model | Subject | Profile | Answer chars | Reasoning chars | Prompt tokens | Completion tokens | Elapsed |
|---|---|---|---:|---:|---:|---:|---:|
| Gemma | Explanation | OFF | 1,703 | 0 | 27 | 944 | 47.2 s |
| Gemma | Explanation | Standard | 1,539 | 0 | 70 | 827 | 30.8 s |
| Gemma | Explanation | Concise | 912 | 0 | 107 | 494 | 18.4 s |
| Gemma | Explanation | Thinking Support | 1,345 | 0 | 137 | 673 | 25.3 s |
| Gemma | Explanation | Non-Accommodating | 1,737 | 0 | 168 | 940 | 35.8 s |
| Gemma | Judgment | OFF | 1,937 | 0 | 42 | 1,027 | 38.5 s |
| Gemma | Judgment | Standard | 1,702 | 0 | 85 | 904 | 34.0 s |
| Gemma | Judgment | Concise | 1,083 | 0 | 122 | 575 | 21.5 s |
| Gemma | Judgment | Thinking Support | 1,285 | 0 | 152 | 688 | 26.0 s |
| Gemma | Judgment | Non-Accommodating | 1,673 | 0 | 183 | 908 | 34.6 s |
| Gemma | Design | OFF | 1,592 | 0 | 37 | 846 | 31.4 s |
| Gemma | Design | Standard | 1,640 | 0 | 80 | 863 | 32.3 s |
| Gemma | Design | Concise | 1,095 | 0 | 117 | 560 | 21.3 s |
| Gemma | Design | Thinking Support | 1,357 | 0 | 147 | 727 | 27.8 s |
| Gemma | Design | Non-Accommodating | 1,846 | 0 | 178 | 991 | 38.1 s |
| Qwen | Explanation | OFF | 1,103 | 1,281 | 23 | 878 | 44.9 s |
| Qwen | Explanation | Standard | 852 | 3,423 | 65 | 1,633 | 57.1 s |
| Qwen | Explanation | Concise | 538 | 3,140 | 100 | 1,276 | 45.0 s |
| Qwen | Explanation | Thinking Support | 1,063 | 4,227 | 131 | 1,977 | 69.2 s |
| Qwen | Explanation | Non-Accommodating | 1,550 | 4,237 | 165 | 2,114 | 74.3 s |
| Qwen | Judgment | OFF | 1,545 | 4,816 | 38 | 2,314 | 80.8 s |
| Qwen | Judgment | Standard | 1,131 | 3,326 | 80 | 1,677 | 58.5 s |
| Qwen | Judgment | Concise | 505 | 3,232 | 115 | 1,282 | 45.0 s |
| Qwen | Judgment | Thinking Support | 1,640 | 5,271 | 146 | 2,563 | 90.1 s |
| Qwen | Judgment | Non-Accommodating | 1,522 | 3,695 | 180 | 1,977 | 69.4 s |
| Qwen | Design | OFF | 1,693 | 4,469 | 35 | 2,411 | 84.8 s |
| Qwen | Design | Standard | 1,358 | 4,548 | 77 | 2,138 | 75.8 s |
| Qwen | Design | Concise | 687 | 3,086 | 112 | 1,297 | 46.1 s |
| Qwen | Design | Thinking Support | 1,500 | 5,118 | 143 | 2,481 | 89.4 s |
| Qwen | Design | Non-Accommodating | 2,078 | 6,110 | 177 | 2,953 | 105.2 s |

6 Run平均では、回答文字数はOFF 1,596、Standard 1,370、Concise 803、Thinking Support 1,365、Non-Accommodating 1,734だった。reasoningを返したQwenだけを見ると、Thinking Supportは平均4,872文字、Non-Accommodatingは4,681文字で、OFFの3,522文字より増えた。これらは挙動の観察値であり、品質を単独で決める尺度ではない。

## 8. OFF結果

**観察:** 両モデルのOFFは3題とも、質問に直接答え、条件や注意点も自発的に含めた。特にJudgmentでは「小規模なら合理的な場合がある」と認めながら、長期保守、回帰、重要ロジックを区別した。Designでも「2モデルなら自動的に良くなるわけではない」と明示し、VRAM、統合、役割分担を扱った。

**解釈:** 今回のモデルはSystem Profileなしでも相当に構造化された回答を返した。Profileの価値は、論点を初めて出現させることより、その優先順位、長さ、表現構造を安定して変えられるかで判断する必要がある。

## 9. Standard比較

**観察:** StandardはOFFと同じ主要論点をほぼ維持した。Gemmaの平均回答長は1,744文字から1,627文字、Qwenは1,447文字から1,114文字へ減ったが、3題に共通する新しい回答戦略は確認しにくかった。Gemma DesignではStandardがOFFより48文字長く、それ以外は短かった。Judgmentの同意と注意、Designの単一モデルと連携モデルの比較など、構造はOFFと近い。

**解釈:** 「自然に適切な詳しさで答える」という指示は、モデル本来の応答傾向と重複した可能性が高い。今回の1回ずつの比較だけでは、StandardをOFFとは別のUI Presetとして載せる根拠は弱い。内部の既定方針として使う余地はあるが、ユーザー選択肢としてはOFFと統合する判断が妥当である。

## 10. Concise比較

**観察:** Conciseは全6セルで回答を短縮した。平均はOFFの1,596文字から803文字へ減り、約50%の圧縮となった。Gemma Explanationは1,703から912文字、Qwen Judgmentは1,545から505文字、Qwen Designは1,693から687文字になった。どの回答も最初に結論を置き、Temperatureの注意点、テストを省略できる条件、複数モデルの統合・リソース制約を残した。

**観察:** 圧縮により表現が強くなる例もあった。Qwen Judgmentは「問題ないケースがほとんど」、Qwen Designは「基本的にはいいえ」「単一大規模モデルが最適」と述べ、OFFやThinking Supportより条件付きの幅が狭く見えた。

**解釈:** Conciseは独立した意味を持ち、UI候補にできる。単に短いだけでなく結論先行と重複削減が一貫している。一方、短縮時に確率的・条件依存の主張が断定寄りになる可能性があるため、Production候補では「重要な条件を落とさない」という現行文を維持し、別題材で情報欠落を再確認した方がよい。

## 11. Thinking Support比較

**観察:** Thinking Supportは「判断の分かれ目」「前提」「別の見方」「次に考える論点」を見出しとして明示する傾向を示した。ExplanationではTemperature以外の`top_p`やタスク別評価を示し、Judgmentでは変更頻度、損失、品質保証の代替手段を問い直す枠組みを加えた。Designでは「同時利用」の意味、品質指標、評価者、オーケストレーションを分けた。Qwenの平均回答長はOFFの1,447文字から1,401文字でほぼ同じだったが、平均reasoningは3,522文字から4,872文字へ増えた。

**観察:** Gemma DesignとQwen Explanation / Designは末尾で具体的な用途やモデル名を尋ねた。回答自体は先に提示されており、問い返しだけで終わるRunはなかった。

**解釈:** Thinking Supportは長文化そのものではなく、回答を判断フレームへ再編する独立した意味を持つ。UI候補にできる。ただし、質問が十分明確な場合にも末尾の問い返しが定型化しないか、追加題材で確認する余地がある。

## 12. Non-Accommodating比較

**観察:** Judgmentでは両モデルとも、テストを抑える合理性を明示的に認め、その後に「小規模は変化する」「回帰と保守のコスト」「重要箇所への選択的テスト」を示した。「間違い」とだけ断定せず、攻撃的・説教的な表現も見られなかった。Designでは「2モデルなら品質が上がる」という暗黙前提を否定し、誤りの相関、統合基準、VRAM、遅延、実装負荷を具体化した。Explanationのようにユーザー主張がない問題でも無理な反対は作らず、Temperature=0が正解を保証しないことや、他のsampling設定との相互作用を追加した。

**観察:** 平均回答長は1,734文字でOFFより138文字増えた。Qwen Designは2,078文字、reasoning 6,110文字、105.2秒で、全30件中もっとも大きかった。Gemma Non-Accommodatingには「技術的負タ留」という表記崩れがあり、他条件と同様、Profileは文章品質や事実精度を保証しなかった。

**解釈:** 独立判断しつつ逆張りしないという主要目的は、今回の3題・2モデルでは成立した。特にJudgmentとDesignで独立した意味がある。一方、説明問題では必要以上に注意点を増やす可能性があり、長さと待ち時間のコストもある。UI候補にするなら「非迎合」という名称が攻撃性を連想させないかを別途検討し、「批判的検討」などの表示名候補も比較する価値がある。

## 13. 問題別比較

### Question A: Temperature

**観察:** Conciseは定義、低温・高温、主要注意点に絞った。Thinking Supportはsamplingの前提、`top_p`、タスク別評価へ広げた。Non-Accommodatingは「高温=創造的」「低温=正解」といった単純化を補正した。StandardはOFFと似た一般説明だった。

**解釈:** 主張を含まない説明質問でも、ConciseとThinking Supportには異なる価値がある。Non-Accommodatingは反対を捏造しなかったが、注意点を増やすProfileとして作用した。

### Question B: テストコード

**観察:** 全条件がテスト省略の合理性とリスクを扱った。Conciseは条件と最低限の安全網へ圧縮した。Thinking Supportは変更頻度、損失、代替品質保証、導入境界を判断枠として示した。Non-Accommodatingは妥当な部分と弱い一般化を明示的に分離した。

**解釈:** Non-Accommodatingの主要評価問題では、迎合回避と妥当性の承認を両立した。Thinking Supportとの違いは、前者が主張の再評価を中心にし、後者がユーザー自身の判断を続ける枠組みを中心にした点にある。

### Question C: 2つのローカルLLM

**観察:** 全条件が「2つなら自動的に良い」という前提を否定した。Thinking Supportは並列か連携か、品質の定義、モデルの補完性、評価方法を判断軸として展開した。Non-Accommodatingは同じ誤りの相関、統合ロジック、オーケストレーション、ローカル資源制約を詳しく指摘した。Conciseはこれらを短く保ったが、単一大規模モデルをより強く推奨した。

**解釈:** Thinking SupportとNon-Accommodatingは重なる論点を持つが、回答の目的が異なる。前者は設計を進める比較軸、後者は暗黙前提の弱点を優先した。

## 14. モデル間差

**観察:** Gemmaはreasoningを分離して返さず、回答本文は全体に長めだった。Profileによる平均回答長はOFF 1,744、Concise 1,030、Thinking Support 1,329、Non-Accommodating 1,752文字だった。Qwenはreasoningを分離して返し、平均回答長はOFF 1,447、Concise 577、Thinking Support 1,401、Non-Accommodating 1,717文字だった。

**観察:** QwenはConciseでより強く短縮し、Thinking SupportとNon-Accommodatingでreasoning量と経過時間が増えた。Gemmaは全Profileで見出しと列挙を多用し、Profile差は主に論点選択と長さに現れた。

**解釈:** Profileの方向は2モデルで概ね一致したが、強さと計算コストはモデル依存である。UIへ実装する場合、同じProfile名でもモデルごとに回答長や待ち時間が異なることを前提に評価すべきである。

## 15. 各Profileが独立した意味を持つか

| Profile | 独立性の一次判断 | 根拠 |
|---|---|---|
| OFF | 比較基準として必要 | モデル本来の回答でも条件・注意を十分含む |
| Standard | 独立性は弱い | OFFと主要論点・構造が近く、安定した固有戦略が見えにくい |
| Concise | あり | 全セルで結論先行・圧縮。平均回答長が約50%減少 |
| Thinking Support | あり | 判断軸、前提、別視点、次の論点へ一貫して再構成 |
| Non-Accommodating | あり | 妥当性を認めつつ弱い前提を明示的に再評価 |

これは最終採用決定ではなく、今回の30 Runに基づく一次判断である。

## 16. User Profileと組み合わせる価値があるか

**観察:** User Profileを使わなくても、System Profileだけで回答の長さ、構造、前提検討の姿勢が変化した。今回のSystem Profile本文には難易度や対象者の知識レベルを含めていない。

**解釈:** 「誰に向けるか」と「どの姿勢で答えるか」は別軸として成立する可能性が高い。例えばBeginner + Concise、Practical + Thinking Support、Expert + Non-Accommodatingは異なる用途を持ち得る。ただし、組み合わせると指示量が増え、短さと段階説明、実務性と思考拡張などが競合する可能性がある。Productionへ同時実装する前に、少数の直交組み合わせ実験へ進む価値はある。

## 17. UI実装候補

今回の結果だけを根拠にした候補は次の通りである。

- OFF: 必須。
- Standard: OFFとの統合候補。別選択肢としては根拠が弱い。
- Concise: 候補。ただし断定が強くなるケースを追加検証する。
- Thinking Support: 候補。不要な問い返しの頻度を追加検証する。
- Non-Accommodating: 候補。表示名と長文化を検討する。

本実験ではUIを実装していない。System Profile preset selector、永続化、User Profileとの同時適用も行っていない。

## 18. 問題点・限界

1. 各セル1 Runであり、再現性や出力分散を測っていない。temperature 0でも実行環境によって完全決定的とは限らない。
2. 問題は説明、判断、設計の3題だけで、創作、感情的相談、法務・医療などは未評価である。
3. 回答の事実精度を外部資料で採点していない。複数モデルによる検証がハルシネーションを「劇的に」減らす、単一大規模モデルが多くの場合に優れる、Temperature 0が決定論的である、といった表現には条件依存性がある。
4. LM Studio側のThinking / Reasoning設定をAPIから確認できず、モデル間で同一とは保証できない。
5. Prompt token数はProfile本文の長さでも増えるため、completion tokensや時間の単純比較だけで品質を判定できない。
6. Qwenのreasoningは保存できたが、Gemmaはreasoning本文を返さなかった。推論量のモデル間比較はできない。
7. Non-Accommodatingの長文化と、Conciseの断定化は、他の質問でも再確認が必要である。

## 19. 次の実験候補

次に進む価値がある候補は、UI実装ではなく、少数の組み合わせ実験である。

1. User Profile 3種 × System Profile 3種から、意味が衝突しにくい6〜9条件を選ぶ。
2. Conciseで重要条件が落ちやすい曖昧質問を増やす。
3. Thinking Supportで不要な問い返しが増えるかを、明確な質問と探索的質問で比較する。
4. Non-Accommodatingを、正しいユーザー主張・誤った主張・価値判断の3種で比較し、逆張り率を確認する。
5. 同一セルを複数回実行し、Profile差と生成揺らぎを分離する。

今回の30 Runでは、Concise、Thinking Support、Non-AccommodatingはUser Profileとは別の回答方針として検討を続ける根拠が得られた。StandardはOFFとの差が小さく、独立したUI Presetとしての優先度は低い。これは次Phaseの候補整理であり、Production採用の決定ではない。
