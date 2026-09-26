# Study P0 Model Comparison

## Environment

- 実施日: 2026-09-16（JST）。HEAD: `6d52c1f015246f3c0665ef19478fdf3eb71118e1`。
- P0は未コミットの最終作業ツリーを使用。HEAD単体には含まれないため、開始時に既存追跡／未追跡154ファイルのSHA-256を取得して比較する。
- Windows `10.0.26200`、Node `v24.19.0`、AMD Ryzen AI 9 HX 370 w/ Radeon 890M、OS報告RAM 33,949,601,792 bytes。GPU offloadや実行backendの詳細設定は変更・測定していない。
- LM StudioローカルHTTP `127.0.0.1:1234`、CLI commit `9902c3a`。アプリ本体のversion情報は今回取得できず、CLI commitと区別する。
- Study専用サーバー `127.0.0.1:5190`、詳細debug有効。既存のHTTP APIをPowerShellから逐次呼び、public DTOとdebug専用DTOを観測。通常UI/APIへHiddenを追加していない。
- 比較用の新規コード／測定スクリプトファイルは作成せず、モデル取得・モデルファイル変更・量子化変更なし。
- 教材fixtureは引き続き人間レビュー待ち。本書の品質評価もエージェントによる観察であり、人間の承認や教育効果の検証ではない。

| 略称 | exact model ID | API architecture | API quantization | 選定理由 |
|---|---|---|---|---|
| M | `ministral-3-8b-instruct-2512` | `mistral3` | `Q4_K_M` | 既存baselineを今回再測定 |
| Q | `qwen/qwen3.6-35b-a3b` | `qwen35moe` | `Q4_K_M` | 指定されたQwen 3.6 A3B系 |
| G | `google/gemma-4-e4b` | `gemma4` | `Q4_K_M` | ローカルGemmaの軽量候補 |

モデル一覧で3候補の存在を確認。Gemmaには12b、26b-a4bの候補もあったが今回は使用しない。QwenのMTP版や別量子化版への置換もしない。開始時は全モデル未ロード。前のモデルをunloadした後だけ次へ進む。

## Fixed P0 Conditions

- source / prompt / fixture / policy / leak detector / schema: 変更なし。
- temperature 0、Task最大2048 tokens、Tutor最大512 tokens。
- per-call timeout 120秒、step total timeout 300秒、retryなし。
- Call 1: Task Definition + Reference + Rubric。fixtureとの厳格な一致検査を維持。
- Call 2: Tutor。level 0 explanation固定（schema enum＋受信後検査）、ask_question / explainの2択。
- Tutor deltaはbufferし、schema → action → hint/leak → stale/cancel確認後に一括公開。
- 1試行1つの新規Session。同じモデルで移項、季節、変数、移項再実行の順。モデル中の同時実行なし。
- 各モデル初回はAPIで`not-loaded`を確認したcold。すでに未ロードだったため対象の事前unloadは不要だった。後続3件は明示unloadせず連続して実行するwarm。OS再起動・disk cache消去なし。
- coldのCall 1にはLM Studio側の自動ロード待ちを含む。ロードだけの独立時間は既存Providerでは分離できない。モデル切替unloadは別途計測する。
- token usageは取得できないため推測しない。文字数は既存P0計測のUTF-16 code unit。input_charsはmodel IDとschemaを含むJSON全体であり、IDの長さによる差は残る。

## Results

時間はサーバー計測。成功時のTotalは検査後の公開確定まで。**†はFAILEDまでの時間であり、公開latencyではない。** HTTP転送の終了時刻とは区別する。

| 試行 | Model | Problem | Cold/Warm | Call 1 秒 | Tutor 秒 | Total 秒 | call数 |
|---|---|---|---|---:|---:|---:|---:|
| M1 | M | 移項 (transpose) | cold | 24.579 | 4.050 | 28.631 | 2 |
| M2 | M | 季節 (seasons) | warm | 21.156 | 5.882 | 27.039 | 2 |
| M3 | M | 変数 (variable) | warm | 18.477 | 3.107 | 21.585 | 2 |
| M4 | M | 移項 (transpose) | warm | 20.038 | 3.712 | 23.750 | 2 |
| Q1 | Q | 移項 (transpose) | cold | 42.261 | 19.675 | 61.947† | 2 |
| Q2 | Q | 季節 (seasons) | warm | 18.256 | 19.803 | 38.059† | 2 |
| Q3 | Q | 変数 (variable) | warm | 45.952 | 19.693 | 65.645† | 2 |
| Q4 | Q | 移項 (transpose) | warm | 21.134 | 18.458 | 39.593† | 2 |
| G1 | G | 移項 (transpose) | cold | 29.617 | 17.195 | 46.826 | 2 |
| G2 | G | 季節 (seasons) | warm | 15.316 | 17.802 | 33.119 | 2 |
| G3 | G | 変数 (variable) | warm | 13.967 | 18.046 | 32.013 | 2 |
| G4 | G | 移項 (transpose) | warm | 15.480 | 16.540 | 32.020 | 2 |

| 試行 | Task schema / fixture | Tutor schema | Leak Check | 最終state | action | next_question | error category |
|---|---|---|---|---|---|---|
| M1 | PASS / PASS | PASS | machine_checks_passed | ACTIVE | explain | なし | — |
| M2 | PASS / PASS | PASS | machine_checks_passed | ACTIVE | ask_question | あり | — |
| M3 | PASS / PASS | PASS | machine_checks_passed | ACTIVE | explain | なし | — |
| M4 | PASS / PASS | PASS | machine_checks_passed | ACTIVE | explain | なし | — |
| Q1 | PASS / PASS | FAIL（空本文） | 未実施（schemaで拒否） | FAILED | — | なし | TUTOR_OUTPUT_REJECTED |
| Q2 | PASS / PASS | FAIL（空本文） | 未実施（schemaで拒否） | FAILED | — | なし | TUTOR_OUTPUT_REJECTED |
| Q3 | PASS / PASS | FAIL（空本文） | 未実施（schemaで拒否） | FAILED | — | なし | TUTOR_OUTPUT_REJECTED |
| Q4 | PASS / PASS | FAIL（空本文） | 未実施（schemaで拒否） | FAILED | — | なし | TUTOR_OUTPUT_REJECTED |
| G1 | PASS / PASS | PASS | machine_checks_passed | ACTIVE | ask_question | あり | — |
| G2 | PASS / PASS | PASS | machine_checks_passed | ACTIVE | ask_question | あり | — |
| G3 | PASS / PASS | PASS | machine_checks_passed | ACTIVE | ask_question | あり | — |
| G4 | PASS / PASS | PASS | machine_checks_passed | ACTIVE | ask_question | あり | — |

Qのdebug_summary.machine_checkは `rejected` だが、理由は `invalid_json_schema_or_action`。answer leak判定へは到達していないため、表では「未実施」と表記した。全12試行でCall 1のReferenceを受理し、全12試行でTutorを呼んだ。

| 試行 | Task input chars | Task output chars | Tutor input chars | Tutor output chars |
|---|---:|---:|---:|---:|
| M1 | 1875 | 595 | 1406 | 74 |
| M2 | 1860 | 580 | 1391 | 147 |
| M3 | 1846 | 566 | 1380 | 69 |
| M4 | 1875 | 595 | 1406 | 74 |
| Q1 | 1867 | 445 | 1398 | 0 |
| Q2 | 1852 | 430 | 1383 | 0 |
| Q3 | 1838 | 416 | 1372 | 0 |
| Q4 | 1867 | 445 | 1398 | 0 |
| G1 | 1865 | 595 | 1396 | 141 |
| G2 | 1850 | 580 | 1381 | 149 |
| G3 | 1836 | 566 | 1370 | 131 |
| G4 | 1865 | 595 | 1396 | 141 |

### 集計

| Model | Task schema | fixture整合 | Tutor schema | 公開 | ask_question | explain | 空本文拒否 |
|---|---:|---:|---:|---:|---:|---:|---:|
| M | 4/4 | 4/4 | 4/4 | 4/4 | 1/4 (25%) | 3/4 | 0/4 |
| Q | 4/4 | 4/4 | 0/4 | 0/4 | 0/4 | 0/4 | 4/4 |
| G | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 (100%) | 0/4 | 0/4 |

率の分母は予定した4試行。Qにはschema-validなTutorが0件なので「有効Tutor中のask_question率」は定義しない。総計Task 12/12、Tutor 8/12、公開8/12。schema-valid 8件の字句leak検査は8 PASS／0 reject。ただし意味的な漏れなしとは言えない。

### cold / warmと切替

同じ移項のcold→warm再実行で、Mは28.631→23.750秒（差4.881秒）、QはFAILEDまで61.947→39.593秒（差22.354秒）、Gは46.826→32.020秒（差14.806秒）。モデルごとのwarm 3件平均はM 24.124秒、Q FAILEDまで47.766秒、G 32.384秒。異なる問題を含む平均であり性能順位には用いない。

モデル切替時のunloadコマンド完了時間はM 596.668ms、Q 903.251ms、G 709.944ms。これらはStudy latencyに含めていない。cold内の自動load時間はCall 1と分離計測できていない。

参考に実行中のCLI表示ではQはcontext 65536 / parallel capacity 1、Gはcontext 8192 / parallel capacity 4だった。これは既存のモデル別設定を観察したもので変更していない。実際のStudy要求は常に逐次1件。Mの同項目は未記録。したがって本実験は**同じP0要求を各ローカル配置モデルへ渡した比較**であり、backend・context容量・モデルpresetまで統一した純粋な重み比較ではない。

各モデルの移項cold/warm間で、raw Taskおよびraw Tutor文字列はともに完全一致した（QのTutorは両方空）。各2回の一致にすぎず、一般的な安定性は未確定。

## Tutor Observation

### 各Tutorの問い（省略・言い換えなし）

- **M1 移項**: explainのみ。next_questionなし。
- **M2 季節**: 「その理由を考えるために、太陽からの光や熱が地球上でどう変化しているのかを思い浮かべてみましょう。」
- **M3 変数**: explainのみ。next_questionなし。
- **M4 移項**: explainのみ。next_questionなし。
- **Q1 移項**: Tutor本文0文字。未公開。評価できる問いなし。
- **Q2 季節**: Tutor本文0文字。未公開。評価できる問いなし。
- **Q3 変数**: Tutor本文0文字。未公開。評価できる問いなし。
- **Q4 移項**: Tutor本文0文字。未公開。評価できる問いなし。
- **G1 移項**: 「この「天秤」の比喩は、移項する際にどのような点に着目させてくれると思いますか？」
- **G2 季節**: 「このヒントから、地球の異なる場所で同時に違う季節になる理由について、何か考えられることはありますか？」
- **G3 変数**: 「この「点数」という情報を扱うとき、何が必要になってくると思いますか？」
- **G4 移項**: 「この「天秤」の比喩は、移項する際にどのような点に着目させてくれると思いますか？」

全公開応答のexplanationは固定fixture文言に一致。移項は「等号を、左右がつり合った天秤にたとえて考えてみましょう。」、季節は「日本が夏のとき、オーストラリアはどの季節でしょう。」、変数は「ゲームで点数を表示する場面を考えてみましょう。」。説明文の日本語品質は今回モデル間で比較できない。

### 人間レビュー向け観察 A〜H

主観的な観察であり正解ラベルではない。A=日本語、B=問いを返したか、C=質問として成立、D=level 0、E=核心の先出し、F=次に考える点、G=機械的か、H=説明だけで停止したか。

| 試行 | A 日本語 | B/C 問い・成立 | D/E 範囲・核心 | F 次に考える点 | G 機械的か | H 説明のみ |
|---|---|---|---|---|---|---|
| M1 / M4 | 自然な固定短文 | なし／対象外 | level 0固定、直接核心なし | 天秤を想像するだけで着眼点が弱い | 固定文だけで定型的 | はい |
| M2 | 文法上自然 | フィールドあり、実文は「思い浮かべてみましょう」という指示 | 光・熱の変化へ誘導。level 0外のヒント候補。地軸等の核心の直接提示はない | 考える対象はあるが何を答えるか曖昧 | 丁寧だが一般的な促し | 形式上いいえ、実際の質問としては弱い |
| M3 | 自然な固定短文 | なし／対象外 | level 0固定、直接核心なし | 点数表示の場面まで | 固定文だけで定型的 | はい |
| Q1〜Q4 | 評価不能 | なし／出力失敗 | 漏れ判定も評価不能 | なし | 評価不能 | 説明もない。FAILED |
| G1 / G4 | 自然な疑問文 | あり、1つの問いとして成立 | 天秤の比喩を使い、解法や同じ操作の原則を先に述べない | 「どのような点」が抽象的。着眼を促すが初学者には難しい可能性 | 固定説明とのつなぎはやや定型的 | いいえ |
| G2 | 自然な疑問文 | あり、理由を尋ねている | 南北半球比較を維持。地軸や日照時間は先に述べない | 理由を自由に考える問いで範囲は広い | 「何か考えられること」は一般的 | いいえ |
| G3 | 自然な疑問文 | あり、必要なものを尋ねている | 点数という情報の扱いに留まり、名前・保存の定義を答えとして提示しない | 「何が必要」が広く、具体的手がかりは少ない | 定型的な面はあるが対話として成立 | いいえ |

M2のnext_questionを意味的な踏み込み疑いとして人間レビューへ残す。機械検査PASSから安全を推定しない。Gの4件は観察した範囲で直接的な答え提示が見当たらなかったが、教育的に最適／漏れなしの認定ではない。実際の学習者への有効性は未測定。

## Failures

- **Q1〜Q4**: Task schema・fixture整合はPASS。TutorのProvider処理はsucceeded扱いで終了したが、onText本文は0文字。JSON検査でTUTOR_OUTPUT_REJECTEDとなり、未公開のままFAILED。自動／手動再試行を追加していない。
- Qの空本文を「推論が終わらなかった」「512 tokenを思考に使い切った」等とは断定しない。既存Providerからfinish_reason詳細、usage、reasoningの観測値を得ていないため原因は未確定。
- **M1/M3/M4**: schema上合法なexplainのみ。ask_questionを優先するpromptの意図を十分満たさないが、仕様が許すため公開される。
- **M2**: ask_questionを名乗るがnext_questionは疑問文ではない。字句チェックを通っても、良い問いの成立までは保証しない。
- 全モデルのCall 1にMarkdown fence、extra key、wrapper、fixtureからの逸脱、許容外の言い換えは観察されず、REFERENCE_REJECTEDは0件。Qの出力文字数が小さいのは主にJSONの空白・改行差で、参照情報の欠落はない。
- timeout、Provider error、機械的answer-leak rejectは0件。Qのschema拒否4件と、M2の意味的懸念をこれらと混同しない。

失敗に合わせたprompt／schema／policy／detector修正なし。Task最大2048、Tutor最大512、timeoutも維持。

## Comparison

- **Ministral**: 全4試行を公開でき、今回の公開latencyは21.585〜28.631秒。固定説明だけを選ぶ傾向が強く、質問の継続性が弱い。季節の1件も指示文だった。
- **Qwen**: 厳格なReference再現は4/4で成立。Tutorはすべて空本文で失敗し、このP0条件との組合せではTutor品質を比較できなかった。モデル一般の能力不足とは結論しない。
- **Gemma**: 全4試行で1つの疑問文を返し、公開も4/4。今回の公開latencyは32.013〜46.826秒。Mより問いを返す点で改善した一方、問いは抽象的で、Tutor call自体も16.540〜18.046秒と長い。

**判断はB＋Dに近い。** モデルを替えるだけで問いを返す傾向は改善した（Aの限定的な観察）が、質問の成立、具体性、level 0の意味的境界はHarness側でも扱う必要がある。3問・各モデル4試行しかなく、質や安定性の一般評価には不足。CについてはHarnessを固定した本実験だけでは、制御方式とモデルの寄与を分離できない。

## Open Questions

### モデル差で改善できそうな問題

- 同じschemaでもask_questionを選ぶ頻度と疑問文を作る傾向には差があった。Gemmaを次の比較候補にする根拠はある。
- Qの空本文は互換性・制約設定との相性を含めて原因確認が必要。今回の設定のままでは学習支援へ使用できない。

### Harness側で検討する候補（今回は未適用）

- 問いが必須ならask_questionを必須とする別条件を試す。ただし構造が正しくても良い問いとは限らない。
- 疑問文の成立、答えや上位ヒントの先出し、次に考える点の明確さを別の評価項目にする。語尾が「？」かどうかだけで合格にしない。
- 空本文の原因分析用にfinish reason、usage、reasoning出力の有無を測定できるかを検討する。Hidden本文を通常UIへ出さない境界は維持する。
- 説明固定と自由な問いの組合せが適切か、教材ごとの具体的な問い方を独立に検証する。

### まだ判断不能なこと

- 学習効果、全6問や自由問題への一般化、モデルの普遍的順位、意味的leak率。
- Qの空本文の原因、モデルpreset・context・backend設定がlatencyに与えた寄与。
- cold/warm各1回、固定順序でのばらつき。温度0でも再現性を保証する十分な反復数はない。

**次に制御方式を試す価値はある。** まず同じ条件で反復数を増やし、その後は1モデルを固定してpromptまたはschemaの1要因だけを変える別実験にする。モデル交換と制御変更を同時に行わない。教材の人間確認も引き続き必要。P1、Router、Evaluator、DB統合へ進める判断は今回行わない。

## Preservation

開始時の既存追跡／未追跡154ファイルは実験後もSHA-256一致、変更0件。P0 source、既存test、既存design/results、package、migration、本体を維持した。今回の追加は本書1件だけ。既存testは変更しておらず、コード変更のない比較実験のため再実行はしていない。

開始前からある未追跡P0ファイルはそのまま残す。未コミットなのでgit diffだけでは保全を判断せず、ハッシュで確認した。commit / push / tagなし。比較終了後に専用サーバーを停止し、使用モデルをunloadして終了する。


固定条件を特定するための主要ファイルSHA-256（開始時＝終了時）:

| ファイル | SHA-256 |
|---|---|
| `docs/study-p0-design.md` | `EDF75C5E6BE76C5DBD2DCEE8C502D92B057BABD98BEF0FA1B84B857C3B7008B7` |
| `docs/study-p0-results.md` | `3D0C1AB0DF2F0344678C7CB1DA1C831DAC5F045260643A8A24C4527063586F27` |
| `src/study-poc/coordinator.ts` | `561CF9667F86E78EF5F49CF2CC9675141A7911952FCA8B0D65AFF2340BF96C6E` |
| `src/study-poc/problems.ts` | `84DEDB94F64B8EBAA82D05F329FD969E37E9E47F8DC64269FAD02AB8D74717E8` |
| `src/study-poc/schema.ts` | `DD1D4C8F99963598410F6F2060D95F33CFEAFAEDD622D4A387849DC11A05CB0A` |
| `src/study-poc/validation.ts` | `6543CF0B76C38A53FC2E5F19F9D296A47DD97744AD9633565578009E3DB6D306` |
| `tests/study-poc.test.ts` | `932112098E9BCB58B1E32AF72291B91C56F1FFA15B24AB928FA584857571B620` |

終了時に専用サーバー停止、LM Studioのloaded model 0件を確認。tracked/cached diff checkおよび本書の新規ファイルwhitespace checkに診断なし。
