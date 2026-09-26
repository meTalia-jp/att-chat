# Study Mode PoC — P0設計

## 範囲と起動

Att-Chatの本体とは別のHTTPサーバー・React entryで動作する、固定問題の初回学習支援実験。DBを開かず、Repository、GenerationService、Semantic Worker、S3/S4/S5、Question Keepへ接続しない。既存の`src/server/provider.ts`のLMStudioProviderだけを変更せず再利用する。新しいpackage、migrationはない。

PowerShellでリポジトリルートから実行する。

```powershell
node node_modules/vite/bin/vite.js build --config vite.study.config.ts
node --experimental-strip-types src/study-poc/serve.ts
```

通常画面は`http://127.0.0.1:5190/`。停止はCtrl+C。本体用`npm start`ではStudyを起動しない。ポートは`STUDY_POC_PORT`で変更可能。LM Studioの接続先は既存Providerと同じ`LM_STUDIO_BASE_URL`（既定`http://127.0.0.1:1234/v1`）。ローカルのロード済み／ロード可能モデルを選び、ダウンロード管理はしない。

詳細検証時だけ、起動前に`$env:STUDY_POC_DEBUG='1'`を設定し、`/debug`を開く。通常起動に戻すには`Remove-Item Env:STUDY_POC_DEBUG -ErrorAction SilentlyContinue`後に再起動する。URLのqueryだけでは詳細debugを有効化できない。

## Sessionと状態

SessionはMapに最大100件、プロセス内のみ保持する。Task Definition、Reference、raw出力、AbortControllerもサーバー内だけに置く。自動失効はP0では未実装。Restart Sessionは旧Sessionを破棄し新しいIDを発行する。サーバー再起動では全Sessionが消える。ブラウザのsessionStorageにはIDだけを置く。Hidden Stateは保存しない。

| 操作／結果 | 状態 | 公開 |
|---|---|---|
| Session作成 | PAUSED | Task未開始 |
| 開始、Call 1、Tutor検査中 | PREPARING | 問題と測定値のみ |
| 2 call完了＋全検査＋identity確認 | ACTIVE | 検査済みTutorを1回で公開 |
| Stop / Pause | PAUSED | 以後の出力は破棄 |
| schema / Reference / leak / Provider / timeoutエラー | FAILED | error codeのみ、未承認出力なし |
| Restart Session | 新SessionのPAUSED | 旧Taskを引き継がない |

Pauseは保存済み学習を再開する機能ではなく、P0ではStopと同じ中断操作。次の問題はRestart後に開始する。COMPLETE、評価、回答送信、Topic Switchはない。入力欄は次Phaseとして無効化する。

## fixtureとCall 1

6問は移項、分数、比例、季節、変数、loop。`problems.ts`はサーバー専用であり、回答・許容回答・rubric・誤解・解法・ヒント・禁止表現を含む。通常APIの問題一覧はID・タイトル・問いの3項目だけ。

**教材はエージェント作成の草案であり、人間確認済みとは扱っていない。** `verified_answer`というフィールド名は要求仕様に合わせているが、教材担当者の承認を意味しない。通常画面にも「人間レビュー待ち」を表示する。人間による6問の正解、rubric、許可ヒント、禁止表現の承認がP0の未完条件。

Call 1はTask Definition / Reference / rubric mappingを1回で構造化出力する。P0ではfixtureから作ったexpected proposalを入力し、その正確な構造化出力を要求する。JSON/schema検査後、タイトル・問い・目標・配列をfixture値と比較し、回答はverified_answerまたはaccepted_alternativesに一致した場合だけ受け入れる。不一致はREFERENCE_REJECTED、schema不正はTASK_SCHEMA_INVALID。自動修復・再生成なし。

この保守的な設計は**自由に生成されたReferenceの意味的な正誤判定を検証するものではない**。正しい言い換えも許容リスト外なら拒否する。P0の主対象は検証ゲートと公開境界である。

## Tutor入力、bufferと公開

Call 2にはpublic task、criterion ID、hint level 0、level 0のhint IDと文言、explanation policy、allowed actionsだけを渡す。Reference、解答、solution_steps、rubricの判定文、誤解一覧、上位ヒントは渡さない。explanationはlevel 0の文言を使い、原則1つの短い問いを返すよう指示する。許可actionはask_question / explainだけ。

両callにresponse_formatのJSON Schemaを指定する。仕様は[LM Studio Structured Output](https://lmstudio.ai/docs/developer/openai-compat/structured-output)を参照。Providerが制約を守ったと仮定せず、ローカルで追加キー、型、actionを再検査する。新しいSDKは使わない。

Provider.onTextはサーバーメモリのbufferへ追記するだけ。Tutor JSON parse → schema/action → hint level → leak checks → event-loop yield → task/step/attempt/AbortSignal確認 → 公開DTO確定、の順。start HTTP応答は最後までbufferし、SSEをブラウザへ転送しない。poll APIにもraw deltaは含めない。

## leak checksの範囲

NFKC・小文字化・空白／記号除去後に次を検査する。

- 正解／許容回答の一致と代表的禁止表現
- 許可していないhintの全文一致
- Reference回答／解法の連続20文字一致
- 不許可hint level、完了宣言の一部表現

疑わしい場合はTUTOR_OUTPUT_REJECTEDとして非公開にする。schema不正／不許可actionも同じ公開error code。詳細な理由はdebug専用。PASSの表示は`machine_checks_passed`。

実測で説明文の言い換え漏れが確認されたため、最終版では**explanationをfixtureのlevel 0文言に完全一致させる**。ProviderのJSON Schemaのenumと受信後の検査で二重に制限する。不一致はexplanation_outside_level_zeroとして拒否する。生成されるnext_questionは上記の字句検査の対象だが、意味的な安全性は保証しない。これは自由なTutor説明生成を将来の検証に残す、P0固有の制限。

**Tutor自身が問題を解けるため、Referenceを渡さなくても答えを生成できる。字句検査では言い換え・分散したヒント・教育的な踏み込みを完全には検出できない。** 実測で見逃しが発生し代表表現を追加したが、一般化した意味検査ではない。漏れなし、教育的に適切、学習効果あり、とは結論しない。

## Hidden / Public分離

通常DTOは明示的な項目選択から作り、spreadでSession全体を返さない。public_task、公開history、検査済みTutor、状態、数値測定・error codeだけを返す。raw Proposal / Reference / raw Tutor / 拒否理由は別debug APIだけ。CSSで隠す方式ではない。通常consoleへ本文を出さない。クライアントentryからfixtureをimportしない。

debug有効化はローカル実験担当者向けであり認証機能ではない。サーバーは127.0.0.1でlistenし、Host/Originを確認する。Session IDは認証秘密ではなく、複数利用者向けサーバーとして公開しない。

## cancel / stale / 時間制限

- per-call 120秒、step全体300秒、retry 0回。
- サーバー全体で同時Stepは1件。二重実行はSTEP_BUSY。
- task_id / running_step_id / attempt_idとSessionの実体、AbortSignalを各call後・delta処理・publish直前で照合。
- Stop / Pauseでabortしattemptを無効化する。接続切断も中断。
- AbortSignalを無視するfakeでもPromise.raceによりアプリ側は中断し、遅延出力を破棄する。
- 32,000文字を超える出力は中断。HTTP入力16KB、モデル名300文字などの上限を持つ。

アプリ側のcancel応答時間はモデル推論の停止完了時間ではない。既存Providerのfetch abortを再利用するが、LM Studio内部でいつ計算が止まるかはP0から保証しない。Providerがabortを無視する場合に、モデル側で前の計算と次の計算が重なることまでは防止できない。

## 測定と今後

Call時間はProvider呼出しから終了まで、input_charsはresponse_formatを含むリクエストJSONのJS文字列長（UTF-16単位）、output_charsは受信テキスト長。total_msは検証と公開処理を含む。cancel_msはサーバーの無効化処理時間でありHTTP往復とは別。token数はProviderから取得できないため記録しない。

P1候補は人間承認教材での再検証、見逃し／誤検出ケースの拡充、Tutor自然さと問いの粒度の確認。その後にユーザー回答とEvaluatorの独立した設計を行う。P0でRouter/Evaluator/COMPLETE/Topic Switch、DB、既存Conversation/Run、Semantic Context、Mode Frameworkは実装しない。

## 人間レビュー用教材要約（未承認）

完全な回答候補、rubric、禁止表現は`src/study-poc/problems.ts`にある。下表も承認済み教材ではない。

| 問題 | 正解の要点 | rubricの要点 | 初回level 0 |
|---|---|---|---|
| 移項 | 等式の両辺へ同じ加減を行う表記 | 等式保持とx+3=7の例 | 左右のつり合う天秤を考える |
| 分数 | 同じ全体の半分は4等分の2つ分 | 同じ全体、量の保存 | 同じ大きさの紙を思い浮かべる |
| 比例 | 対応する倍率が同じ、比が一定 | 倍率と比 | 同じ値段の商品を買う場面 |
| 季節 | 地軸の傾きで日照時間と太陽高度が変化 | 傾きと日射 | 日本が夏のときのオーストラリア |
| 変数 | 値を名前で参照する。更新可能性は言語等に依存 | 名前と値、利用例 | ゲームの点数表示 |
| loop | 回数・条件・対象に従う処理の反復 | 反復と制御 | 十人それぞれへの挨拶表示 |
