# Study Mode PoC — P0検証結果

## Current State

照合日: 2026-09-26。Repositoryのdirty working treeを根拠とする要約。以下のPhase履歴は当時の記録として保持する。実装完了・技術検証・ユーザー評価・本番採用は別の判定。

- Catalog ID: `study-p0`
- Catalog status: `TESTING`
- Current phase: P0。後続の[Model Comparison](study-p0-model-comparison.md)・[Tutor Control Comparison](study-p0-tutor-control-comparison.md)は比較記録のみで、P1/制御変更は未実装。
- Implemented through: implementation complete（P0範囲）。独立runner、6教材草案、2 call、buffer公開、検査、cancel/stale、メモリSession。
- Technical validation: P0の自動・実モデル・実ブラウザ技術検証は以下の記録上完了。後続比較は限定標本の観察で、教育効果や漏れ防止の証明ではない。
- User evaluation: 未完了。6教材の正解/rubric/禁止範囲の人間承認が未達。問いの自然さ、教育効果、待ち時間の受容性も未確定。
- Adopted outputs: 本番採用なし。比較Bの制御は未採用、baseline Aを比較基準として保持。Gemmaは次の比較候補であり本番モデル採用ではない。
- Production impact: 独立Study追加のみ。本番DB/Conversation/GenerationRun非接続。Catalogではrecord-only、Labから起動しない。
- Pending decision: 教材レビューと許容制限の確認後にP0合否を判断。status change candidate: PARTIAL（総合acceptanceの未達を表す場合）。評価待ちのTESTINGも整合するため変更しない。PAUSEDへの明示的停止判断は確認できない。
- Allowed change scope: 今回は本書Current Stateのみ。将来は別途P0依頼の範囲で独立Studyコード・fixture・専用テスト/記録。比較記録の保全条件を守り、教材承認やP1開始を推定しない。
- Excluded scope: 本番Chat/DB、共有Provider改変、P1、Evaluator/Router、支援ボタン・question_goal・選択式UIの無断実装。
- Primary code: [serve](../src/study-poc/serve.ts)、[coordinator](../src/study-poc/coordinator.ts)、[教材](../src/study-poc/problems.ts)
- Primary tests: [Study P0](../tests/study-poc.test.ts)
- Known limitations: level 0固定説明、自由な問いの意味的漏れ見逃し、小標本、メモリSessionの再起動消失。詳細は本文と比較記録。
- Reproduction notes: reproduction risk — 本書・比較文書・Studyコード/教材/テスト/build設定は照合時に未追跡で、HEADだけでは再現不可。比較の測定scriptは保存されていない。起動は[設計](study-p0-design.md)を参照。通常buildと独立Study buildは別。


検証日: 2026-09-16。基準HEAD: `6d52c1f015246f3c0665ef19478fdf3eb71118e1`。

## 判定

**P0の実装と技術検証は完了。人間確認済みfixtureという条件が未達のため、総合合格は保留。**

教材6問はエージェント作成の草案。ユーザーに確認を依頼したが、承認を受けたものとして扱っていない。実モデル試験は「承認前fixtureを用いた技術試験」。P1へは進めていない。commit / push / tagは行っていない。

## 自動検証

| コマンド | 結果 |
|---|---|
| `npm.cmd test` | 213件中211 PASS、0 FAIL、2 SKIP |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run build` | PASS（既存本体） |
| `node node_modules/vite/bin/vite.js build --config vite.study.config.ts` | PASS（独立Study UI） |
| `git diff --check` / `git diff --cached --check` | PASS |
| 新規ファイル個別の`git diff --no-index --check` | PASS |

P0新規28件は全PASS。既存の183 PASSと2 SKIPを維持。2件は既存S1/S2の実Embeddingモデルを要求するopt-inテスト（ATTCHAT_S1_MODEL_DIR / ATTCHAT_S2_MODEL_DIR未指定）。P0の実LM Studio確認はunit testに混ぜていない。

検証項目: serve entryからのruntime import graph、DB/Repository/GenerationService/Context非接続、Session、2 call成功、6 fixtureと代替回答、Task schema、不整合Reference、public欄への解答混入、不正Tutor JSON、action、追加キー、正解・禁止表現・上位ヒント・長いReference一致、level 0説明制限、cancel、timeout、stale、publish直前cancel、同時Step拒否、retryなし、output上限、Provider failure、public API / debug分離、部分delta非公開。

## 実LM Studio試験

モデル: `ministral-3-8b-instruct-2512`、APIのarchは`mistral3`、量子化`Q4_K_M`。既存ローカル配置モデルを使用。新規モデル取得なし。1モデルを順次実行し、同時利用なし。モデルファイルのrevision/hashやハードウェア条件を固定したベンチマークではない。

既存LMStudioProviderを変更せず、Study専用のmessages / response_formatを渡した。最大出力はCall 1が2048 tokens、Tutorが512 tokens、temperature 0。token消費実績はProviderから得られないため報告しない。

### 最終版（説明文をlevel 0へ制限）

| 試行 | Call 1 ms | Tutor ms | 公開まで ms | call数 | schema | leak検査 |
|---|---:|---:|---:|---:|---|---|
| 移項・cold | 23,590.76 | 4,031.31 | 27,623.96 | 2 | 2/2 | machine_checks_passed |
| 季節・warm | 21,056.41 | 5,872.24 | 26,929.45 | 2 | 2/2 | machine_checks_passed |
| 変数・warm | 19,016.42 | 3,101.36 | 22,118.47 | 2 | 2/2 | machine_checks_passed |
| 移項・warm再実行 | 19,858.92 | 3,650.12 | 23,509.67 | 2 | 2/2 | machine_checks_passed |

coldは対象モデルを`lms unload`してからの最初の呼出し。OS再起動やディスクcache消去はしていない。warmは同モデルがloadedの状態。同じ移項のcold/warm差は公開まで約4.11秒だが各1回であり、統計的な性能差とは結論しない。

| 試行 | Task input / output文字数 | Tutor input / output文字数 |
|---|---:|---:|
| 移項・cold | 1875 / 595 | 1406 / 74 |
| 季節・warm | 1860 / 580 | 1391 / 147 |
| 変数・warm | 1846 / 566 | 1380 / 69 |
| 移項・warm | 1875 / 595 | 1406 / 74 |

入力はschemaを含むJSON全体、文字数はJS string.length。最終4試行はTask/Tutor計8応答のschema成功8/8、schema failure 0、leak reject 0、ACTIVE 4/4。ただし「漏れなし」の証明ではない。

教育的自然さの観察:

- 移項: level 0の天秤の説明のみ。`explain`であり次の問いなし。
- 季節: 南北半球の比較から、光や熱について考えるよう促した。`ask_question`だがnext_questionは疑問文ではなく指示文。問いの粒度・踏み込みは人間評価が必要。
- 変数: ゲームの点数表示を考える説明のみ。次の問いなし。

日本語表示は成立したが、原則1つの良い問いを毎回返せる品質は確認できていない。教育効果は評価していない。

### 調整前の失敗・見逃しも記録

1. response_formatなしの最初のcold試行はCall 1がMarkdown囲み・wrapper・配列型不正。32,996.21ms、入力779文字／出力958文字。TASK_SCHEMA_INVALIDでTutorを呼ばず非公開。schema 0/1。
2. JSON Schema追加後、説明文制限前の3問はschema 6/6だったが、移項の同量操作、季節の日照時間、変数の定義が初回説明に出た。字句検査が3例を通してしまった。代表禁止表現と回帰テストを追加。
3. 指示文を強めた後の4試行はschema 8/8だったが、移項の再実行で解法まで説明した。公開27〜34秒程度の試行を含む。プロンプトだけの制約では不十分と判断。
4. 最終版は説明をlevel 0のfixture文言へschema enum＋ローカル完全一致検査で制限。過去の失敗を削除・自動修復・自動retryして成功率へ混ぜていない。

最終版の8/8は制限を追加した後の別標本であり、すべての試行を通算した成功率ではない。任意のTutor説明生成が成立したとは主張しない。

## cancel・UI・再起動

実モデルCall 1開始から約2秒後にStop。停止API往復 **5.97ms**、サーバーのabort/attempt無効化 **1.14ms**。Call 1は2,013.48msで中断、63文字まで受信したがTutorなし、公開historyは問題1件のみ、PAUSED。これはLM Studio内部の計算停止完了時刻ではない。

実ブラウザ（Codex in-app browser）で確認:

- 6問とモデルの選択、開始、PREPARING中にTutor本文が出ない。
- 季節問題で完了後に説明と問いを一括表示、ACTIVE。
- PauseでPAUSED、再読込後も同じ公開Session表示。
- 別試行で生成中にStop、PAUSED/CANCELLED、Tutor未表示。
- 再読込後の問題選択がSessionの問題と一致するよう修正して再確認。
- サーバー再起動後、旧Session取得は404、UIは未開始へ戻る。
- debugを指定しない専用サーバーで`/debug`は404。

Restartによる旧Session破棄と遅延結果の無効化、publish直前cancelはfake Providerの自動テストで確認。詳細debug有効時の専用APIと、通常APIにReferenceが出ないことも自動テストで確認。

## 既存本体の保全

既存追跡ファイルのdiffは0。追加ファイルだけで実装した。

- migration全件、package.json / lock、Repository、GenerationService、LMStudioProvider、Conversation/Turn/Run保存フローは無変更。
- S0〜S5、Mode B、Question Keep、Highlight、selection-pocは無変更・非接続。
- Study entryのruntime import graphはNode標準モジュール、Study専用コード、既存Providerのみ。DB open、migration、recovery、Semantic Worker起動なし。
- 本体DBを起動・参照する操作なし。既存回帰テストの一時DBと、本体の保存DBは区別している。
- RpenProofのPhase 0参照manifest **72件、SHA-256不一致0件**。
- クライアントbuildにfixture回答／Reference生成コードを含めない。実行時にPoCから本体DBへ接続しない。
- `.cache`内の専用build・測定用一時ファイルは既存gitignoreの対象。

## 追加ファイル

- `src/study-poc/contracts.ts`: Session公開契約、Provider境界、測定値。
- `src/study-poc/problems.ts`: サーバー専用の6教材fixture草案。
- `src/study-poc/schema.ts`: Provider向けJSON Schema。
- `src/study-poc/validation.ts`: Task/Reference/Tutor・漏れ検査。
- `src/study-poc/coordinator.ts`: メモリSession、2 call、buffer、cancel/stale。
- `src/study-poc/server.ts` / `serve.ts`: 独立HTTPサーバーとentry。
- `src/study-poc/main.tsx` / `debug.tsx`: 通常／詳細debugの別UI。
- `study-poc.html` / `study-debug.html` / `vite.study.config.ts`: 独立build。
- `tests/study-poc.test.ts`: 28自動テスト。
- `docs/study-p0-design.md` / 本書: 設計、測定、制約。

## 既知の制限とP1へ進む条件

1. 人間による6 fixtureの正解・rubric・禁止範囲確認が必須。現在は未承認。
2. Referenceは固定fixtureとの一致確認に限定。自由な正解生成の検証ではない。
3. 説明文はlevel 0固定。自由生成の問いに意味的見逃しが残る。実測から完全漏れ防止を主張できない。
4. `explain`は仕様上許可しているため、毎回問いを返すことは保証しない。教育的自然さの判定基準をP1前に合意する。
5. モデル・問題数・試行数は小さい。表示まで22〜28秒あり、対話UXとしての妥当性は未決。
6. メモリSessionは再起動で消える。100件制限、idle evictionなし。debugはローカル開発専用で認証なし。
7. 既存Providerからfinish reasonやusageを詳細に取得しない。JSON検査で欠けた出力を拒否するが、モデル側の品質評価はしない。

人間レビューと許容するP0制限の確認後にP0合否を確定し、その後P1を別途指示する。今回はP1・評価器・本体統合へ進めない。
