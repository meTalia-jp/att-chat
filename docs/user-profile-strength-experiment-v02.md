# Att-Chat User Profile Strength Experiment

実施日: 2026-10-08<br>
実験ID: `att-chat-user-profile-strength-v0.2`

## 1. 実験の背景

Att-ChatのUser Profileは、回答相手の前提知識や説明の好みを、モデルが回答前に参照するための補助Contextである。現行Productionでは、Profile本文を一定のwrapperで包み、system messageとして生成requestへ追加している。

将来、Settingsへ「弱・標準・強」の影響度選択を設ける案がある。しかし、表示項目を増やす前に、同じProfile本文でもwrapperの表現だけで回答が段階的に変わるかを確認する必要がある。

## 2. 実験目的

Profile本文、質問、generation settingsを固定し、wrapperだけをWeak / Standard / Strongへ変更したとき、次を観察した。

- Beginner向けの用語説明、数式、比喩、説明開始位置が段階的に変わるか
- Expert向けの基礎説明省略、専門用語、数式、理論的深度が段階的に変わるか
- 変化が2モデルに共通して現れるか
- 3段階のSettings UIを設けるだけの、理解可能で安定した差があるか

今回は強度UI、永続化、schema、Production wrapperを変更していない。

## 3. User Profile機能とは何か

User Profileはモデルへ命令する人格設定ではなく、難易度、説明量、専門用語の使い方を調整するための参考情報である。質問本文を優先し、Profileだけを根拠に過度な推測をしないことが現行方針である。

この実験では、会話履歴、Marker、Question Keepなどの影響を除くため、各Runを独立した `system + user`、またはProfile OFF時の `user` のみで実行した。これにより、wrapper差を直接観察した。

## 4. 今回の仮説

結果を見る前に、次の仮説を置いた。

- **H1**: 具体的なUser Profileを与えると、Profile OFFより回答適応が起きる。
- **H2**: Wrapperを強くすると、Profileへの適応度が上がる。
- **H3**: Expert側はBeginner側より変化が大きく出る可能性がある。
- **H4**: 高性能モデルほどExpert側の内容深度が大きく伸びる可能性がある。
- **H5**: Beginner側は単純な専門語削減ではなく、再説明能力の差がモデルごとに現れる可能性がある。

## 5. 使用モデル

LM Studioのmodel listで確認できた、次の実識別名を使用した。

- `qwen/qwen3.8-27b`
- `qwen/qwen3.6-35b-a3b`

共通generation settingsは以下である。

| 項目 | 値 |
|---|---:|
| temperature | 0 |
| max_tokens | 4096 |
| streaming | ON |
| usage取得 | ON |
| 自動再試行 | なし |
| 1 Run timeout | 600秒 |

LM Studio側のThinking / Reasoning等の設定値はAPIから取得できなかった。各モデルの試験中には変更していないが、モデル間で同一だったことは確認できない。この点はモデル間のreasoning量や所要時間を解釈する際の制約である。

## 6. 固定質問

全Runで次の質問を使用した。

> 電磁誘導とは何ですか。<br>
> なぜ磁石をコイルに対して動かすと電流が流れるのですか？

## 7. Beginner / Expert Profile

### Beginner

```text
この分野についての前提知識は中学生程度です。
専門用語は初出時に短く説明してください。
高校以降の数学や物理は未学習です。
```

### Expert

```text
この分野について大学〜専門レベルの知識があります。
基礎的な説明は不要です。
専門用語、数式、標準的な理論名称はそのまま使用して構いません。
```

Profile本文は各AudienceのWeak / Standard / Strongで同一である。

## 8. Weak / Standard / Strong wrapper

### Weak

Profileを「必要に応じて参考にする」情報として提示した。難易度や専門用語の調整を明示するが、回答前の確認や具体的な適応方法までは要求しない。

### Standard

現行Productionの `buildUserProfileSystemMessage` を直接使用した。回答前に一度確認することと、質問優先、過度な推測の回避、初心者・専門家側へ寄せすぎないことを明示する。

### Strong

Profileを難易度、説明量、専門用語の決定へ明確に反映するよう求めた。未学習の前提を当然視しないこと、十分な知識がある場合は基礎説明を省いて専門的内容へ進めることを明示した。

送信したsystem message全文は、各Runの `request_snapshot` とともに[実測JSON](./user-profile-strength-experiment-v02-data/runs.json)へ保存している。

## 9. 実験条件一覧

各モデルで次の7条件、合計14 Runを実行した。

1. Profile OFF
2. Beginner / Weak
3. Beginner / Standard
4. Beginner / Strong
5. Expert / Weak
6. Expert / Standard
7. Expert / Strong

各Runのrequest objectをそのままProviderへ渡し、同じobjectを `request_snapshot` として保存した。保存データから、model、Profile種別、wrapper強度、Profile本文、system message、質問を追跡できる。全回答は[回答全文Appendix](./user-profile-strength-experiment-v02-data/answers.md)に分離した。

## 10. モデル別結果

### qwen/qwen3.8-27b

| 条件 | finish | 回答文字数 | reasoning文字数 | 所要時間 |
|---|---:|---:|---:|---:|
| OFF | stop | 1,224 | 336 | 144.189秒 |
| Beginner / Weak | stop | 1,349 | 4,077 | 303.080秒 |
| Beginner / Standard | stop | 806 | 4,200 | 294.438秒 |
| Beginner / Strong | stop | 1,189 | 3,349 | 298.155秒 |
| Expert / Weak | error | 0 | 未返却 | 600.027秒 |
| Expert / Standard | stop | 2,141 | 5,692 | 507.248秒 |
| Expert / Strong | stop | 2,093 | 2,923 | 354.284秒 |

Expert / Weakは600秒でtimeoutした。自動再試行は行わず、失敗Runとexact requestをそのまま保存した。このため、このモデルのExpert側では3強度を完全には比較できない。

### qwen/qwen3.6-35b-a3b

| 条件 | finish | 回答文字数 | reasoning文字数 | 所要時間 |
|---|---:|---:|---:|---:|
| OFF | stop | 1,041 | 5,564 | 91.832秒 |
| Beginner / Weak | stop | 1,212 | 3,505 | 75.969秒 |
| Beginner / Standard | stop | 1,265 | 5,386 | 93.945秒 |
| Beginner / Strong | stop | 852 | 5,805 | 97.748秒 |
| Expert / Weak | stop | 1,353 | 6,438 | 106.688秒 |
| Expert / Standard | stop | 1,956 | 5,225 | 105.633秒 |
| Expert / Strong | stop | 1,929 | 5,972 | 113.017秒 |

このモデルは7条件すべて `finish_reason=stop` で完了した。

## 11. Beginner側比較

### qwen/qwen3.8-27b

**観察**

- OFFはファラデーの法則を `E = -N dΦ/dt` と数式で示し、磁束、起電力、レンツの法則を導入した。
- Weak / Standard / Strongはいずれも数式を使わなかった。Profileによって高校以降の数式が除かれた形である。
- Weakは「磁界（磁力が働く空間）」「起電力（電気を流そうとする力）」と初出説明を付け、レンツの法則、電流を大きくする条件、応用例まで説明した。
- Standardは「磁束」「電界」を導入して短く説明した。回答は3強度中で最短の806文字だった。
- Strongは「磁界」「電界」「電子」を段階的に説明し、磁束という用語や法則名を避けた。一方、回答長は1,189文字でStandardより長かった。

**解釈**

Profileの有無による適応は明確である。一方、Weak→Standard→Strongで単純に短くなる、用語が減る、比喩が増えるといった一方向の変化はない。Strongは形式語を減らしたが、説明段階を増やしたためStandardより長くなった。

### qwen/qwen3.6-35b-a3b

**観察**

- OFFも一般向けの文体だったが、ファラデーの法則、磁束、ローレンツ力を導入した。
- Weakは磁束を「風が通る風量のようなもの」と例え、起電力、レンツの法則、エネルギー保存を説明した。
- Standardは磁場と磁束を段階的に定義し、発電機、マイク、ワイヤレス充電の例を挙げた。
- Strongは852文字まで短くなり、「導線」「電圧」「磁場」「電子」を初出時に短く説明した。磁束という用語は避け、「コイルを通り抜ける磁力の量」と表現した。
- 3条件とも数式を使わなかった。

**解釈**

Strongでは短文化と用語の言い換えが目立ち、強いBeginner適応の候補が見える。しかしWeakとStandardは説明量・難易度とも近く、3段階が等間隔には見えない。またStrongには「より小さな粒子の動きから導くことはできない」という断定的な補足があり、wrapperを強くしても正確性が自動的に向上するわけではない。

## 12. Expert側比較

### qwen/qwen3.8-27b

**観察**

- Weakはtimeoutし、最終回答を得られなかった。
- Standardは磁束の面積分、ファラデーの法則、Maxwell–Faraday方程式、ローレンツ力、移動回路の一般式、電磁場テンソル、エネルギー保存まで扱った。
- Strongも磁束の面積分、Maxwell–Faraday方程式、非保存電場、motional EMF、移動回路、相対論的統一を扱った。
- Standardは2,141文字、Strongは2,093文字で、内容範囲と長さは近かった。
- Strongには `I=E/R` を意図したLaTeXの括弧欠落が1箇所あった。

**解釈**

StandardとStrongはいずれも十分に専門的であり、Strongだけが明確に一段深いとは言いにくい。Weakの欠測により、3段階差は判定できない。timeoutはStrongではなくWeakで発生しており、「wrapperが強いほど生成負荷が上がる」という単純な関係も支持しない。

### qwen/qwen3.6-35b-a3b

**観察**

- Weakの時点でMaxwell–Faraday方程式、磁束積分、ローレンツ力、ローレンツ変換、エネルギー保存まで導入した。
- Standardはtransformer EMFとmotional EMFを明示的に分け、電磁場のローレンツ共変性まで展開した。回答長はWeakの1,353文字から1,956文字へ増えた。
- Strongは非保存電場、`J = σE`、transformer EMF / motional EMF、電磁場テンソルを扱った。回答長は1,929文字でStandardとほぼ同じだった。
- 所要時間はWeak 106.688秒、Standard 105.633秒、Strong 113.017秒で近く、reasoning文字数は6,438→5,225→5,972と非単調だった。

**解釈**

WeakからStandardでは構造化と説明範囲の増加が見える。ただしStandardとStrongは内容深度、長さ、所要時間がほぼ飽和している。3段階よりも「Weak」と「Standard以上」の2群に近い。

## 13. モデル間比較

**観察**

- 両モデルとも、Beginner条件では数式を避け、Expert条件では数式と標準理論名を使用した。
- `qwen/qwen3.8-27b` はProfile条件で294〜507秒を要し、Expert / Weakは600秒でtimeoutした。
- `qwen/qwen3.6-35b-a3b` は全条件を76〜113秒で完了した。
- Beginner Strongでは両モデルとも専門用語を言い換える方向が見えたが、回答長はqwen3.8ではStandardより増え、qwen3.6では減った。
- Expert StandardとStrongが近いという傾向は両モデルで共通した。

**解釈**

Audienceに合わせる基本効果はモデルをまたいで確認できた。一方、wrapper強度が回答へ現れる形はモデル依存であり、同じ強度をUI上の一貫した意味として説明するのは難しい。所要時間差は大きいが、LM Studio内部設定を取得していないため、モデル能力差やwrapperだけに帰属できない。

## 14. 強度による差

| 観点 | Weak→Standard→Strongの結果 |
|---|---|
| Beginnerの数式抑制 | 3強度すべてで成立。強度間の差は小さい |
| Beginnerの用語説明 | 全強度で成立。説明方法は変わるが単調ではない |
| Beginnerの回答長 | 2モデルとも単調変化なし |
| Expertの専門性 | Weakから既に高い。Standard / Strongは近い |
| Expertの内容深度 | qwen3.6ではWeak→Standardに増加。Standard→Strongは飽和 |
| reasoning量 | 両モデルで非単調 |
| 応答時間 | 強度に沿った単調変化なし |
| 生成安定性 | qwen3.8 Expert / Weakのみtimeout。強度との一方向関係なし |

3段階の差は、両Audience・両モデルを通して再現しなかった。特にStandardとStrongの差は小さく、Strongが常に詳しい、短い、適切、安定という関係はなかった。

## 15. 観察された傾向

### 仮説ごとの結果

- **H1: 支持**。Profile OFFと比べ、Beginnerでは数式抑制と初出説明、Expertでは数式・理論名・相対論的説明への移動が観察された。
- **H2: 部分的だが一貫せず**。qwen3.6 Beginner Strongの短文化やExpert Weak→Standardの深度増加は候補だが、回答長、専門性、reasoning量はいずれも3段階で単調にならなかった。
- **H3: 部分的に支持**。特にqwen3.6ではExpert条件で内容範囲が大きく変わった。ただしBeginner側にも数式除去という明確な変化があり、「Expertの方が常に大きい」とは言えない。
- **H4: 判定不能**。2モデルの客観的な性能順位、内部推論設定、複数題材が揃っていないため、モデル性能とExpert深度を結び付けられない。
- **H5: 支持する観察あり**。qwen3.8は段階説明や用語回避、qwen3.6は比喩、初出定義、短文化を使い分けた。Beginner適応は単なる専門語削減ではなかった。

## 16. 強弱UIを実装する価値があるか

**今回の結果だけでは、Weak / Standard / Strongの3段階UIを実装する根拠は不足している。**

理由は次のとおりである。

1. Profile ON/OFFとBeginner / Expertの差は明確だった。
2. Weak / Standard / Strongの差は、回答長、専門語、数式、reasoning、時間のどれでも単調ではなかった。
3. StandardとStrongは、両モデルのExpert回答でほぼ同じ深度だった。
4. 同じStrongでも、Beginner回答長はモデルによって増加・減少が逆だった。
5. qwen3.8 Expert / Weakの欠測があり、全セルで比較できていない。
6. 各条件1回のため、再現性を統計的に確認できない。

現時点では、現行Standard wrapperを固定したままUser ProfileのON/OFFを使う方が、UIの意味を説明しやすい。将来再検証する場合も、まず複数題材・複数反復でStandardとStrongの差が安定するかを見るべきである。2段階化を含む設計判断も、その結果の後に行うのが妥当である。

## 17. 実験上の限界

- 各条件は1 Runだけであり、「再現性のある差」を統計的に示せない。
- 題材は電磁誘導の1問だけである。プログラミング、数学、文章作成などへ一般化できない。
- `qwen/qwen3.8-27b` のExpert / Weakはtimeoutし、回答を比較できない。
- temperature 0でも、ローカル推論backendやmodel runtimeが完全決定的とは限らない。
- LM StudioのThinking / Reasoning設定値をAPIから取得しておらず、モデル間で同一とは確認できない。
- OFF回答自体が一般向けだったため、Beginner Profileの追加効果が小さく見えるモデルがある。
- 用語数を機械スコア化していない。本文中の具体的表現と構造を中心に観察した。
- 実験harnessはProfile wrapperを分離して見るためのものであり、Production会話履歴や他のAtt-Chat system contextとの相互作用までは検証していない。

## 18. 今後の検証候補

UI実装前に必要性を再評価するなら、次の順が適切である。

1. 同じ14条件を各3回以上実行し、条件内変動を確認する。
2. 物理以外に、コード説明、数学、社会科学、短文要約を加える。
3. Standard / Strongの2条件へ絞り、第三者blind reviewで難易度と過剰適応を評価する。
4. timeout率、回答長、誤り候補も品質の一部として記録する。
5. Production経路で既存system contextと併用した場合に、同じ傾向が残るか確認する。

今回の実験からはUser Profile自体の価値は確認できたが、3段階のwrapper強度をユーザー設定として公開する価値までは確認できなかった。したがって、強弱UIは追加せず、現行Standard wrapperを維持する。

## Appendix / 再検証用資産

- [実測Run JSON](./user-profile-strength-experiment-v02-data/runs.json): exact request snapshot、system message、全文回答、diagnostics、時刻、error
- [回答全文](./user-profile-strength-experiment-v02-data/answers.md): 条件別の最終回答と実測値
- `src/laboratory/user-profile-strength-v02.ts`: 固定質問、Profile、wrapper、条件matrix
- `scripts/run-user-profile-strength-v02.ts`: LM Studio実行harness
- `scripts/write-user-profile-strength-v02-appendix.ts`: 回答全文Appendix生成
- `tests/user-profile-strength-experiment.test.ts`: 条件固定、Standard wrapper一致、request構造の検証
