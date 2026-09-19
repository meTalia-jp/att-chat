# Generation max_tokens 調査・比較実験

## Experiment metadata

- **Experiment title:** Att-Chat Generation上限・空本文調査
- **実施日:** 2026-09-19（Asia/Tokyo）
- **対象:** 通常ChatのLM Studio生成経路
- **状態:** 調査・小規模比較完了
- **実装基準:** working tree（通常Chat UI v0.1未コミット差分を保持）

## 1. 概要

通常Chatで `qwen/qwen3.6-35b-a3b` を使用した際、LM Studio側では生成が進み、出力上限の2,048 tokenに達した一方、Att-Chatが受け取った本文は0文字となった。Att-Chatは空本文を成功扱いせず、Runを `failed`、Assistant Turnを `failed` として保存した。同系統の質問を再送すると本文を受信し、Runは成功した。

本実験は、`max_tokens=2048`、reasoning出力、観測情報不足の関係を整理し、同じモデル・入力で2,048／4,096／8,192を比較することを目的とする。既存の失敗Runは削除・変更していない。

## 2. 初期仮説

### 仮説

1. 2,048 tokenはreasoning系モデルを通常Chatで使うには小さく、最終本文より前に上限へ達する場合がある。
2. `reasoning_content` が同じcompletion token budgetを消費し、本文開始前に枠を使い切った。
3. 2回目は会話履歴、質問文字列、モデルのロード／KV cache状態が変わったため結果が変わった。
4. 上限を4,096または8,192に増やすと、空本文の発生率が下がる。

### 当初不明だった点

- 障害Runの `finish_reason`。
- 障害Runのreasoning量とcontent/reasoning別token数。
- APIが返したusageと最後のstream chunk。
- 質問だけでなく履歴を固定しても空本文が再現するか。

## 3. Known facts（確認済み事実）

1. 障害Runは `max_tokens=2048`、モデルは `qwen/qwen3.6-35b-a3b`、保存本文は0文字、エラーは `本文のない応答です` だった。
2. LM Studioログでは障害Runが2,048 tokenを生成し、約75.45秒の推論後にstreamを終了した。
3. 後続の成功Runも同モデル・`max_tokens=2048` で、LM Studioログ上2,047 tokenを生成し、Att-Chatには738 UTF-16文字の本文が保存された。
4. 失敗時と成功時のUser入力は意味的には同系統だが、保存文字列は2文字異なる。
5. 成功時のrequestには失敗時のUser Turnが追加され、message数は14から15へ増えていた。
6. 成功時はLM StudioのLCP similarityが0.984で、既存KV cacheを再利用していた。モデル状態は完全一致しない。
7. 今回の診断通信ではLM Studioから `delta.content`、`delta.reasoning_content`、`finish_reason`、usage-only chunkを取得できた。
8. 新規比較9件はすべて本文あり、`finish_reason=stop` で終了した。空本文は再現しなかった。

## 4. Unknowns（未確定事項）

- 元の障害Runの `finish_reason`、usage、reasoning量。Att-ChatにもLM Studioログにも必要な内訳が残っていない。
- 元の成功Runが `stop` と `length` のどちらで終了したか。
- 空本文がreasoningへのbudget消費だけで発生したか、template／sampling／モデル内部状態も関与したか。
- 4,096への変更が実利用で空本文率をどの程度下げるか。
- LM Studioのprovider default sampling値。requestでtemperature等を指定していないため推測しない。

## 5. 内部設定調査

### Core Chat

`src/server/storage/repository.ts` の `Repository.prepareChat` がrequest snapshotを作る時点で `max_tokens: 2048` を固定している。通常Chat、Question Keepの「このチャットで聞く」「新しいチャットで聞く」の全てに適用される。値はUI入力でもProvider defaultでもない。

- UI `Chat.tsx`: content、model、request_idを送る。上限値を持たない。
- HTTP `http.ts`: 入力をRepositoryへ渡す。上限値を持たない。
- Repository: messagesと上限を含む実request bodyを構築・保存する。
- GenerationService: 保存済みrequest snapshotをProviderへ渡す。上限を決めない。
- LMStudioProvider: opaqueなrequest bodyを送信する。上限を決めない。

Simple Marker ChatはCoreのChat/APIをcompositionしているため同じ値になる。LaboratoryのSimple Marker Chatも専用DBではあるがCoreのRepository／GenerationService経路を再利用するため同じ値になる。

### 別経路

| 経路 | 設定 | 影響 |
|---|---:|---|
| Core通常Chat／Keep質問 | 2048固定 | Repositoryの共通request builder |
| Simple Marker Chat | 2048固定 | Core経路の再利用 |
| Laboratory Simple | 2048固定 | Core経路の再利用 |
| Laboratory Single Text | 2048固定、temperature 0.7 | 専用SingleTextService |
| Study P0 Task call | 2048固定、temperature 0 | Study専用Coordinator |
| Study P0 Tutor call | 512固定、temperature 0 | Study専用Coordinator |
| Mode B ContextBuilder PoC | 2048固定 | preview用。正式送信経路ではない |

### 2048の由来

Git履歴ではPhase 1Bコミット `f5a05976f1bc1ca02a73316b4e106372a227aa32` でCore Chatへ導入された。Phase 1B設計文書には「max_tokensは2048固定」と記録されている。ユーザー要件、モデル仕様、安全上限、性能測定に基づく根拠はコード・コミット・設計文書から確認できないため、採用理由は**不明**とする。Single Text、Study、Mode B PoCの2048は後続Phaseでそれぞれ明示的に追加されており、一つの共通defaultではない。

## 6. 現在の観測可能性

| 情報 | LM Studioから取得可能か | 現Providerの処理 | 永続保存 |
|---|---|---|---|
| `delta.content` | 可能 | onTextへ渡す | Turn本文とcheckpoint |
| `finish_reason` | 可能 | `stop` / `length`か検証後に破棄 | なし |
| usage | `stream_options.include_usage=true`で可能 | 現requestは要求せず、Providerも破棄 | なし |
| `reasoning_content` | 今回のモデルで可能 | 未参照・破棄 | なし |
| reasoning token内訳 | 今回のusageには専用内訳なし | 未対応 | なし |
| 最後のJSON chunk | 可能 | 処理後に破棄 | なし |
| `[DONE]` | 可能 | 正常終了検証のみ | なし |
| request body | 可能 | そのまま送信 | GenerationRun.request_snapshot |
| status/error | アプリ側で決定 | 状態遷移に利用 | GenerationRun/Turn |

現Providerはchoice index 0の本文だけを公開する。tool callは拒否し、usage-only chunkは実質的に読み飛ばす。reasoningを本文へ混ぜない動作は妥当だが、本文0文字時の診断材料も同時に失われる。

## 7. 実験条件

- **モデル:** `qwen/qwen3.6-35b-a3b`
- **接続:** LM Studio OpenAI互換API `http://127.0.0.1:1234/v1`
- **stream:** true
- **temperature:** requestで未指定（provider default）。実値は不明。
- **stream_options:** 診断時のみ `{ include_usage: true }`
- **上限:** 2048 / 4096 / 8192
- **条件Iの入力:** 「アメリカの中間選挙について教えて」
- **条件I:** 履歴なし、User message 1件。各上限2回、計6件。
- **条件H:** 元の失敗Runのrequest snapshot（14 messages、末尾は「アメリカの中間選挙に関して教えて」）を複製し、上限だけ変更。各上限1回、計3件。
- **保存:** `.cache`内のJSON。通常DBとExperimentRunには書き込まない。
- **評価:** status、content/reasoning UTF-16文字数、時間、usage、finish_reason、chunk情報。

温度を固定していないため、各Runの生成内容は確定的ではない。条件Hでは元のrequestを再利用したが、モデルプロセスとKV cacheの状態までは再現していない。

## 8. Runs / observations

### 既存の観測Run

| Run | 条件 | max | 結果 | content文字 | LM生成token | 時間 | finish | reasoning |
|---|---|---:|---|---:|---:|---:|---|---|
| O1 | 実利用、14 messages | 2048 | failed | 0 | 2048 | 89.8秒（アプリRun） | 不明 | 不明 |
| O2 | 実利用、15 messages、質問文字列も差異あり | 2048 | succeeded | 738 | 2047 | 73.6秒（アプリRun） | 不明 | 不明 |

O1は消さず、DB上のfailed Runとして保持している。O2はO1と完全同条件ではない。

### 条件I：履歴なし（各2回）

| max | 回 | 結果 | content文字 | reasoning文字 | completion tokens | prompt tokens | 時間 | finish |
|---:|---:|---|---:|---:|---:|---:|---:|---|
| 2048 | A | succeeded | 1273 | 1869 | 1474 | 16 | 70.3秒 | stop |
| 2048 | B | succeeded | 1583 | 2539 | 1813 | 16 | 64.4秒 | stop |
| 4096 | A | succeeded | 1314 | 3078 | 1920 | 16 | 68.4秒 | stop |
| 4096 | B | succeeded | 1466 | 2240 | 1635 | 16 | 57.5秒 | stop |
| 8192 | A | succeeded | 1372 | 3973 | 1954 | 16 | 68.6秒 | stop |
| 8192 | B | succeeded | 1253 | 1251 | 1046 | 16 | 37.8秒 | stop |

### 条件H：障害時履歴snapshot（各1回）

| max | 結果 | content文字 | reasoning文字 | completion tokens | prompt tokens | 時間 | finish |
|---:|---|---:|---:|---:|---:|---:|---|
| 2048 | succeeded | 846 | 3206 | 1776 | 922 | 69.3秒 | stop |
| 4096 | succeeded | 813 | 3423 | 2033 | 922 | 73.1秒 | stop |
| 8192 | succeeded | 1623 | 3083 | 2184 | 922 | 78.2秒 | stop |

全診断Runで `reasoning_content` が観測された。reasoning文字数はtoken数ではなく、usageのcompletion tokensはreasoningとcontentを合わせた値である。terminal JSON chunkは `finish_reason` を含み、usageは別のusage-only chunkとして届いた。

## 9. Result

### 確認できた事実

- 元障害Runは上限2,048 tokenを完全に消費し、本文0文字だった。
- 同モデルはreasoningとcontentを別deltaで返す。
- completion budgetにはreasoningも含まれている。診断Runのcompletion tokensはreasoning＋contentの合計で増えた。
- 4,096／8,192では2,048を超えるcompletion（最大2,184 token）が実際に発生した。
- 2,048条件も、新規3回（条件I 2回＋条件H 1回）は全て本文ありで成功した。

### 強く示唆されたこと

- 元障害は、reasoning等が2,048枠を使い切り、本文開始前に終了した可能性が高い。
- 2,048は今回のモデルでは余裕が小さい。実障害1件と、成功でも2,047 tokenに達した実利用Runがある。
- 4,096は今回観測された最大2,184 completion tokenを収容し、8,192より小さい暫定候補になる。

### 断定できないこと

- 2,048だけが原因とは断定できない。固定snapshotの2,048再実行は成功した。
- 4,096で空本文が完全になくなるとはいえない。
- 8,192が品質を改善するとはいえない。今回、出力上限と内容量・時間には単調な関係がなかった。
- O1のreasoning量とfinish_reasonは復元できない。

## 10. Interpretation

初期仮説1～3は部分的に支持された。上限到達、reasoningの存在、履歴・文字列・cache状態の差は事実として確認できた。仮説4は「上限を上げる余地がある」ことまでは支持されたが、空本文低減率は測定できていない。

今回の9件だけで8,192をdefaultにする根拠はない。4,096は実測最大値に対する余裕と計算時間の上限を釣り合わせやすいが、診断情報を正式に記録した後に通常Chatだけで評価すべきである。

## 11. 実施した改修

- `scripts/generation-diagnostic.ts` を作業専用治具として追加した。
- ProductionのProvider、GenerationService、Repository、UI、DB schema、migrationは変更していない。
- 通常Chatのdefault 2048は変更していない。
- Productionの診断情報保存も追加していない。
- Study P0、Laboratory v0.1契約、Single Textの設定は変更していない。

診断治具は本文やreasoningそのものを結果JSONへ保存せず、長さとmetadataだけを記録する。履歴snapshotを使う場合、その入力ファイルは `.cache` に置く。

## 12. 治具・Equipment

### 使用した既存Equipment / Component

- LM Studio OpenAI互換Chat Completions API。
- 実モデル `qwen/qwen3.6-35b-a3b`。
- Att-Chat SQLiteのGenerationRun/request snapshot（read-only）。
- LM Studio server log。
- Git履歴、Phase 1B設計文書。

### 作成した作業専用治具

- `scripts/generation-diagnostic.ts`
- 使用箇所: 条件I 6回、条件H 3回、合計9回。
- 記録: max_tokens、status、content/reasoning文字数、usage、finish_reason、時間、chunk数、terminal chunk概要、エラー。
- raw結果: `.cache/generation-diagnostic-pass1.json`、`pass2.json`、`history.json`（Git対象外）。

### 汎用治具候補

Providerが返すmetadataを本文公開と分離して受け取るGeneration diagnostics observerは、通常Chat、Single Text、Study等で再利用可能。ただし必要項目・保存期間・privacy・DB契約が未決定のため、今回共通Equipmentへ昇格させていない。

## 13. 検証

実験後に以下を実行し、全て成功した。

- `npm test`: 243件、241 PASS、0 FAIL、既存の実Embedding opt-in 2件SKIP。
- `npm run typecheck`: PASS。
- `npm run build`: PASS。
- `git diff --check`: PASS。

実LM Studioでは新規9回を実行し、全件でSSE正常終了、content、reasoning、usage、finish_reasonを観測した。通常DBはread-onlyで参照し、比較実験結果は通常Conversation／GenerationRunへ追加していない。

## 14. 改善前後の比較

### 改善前

- 空本文エラーから、生成がなかったのか、reasoningだけ生成したのか、上限終了かを区別できなかった。
- finish_reason、usage、reasoning量、terminal chunkが保存されなかった。

### 今回の調査後

- 専用治具でLM Studioが必要情報を返せることを確認した。
- 元障害と比較9件を同じ指標で整理した。
- 2048変更の判断材料と、まだ不足する再現性を明文化した。

### 残る問題

- 通常Run自体にはmetadataが残らない。
- 現DB schemaでは成功Runのresponse metadata保存先がない。
- model別default、Settings、reasoning表示方針は未設計。

## 15. 改善提案

### A. 今すぐ必要

1. 既存のfailed RunとLM Studioログを保持する。
2. 空本文を単なる通信失敗と混同せず、現行どおり失敗扱いにする。
3. defaultは今回変更せず、次の計測で判断する。

### B. 次の通常Chat改善で検討

1. Chat request設定を小さな型付き設定（例: `ChatGenerationDefaults`）へ集約し、Repositoryのmagic numberを除く。
2. 通常Chatだけ4,096を暫定defaultとするA/Bを行う。8,192は長時間・過剰生成の上限が広いため初期候補から外す。
3. `stream_options.include_usage=true` を要求し、finish_reason・usage・reasoning文字数・content文字数を構造化ログへ出す。
4. `finish_reason=length` と空本文をUIで区別する。
5. completed Turnのみを履歴へ入れる既存契約は維持しつつ、連続したUser Turnがモデル挙動へ与える影響を検証する。

DB保存を行う場合は新migrationを伴う別Phaseとし、既存Runを書き換えない。

### C. Settings画面実装時に検討

1. Chat defaultとExperiment defaultを分離する。
2. model別presetを任意設定として持ち、最終的なrequest snapshotには確定値を保存する。
3. 2,048／4,096／8,192等の選択肢、モデルdefault利用、reasoning制御がモデルで対応可能かを表示する。
4. コストは金額ではなく、ローカル生成時間・context消費・最大待ち時間として説明する。

### D. LaboratoryのEquipment候補

1. Generation diagnostic runner。
2. SSE metadata collector。
3. 同一request snapshotのparameter matrix runner。
4. 本文を保存せずmetricsだけ比較するResults table。

## 16. Limitations

- 新規実験は9件で、統計的な失敗率を推定できない。
- 条件Iは各2回、条件Hは各1回である。
- temperatureとseedを固定していない。
- model process、KV cache、OS cacheを毎回coldへ戻していない。
- reasoningは文字数のみで、reasoning token数を直接取得していない。
- 回答品質や事実性を評価していない。
- 4,096／8,192で上限に達する難問・長文要求は試していない。

## 17. Next experiment

1. 同じrequest snapshot、temperature 0、対応するならseed固定で2,048／4,096を各10回実行する。
2. cold modelとwarm modelを分ける。
3. finish_reason、usage、reasoning/content文字数を全Runで取得する。
4. 評価値を空本文率、`length`率、初回content到達時間、総生成時間とする。
5. 4,096で空本文率が実質的に下がる場合、通常Chatの暫定defaultとして提案する。

## 18. 再現手順

LM Studioで対象モデルを利用可能にし、次を実行する。

```powershell
cd D:\att-Chat
$env:DIAG_MODEL='qwen/qwen3.6-35b-a3b'
$env:DIAG_INPUT='アメリカの中間選挙について教えて'
$env:DIAG_LIMITS='2048,4096,8192'
$env:DIAG_REPEATS='2'
$env:DIAG_OUTPUT='.cache/generation-diagnostic.json'
node --experimental-strip-types scripts/generation-diagnostic.ts
```

履歴条件を使う場合はrequest body JSONを `.cache` に置き、`DIAG_REQUEST_FILE`を指定する。request bodyには会話本文が含まれるため、commit対象にしない。

## 19. 今回のExperimentとしての結論

`max_tokens=2048` が空本文へ関与した仮説は**中程度に支持**された。障害Runは上限を完全消費し、モデルがreasoningを別deltaで生成することも確認した。一方、2,048の再実行3件は全て成功したため、単独原因とは断定できない。

現時点ではdefaultを即変更せず、観測可能性を追加した上で2,048対4,096の反復実験を行う判断が妥当である。暫定default候補は4,096。8,192を選ぶ根拠は得られていない。

## 20. 最終状態

- commit: 未実施
- push: 未実施
- tag: 未実施
- DB schema / migration: 変更なし
- package: 変更なし
- Production default: 変更なし
- working tree: 通常Chat UI v0.1の既存未コミット差分、Study関連未追跡物、本実験のscript/reportが存在する。対象は混在させず管理する。
