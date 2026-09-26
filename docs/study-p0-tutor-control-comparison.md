# Study P0 Tutor Control Comparison

## 実験条件

- 実施日: 2026-09-16。HEAD: `6d52c1f015246f3c0665ef19478fdf3eb71118e1`。
- 未コミットの最終P0を使用。開始時の既存追跡／未追跡155ファイルをSHA-256で記録。既存source、fixture、test、過去の比較文書は編集しない。
- モデルは`google/gemma-4-e4b`、architecture `gemma4`、quantization `Q4_K_M`のみ。新規取得、別モデルとの比較なし。
- 既存LMStudioProviderとStudyCoordinatorを直接importし、Nodeの標準入力から一時的な実験コードを実行。測定スクリプトファイルは作成していない。HTTP UIは起動せず、既存Coordinatorのbuffer／検査／公開DTO確定をそのまま利用する。
- ProviderラッパーはA/Bの両方で同じ処理を通す。BのTutor callだけ、既存system message末尾へ下記115文字を空行で追記する。それ以外のbodyは変更しない。
- 各送信前に追記部分を取り除いたbodyが元bodyと完全一致することをassert。同一問題・同一call種別の元bodyが全反復で同じであることもassertする。
- model、fixture、Task Definition、Reference、rubric、level 0 explanation、explanation enum、leak detector、answer lock、temperature 0、Task最大2048／Tutor最大512 tokens、per-call 120秒／step 300秒、retryなし、Session構造、Call 1、schema基本構造、publish方式は固定。
- 問題は移項、季節、変数。各条件・各問題2回、計12試行。すべて新規Sessionで学習履歴を共有しない。
- 順序: 1反復目は各問題A→B、2反復目は各問題B→A。問題順は移項→季節→変数。実際の要求は逐次1件。
- 実行前にGemmaをロード。CLI表示はcontext 8192、parallel capacity 4、size 6.33GB。ロード設定は変更せず、A/Bで同じloaded instanceを使用する。CLIロード4.77秒、コマンド全体5,272.732msはStudy latency外。CLIの補助設定書込にEPERM警告が出たが、モデルロードは成功しIDLEを確認した。
- 全試行ロード済みだが、最初のA試行だけ初回推論初期化の影響があり得る。順序・cache・時間変動を完全に除いたベンチマークではない。
- fixtureは引き続き人間レビュー待ち。以下のラベルはエージェントによる人間レビュー向け観察であり、人間承認、自動正解判定、教育効果の検証ではない。

### A: Baseline

現在のP0 Tutor system messageを無変更で使用する。

```text
日本語の学習支援です。初回explanationはallowed_hintsのtextをそのまま1つ使用してください。ask_questionを優先し、そのヒントについて学習者の考えを尋ねる短い問いをnext_questionに1つ書いてください。新しい知識は追加しません。答えや定義、解法の核心、完了宣言は出さないでください。JSONのみ。形式は {"action":"ask_question","explanation":"...","next_question":"..."} または {"action":"explain","explanation":"..."}。思考過程や追加キーは禁止です。
```

### B: Concrete Question

上記に空行を挟んで以下だけを追加する。GOOD/BADの例、question_goal、追加schema、強制的なask_question制約は与えない。

```text
次の問いは、ユーザーが何を考えればよいか分かる程度に具体的にする。
ただし、答えそのもの、上位hint、解法、結論、completion criterionの核心を問いの中に含めてはいけない。
原則として一度に1つだけ問いかける。
```

user messageは同じpublic task、criterion ID、hint level、許可level 0 hint、explanation policy、allowed actions。Reference全文をTutorへ渡さない。

### 計測上の注意

既存Coordinatorのinput_charsはProviderラッパー呼出し前に算出されるため、Bでは追記前の値になる。ソースを変更せず、ラッパーで**実際にProviderへ渡すJSON長**も別途測定し、本書はそちらを記録する。BのTutor payloadはAより121 UTF-16 code units多い（追記115文字＋空行＋JSONの改行escape）。Call 1は同一。

latencyは既存Coordinatorの計測値。成功時のTotalは公開確定まで、失敗時はFAILEDまでで公開時間ではない。token usage、finish_reason詳細、reasoningの量はProviderから取得しておらず、推測値を記録しない。

## 結果

†はFAILEDまでの時間。公開はしていない。全試行2 call、Call 1 schema／fixture整合は12/12 PASS。Taskの生出力も問題ごとに全A/B・反復で一致した。

| 順序 | 試行 | Call 1 秒 | Tutor 秒 | Total 秒 | Tutor schema | machine check | state / action | Tutor出力文字数 |
|---:|---|---:|---:|---:|---|---|---|---:|
| 1 | A-移項-1 | 15.672 | 17.036 | 32.710 | PASS | machine_checks_passed | ACTIVE / ask_question | 141 |
| 2 | B-移項-1 | 15.425 | 23.837 | 39.263 | PASS | machine_checks_passed | ACTIVE / explain | 74 |
| 3 | A-季節-1 | 15.294 | 17.779 | 33.073 | PASS | machine_checks_passed | ACTIVE / ask_question | 149 |
| 4 | B-季節-1 | 15.021 | 23.838 | 38.860† | FAIL | schemaで拒否、leak未実施 | FAILED / — | 2 |
| 5 | A-変数-1 | 14.102 | 18.063 | 32.166 | PASS | machine_checks_passed | ACTIVE / ask_question | 131 |
| 6 | B-変数-1 | 13.559 | 17.857 | 31.416 | PASS | machine_checks_passed | ACTIVE / ask_question | 165 |
| 7 | B-移項-2 | 15.354 | 22.935 | 38.289 | PASS | machine_checks_passed | ACTIVE / explain | 74 |
| 8 | A-移項-2 | 15.411 | 16.695 | 32.106 | PASS | machine_checks_passed | ACTIVE / ask_question | 141 |
| 9 | B-季節-2 | 14.822 | 23.186 | 38.009† | FAIL | schemaで拒否、leak未実施 | FAILED / — | 0 |
| 10 | A-季節-2 | 15.258 | 17.470 | 32.729 | PASS | machine_checks_passed | ACTIVE / ask_question | 144 |
| 11 | B-変数-2 | 13.463 | 17.430 | 30.893 | PASS | machine_checks_passed | ACTIVE / ask_question | 165 |
| 12 | A-変数-2 | 13.693 | 17.626 | 31.320 | PASS | machine_checks_passed | ACTIVE / ask_question | 131 |

| 条件 | 予定試行 | Tutor schema PASS | 公開 | ask_question | explainのみ | TUTOR_OUTPUT_REJECTED |
|---|---:|---:|---:|---:|---:|---:|
| A Baseline | 6 | 6/6 | 6/6 | 6/6 | 0/6 | 0/6 |
| B Concrete | 6 | 4/6 | 4/6 | 2/6 | 2/6 | 2/6 |

失敗や問いなしを分母から除外しない。Bの有効な問い2件だけを比較して「全体が改善した」とは評価できない。

### latency

- 全試行の平均Total: A **32.351秒**、B **36.122秒**、差+3.771秒。Bは失敗までの時間を含むため「平均公開時間」とは呼ばない。
- 平均Tutor call: A 17.445秒、B 21.514秒。平均Call 1はA 14.905秒、B 14.607秒。
- 問題別平均Total: 移項 A 32.408 / B 38.776秒、季節 A 32.901 / B 38.434秒（BはFAILED）、変数 A 31.743 / B 31.155秒。
- Bの公開できた4件だけの平均は34.965秒。ただし成功例だけの選択なので公平な全体比較には使わない。
- 反復各2件であり、有意差や一般的な処理速度を推定しない。追加指示で常に遅くなるとも言えない。

### 実送信payload文字数

| 問題 | Call 1 input | Call 1 output（全反復共通） | A Tutor input | B Tutor input |
|---|---:|---:|---:|---:|
| 移項 | 1865 | 595 | 1396 | 1517 |
| 季節 | 1850 | 580 | 1381 | 1502 |
| 変数 | 1836 | 566 | 1370 | 1491 |

24 callすべてでpayload差分のassert成功。変更したのはBのTutor system messageへの115文字追記だけ。追加方針には具体化と禁止事項の再提示が含まれるため、厳密には「具体的に」という一句だけの効果を分離した実験ではなく、指定された追加方針一式の比較である。

## 問い全文と観察ラベル

### A-移項-1（順序1）

- action: `ask_question`
- explanation全文: 等号を、左右がつり合った天秤にたとえて考えてみましょう。
- next_question全文: この「天秤」の比喩は、移項する際にどのような点に着目させてくれると思いますか？

### B-移項-1（順序2）

- action: `explain`
- explanation全文: 等号を、左右がつり合った天秤にたとえて考えてみましょう。
- next_question全文: なし

### A-季節-1（順序3）

- action: `ask_question`
- explanation全文: 日本が夏のとき、オーストラリアはどの季節でしょう。
- next_question全文: このヒントから、地球の異なる場所で同時に違う季節になる理由について、何か考えられることはありますか？

### B-季節-1（順序4）

公開なし。raw TutorはJSON文字列表記で `"{\n"`。問い・説明として解釈しない。error: TUTOR_OUTPUT_REJECTED、reason: invalid_json_schema_or_action。

### A-変数-1（順序5）

- action: `ask_question`
- explanation全文: ゲームで点数を表示する場面を考えてみましょう。
- next_question全文: この「点数」という情報を扱うとき、何が必要になってくると思いますか？

### B-変数-1（順序6）

- action: `ask_question`
- explanation全文: ゲームで点数を表示する場面を考えてみましょう。
- next_question全文: もし、プレイヤーが敵を倒すたびに点数が変わっていくとしたら、その『現在の点数』をプログラムの中でどのように管理する必要があるでしょうか？

### B-移項-2（順序7）

- action: `explain`
- explanation全文: 等号を、左右がつり合った天秤にたとえて考えてみましょう。
- next_question全文: なし

### A-移項-2（順序8）

- action: `ask_question`
- explanation全文: 等号を、左右がつり合った天秤にたとえて考えてみましょう。
- next_question全文: この「天秤」の比喩は、移項する際にどのような点に着目させてくれると思いますか？

### B-季節-2（順序9）

公開なし。raw TutorはJSON文字列表記で `""`。問い・説明として解釈しない。error: TUTOR_OUTPUT_REJECTED、reason: invalid_json_schema_or_action。

### A-季節-2（順序10）

- action: `ask_question`
- explanation全文: 日本が夏のとき、オーストラリアはどの季節でしょう。
- next_question全文: このヒントから、地球の異なる場所で同時に違う季節になる理由について、何か考えはありますか？

### B-変数-2（順序11）

- action: `ask_question`
- explanation全文: ゲームで点数を表示する場面を考えてみましょう。
- next_question全文: もし、プレイヤーが敵を倒すたびに点数が変わっていくとしたら、その『現在の点数』をプログラムの中でどのように管理する必要があるでしょうか？

### A-変数-2（順序12）

- action: `ask_question`
- explanation全文: ゲームで点数を表示する場面を考えてみましょう。
- next_question全文: この「点数」という情報を扱うとき、何が必要になってくると思いますか？

### 観察ラベル

| 試行 | question_specificity | answerability | disclosure | 観察理由 |
|---|---|---|---|---|
| A-移項-1 | too_abstract | unclear | level0 | 天秤のどの点を挙げればよいか広い。 |
| B-移項-1 | — | unclear | level0 | 固定説明だけで回答対象がない。問いの具体性は未評価。 |
| A-季節-1 | too_abstract | unclear | level0 | 季節の理由を自由に考える問いで、初学者への着眼点が弱い。 |
| B-季節-1 | — | — | — | JSON不正。評価できるTutor出力なし。 |
| A-変数-1 | too_abstract | unclear | level0 | 「何が必要」という回答範囲が広い。 |
| B-変数-1 | appropriate | answerable | level0 | 変わる現在の点数を管理するという対象が明確。ただし「管理」は初学者には難しい可能性。 |
| B-移項-2 | — | unclear | level0 | 固定説明だけで回答対象がない。問いの具体性は未評価。 |
| A-移項-2 | too_abstract | unclear | level0 | 天秤のどの点を挙げればよいか広い。 |
| B-季節-2 | — | — | — | JSON不正。評価できるTutor出力なし。 |
| A-季節-2 | too_abstract | unclear | level0 | 季節の理由を自由に考える問いで、初学者への着眼点が弱い。 |
| B-変数-2 | appropriate | answerable | level0 | 変わる現在の点数を管理するという対象が明確。ただし「管理」は初学者には難しい可能性。 |
| A-変数-2 | too_abstract | unclear | level0 | 「何が必要」という回答範囲が広い。 |

「—」は新しい評価ラベルではなく未評価を示す。問いが存在しない出力を架空の問いとしてtoo_abstract等へ分類しない。explainのみのanswerability=unclearは「答える対象がない」という意味。schema不正の場合は3項目すべて未評価。

ラベルの基準は初学者が次の回答対象を特定できるか。Aの問いでも知識のある人は答えられる可能性があり、これを不正な問いとは扱わない。Bの変数は「easy_to_answer」とまでは評価しない。プログラム内の管理方法には事前知識が必要かもしれない。

### 評価項目1〜10の補足

| 対象 | ask_question・疑問文 | 1問だけか | 対象・抽象度 | 答え・上位hint・強い誘導 | 日本語・初学者の回答しやすさ |
|---|---|---|---|---|---|
| A移項2件 | yes、疑問文成立 | next_question／全文とも1問 | 天秤は示されるが着眼点が広い | 同じ操作や解法を述べず、直接の核心提示は観察されない | 自然だが抽象的で、初学者には答え方が不明かもしれない |
| A季節2件 | yes、疑問文成立 | next_questionは1問。ただし固定explanationにも季節を問う文があり、全文では季節予想＋理由の2要求 | 理由全体を問うため広い | 地軸や日照時間を先に教えない | 自然。予想と理由を同時に求める負担は要レビュー |
| A変数2件 | yes、疑問文成立 | 全文で1問 | 点数という情報は示すが「何が必要」が広い | 名前と値の結びつきを先に述べない | 自然だが必要な回答の粒度は不明 |
| B移項2件 | no、問いなし | 0問 | 固定文だけ | 新たな核心・上位hintの提示なし | 説明自体は自然だが対話が止まる |
| B季節2件 | 評価不能 | 評価不能 | 評価不能 | 漏れ検査にも到達しない | 評価不能 |
| B変数2件 | yes、疑問文成立 | 全文で1問 | 敵を倒すたび変わる「現在の点数」の扱いに限定 | 値の変化へ誘導するが、名前・保存手順・正答候補は示さない。許容する誘導量は人間確認が必要 | 自然な一文。対象は明確だが「どのように管理」は依然難しい可能性 |

観察できた問いでは、答えの言い換え、正答候補、実質的二択、必要操作のほぼ明示に相当する明確な例は見つからなかった。ただし、Bは問いが2件しか出ておらず、増加を検出できる十分な標本ではない。machine_checks_passedを「意味的な漏れなし」と呼ばない。

### 反復

Aの移項・変数は同文。A季節は1回目「何か考えられることはありますか？」、2回目「何か考えはありますか？」と変化し、どちらも抽象的だった。B移項は同じexplain、B変数は同じ具体的な問い。B季節は `"{\\n"` と空文字という異なるraw出力だが、どちらも同じschema拒否。temperature 0でも完全再現を前提にしない判断は妥当だった。

## 具体性・漏れ・失敗の解釈

1. **「具体的にせよ」だけで一様には改善しなかった。** 変数の2件では対象が明確になったが、移項は問いを返さなくなり、季節は応答形式が成立しなかった。
2. **答え漏れが増えたとは観測していないが、増えないとも結論できない。** 有効なBの問いは2件だけ。問いなし／非公開を「安全性改善」として数えない。
3. **Gemmaは今回の変数問題では、制約を守った具体的な一問を2回生成できた。** 他の問題への一般化はできない。
4. **自由生成Tutorだけで十分とは言えない。** 問いの成立・粒度と、不完全出力を公開しない既存の検査を分離して考える必要がある。
5. **question_goalを指定する別実験には価値がある。** 単に具体化を求めるより、答えを含まない小さな観察対象を指定した方がよいかを検証できる。ただし今回その入力を追加していない。
6. **支援ボタンには設計上の価値がある。** 助けてほしい内容の明示に有用そうだが、今回UIや学習者で有効性を確かめてはいない。
7. **選択式を何levelから許すかは内容依存。** level 2を初期実験の候補にしつつ、主問題の核心を表示する選択肢は別の開示規則で止めるべき。

### 失敗の扱い

B季節はProvider呼出し自体はsucceededだが、1回目は2文字の `{\\n`、2回目は0文字で終了した。既存のJSON検査でTUTOR_OUTPUT_REJECTED、公開なし。timeout、REFERENCE_REJECTED、Provider errorは0件。機械leak rejectも0件だが、schema拒否2件ではleak検査を実施していない。

出力上限に達した、思考にtokenを使い切った、指示の衝突で応答できなかった、等の原因は本観測から確定できない。max tokensやpromptを調整して救済せず、すべて当初の12試行に含めた。

B移項のexplainはschema上合法なので検査を通った。「ask_question優先」という意図と「explainも許す」という契約の差が結果に表れている。具体性を上げる指示だけでは、問いの存在そのものを保証できない。

季節では固定explanation内の問いとnext_questionの両方があるため、「一度に1問」を全文へ適用するか生成fieldだけへ適用するかも曖昧さとして残る。今回は固定説明を変更しない条件のため修正していない。

### 次に試すControl方式

今回のBをそのまま採用せず、問いを安定して返したAを比較基準として残す。次はGemma・既存schema・既存制限を固定し、**人間承認済みの低開示なquestion_goalの有無だけ**を変える実験を候補とする。例えば天秤の「つり合う状態を言葉にする」ような小目標を検討するが、教材レビュー前に正解や解法を含むgoalを採用しない。

ask_question必須化、question_goal追加、支援UI追加、token上限変更を同時に行わない。問いを必須にするschema比較や、失敗原因のメタ情報計測はそれぞれ別の実験として設計する。P1、Evaluator、Routerを追加する結論にはしない。

## 次段階の設計評価（未実装）

### 自由回答・支援ボタン・選択肢

| 案 | 初学者への足場としての利点（仮説） | 答えを見せすぎる危険・制限 |
|---|---|---|
| A 自由回答 | 学習者の考え方や誤解を観察しやすい。正答候補を先に見せない | 抽象的な問いでは何を書けばよいか分からない。問い自体に答えを埋め込む危険もある |
| B 問いの下に支援ボタン | 助けを求める文章を考える負担を減らし、支援要求を明示できる | ボタンを押すたび無条件に情報開示を増やす設計は危険。「詳しく」が解答開示許可とは限らない |
| C 問題別の選択肢 | 回答範囲を限定し、予想や比較をしやすくする可能性 | 正しい選択肢自体が答えを提示する。二択や消去法による誘導、当てずっぽうを理解と誤認する危険 |

次に支援ボタンを試す価値はある。ただし「このUIが学習効果を高める」とは本実験から言えない。最初は自由回答を残し、少数の明確な支援要求を選べる形を検討する。ボタン追加だけでTutorの問いが具体的になるわけではない。

### requested_supportが単純化できる部分

支援要求と理解の自己申告を分ける方が扱いやすい。以下は将来の設計候補であり、Session・API・UIへは追加していない。

| 操作候補 | requested_support候補 | 別途保持／解釈すること |
|---|---|---|
| 自分で答える | none | 理解済みという意味ではない |
| よくわからない | clarify等の低開示な初期対応を検討 | understanding_signal=confusedに相当する自己申告。直ちに答えを見せない |
| もう少しヒント | hint | 許可されたヒント範囲内で何を出すかを決める |
| もっと詳しく | explain_more | 現在の開示上限内で言い換え・分解する。answer lock解除ではない |
| ここがわからない | clarify | 対象箇所や語を一緒に指定できると曖昧さが減る |
| 例を見たい | show_example | 別の例でも解法を事実上開示する場合があるため検査が必要 |
| わかった | none | understoodという自己申告だけ。COMPLETE判定の根拠にはしない |

明示入力があれば、Harnessは「ユーザーが何の支援を望むか」を文章から毎回推測する必要を減らせる。次に許可する操作も決定的に選びやすい。一方、Evaluatorの役割である回答内容・理由・誤解の評価は残る。支援不要の選択も、理解した証拠とは扱えない。

支援希望は学習者の意思、開示してよい範囲は教材・answer lockの規則として別管理する。requested_supportだけからhint levelを自動で増やさない。説明を詳しくすることと、解答に近づくことも区別する。

### question typeとhint level

open_question / prediction / multiple_choice / explain_in_own_words / check_understandingは、単純な難易度順・開示順にはならない。predictionは自由回答でも選択式でも表現できる。check_understandingも「わかった？」という自己申告と、理由を説明する課題では得られる証拠が異なる。

提案された「level 0自由回答 → level 1着眼点 → level 2選択肢 → level 3手順」は、初期運用ルールの候補にはなる。ただし**level 2になれば任意の選択肢が安全になるわけではない**。これは既存P0のhint level定義を変更する提案ではなく、次の設計検討用。

- 最初の選択式実験は、教材ごとに承認した低開示の下位問題を、暫定的にlevel 2相当で試す案が保守的。
- 「片側だけから3を取ると、つり合う／つり合わない／わからない」は主問題の解法そのものではないが、その下位問題の正答候補を表示し、推論範囲を二択へ絞る。足場と開示の両方がある。
- 移項の原理、地軸の傾き、値と名前の対応など主問題の核心が選択肢に入るなら、レベル番号に関係なく別途の開示承認が必要。
- 選択式で正解しても理解済みとは判定しない。後の理由説明を含む設計が必要だが、今回は実装しない。

したがってquestion type、支援希望、許可された開示量は別軸として考え、最終的には表示内容を検査する方がよい。

## 保全

開始時の既存155ファイルは終了時も全件SHA-256一致、変更0件。追加は本書1件だけ。P0 source、fixture、test、design/results、前回model comparison、package、migrationを変更していない。DB・Conversation・GenerationRunへの操作なし。

既存testは変更しておらず、今回はコード変更のない比較のため再実行していない。実験中の24 payload照合assertは全成功。git diff --check、git diff --cached --check、本書の新規ファイルwhitespace checkに診断なし。

| ファイル | 開始時＝終了時 SHA-256 |
|---|---|
| `docs/study-p0-model-comparison.md` | `8EBDD43CB96D2B124DAED6660426CACDEAEADA9DD0A1F724AE01D9AFAC771FD3` |
| `src/study-poc/coordinator.ts` | `561CF9667F86E78EF5F49CF2CC9675141A7911952FCA8B0D65AFF2340BF96C6E` |
| `src/study-poc/problems.ts` | `84DEDB94F64B8EBAA82D05F329FD969E37E9E47F8DC64269FAD02AB8D74717E8` |
| `src/study-poc/schema.ts` | `DD1D4C8F99963598410F6F2060D95F33CFEAFAEDD622D4A387849DC11A05CB0A` |
| `src/study-poc/validation.ts` | `6543CF0B76C38A53FC2E5F19F9D296A47DD97744AD9633565578009E3DB6D306` |
| `tests/study-poc.test.ts` | `932112098E9BCB58B1E32AF72291B91C56F1FFA15B24AB928FA584857571B620` |

実験プロセスは12試行後にSessionを破棄して終了。使用モデルをunloadし、LM Studioのloaded model 0件を確認した。支援ボタン、選択式UI、question_goal、P1、Router、Evaluator等は未実装。commit / push / tagなし。
