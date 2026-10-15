# Model Connection Internal Investigation

調査日: 2026-10-11
対象: 現在のworking tree（実装変更は行わず、既存コードと既存テストを調査）

## 1. 結論

現在のモデル接続は、Production UIから選んだモデルIDをAtt-Chat Serverへ渡し、Server内の単一`LMStudioProvider`がLM StudioのOpenAI互換HTTP APIを呼ぶ構成である。ブラウザがLM Studioへ直接接続する構成ではない（`src/client/Chat.tsx:120-123`、`src/server/http.ts:77-94`、`src/server/generation.ts:9-14`、`src/server/provider.ts:14-33`）。

LM Studio簡単設定は、現在のモデル一覧更新・モデル選択をほぼそのまま再利用できるため **A: ほぼ現状のまま使える**。一方、LM Studio詳細設定をProduction UIから実行時に切り替えるには、ProviderのBase URL引数化だけでは足りない。`LMStudioProvider`は既にBase URLを引数で受け取れるが、Server起動後にUI値を渡し、検証し、接続先を安全に切り替えるAPI/stateが存在しない（`src/server/provider.ts:14-20`、`src/server/generation.ts:9-10`、`src/server/http.ts:21-21`）。判定は **B: 少しparameter化と薄いServer adapterが必要**。

OpenAI APIはVer1.0では無効表示だけに留めるのが妥当で、その場合backend変更は不要である。将来有効化する場合は、ローカルHTTP限定、認証なし、Provider名の固定、Run作成時の`lm_studio`固定を分離する必要がある（`src/server/provider.ts:16-19,33`、`src/server/storage/repository.ts:272-274,326-329`）。

## 2. 現在のモデルSettings UI

- `SettingsShell`のモデルsectionは説明文とPortal配置先だけを描画する（`src/client/SettingsShell.tsx:7,14-17,60`）。
- 実コントロールは`ModelSettingsControls`で、モデル一覧更新button、model selector、error、空一覧メッセージを持つ（`src/client/ModelSettingsControls.tsx:1-14`）。
- Productionの正本stateは`App`の`models`、`model`、`modelsChecking`、`modelError`である（`src/client/main.tsx:69`）。SettingsにはPortalで同じstateとcallbackを渡す（`src/client/main.tsx:153-154`）。
- selector変更は`setModel`を直ちに呼ぶ。モデル専用のApply操作はない（`src/client/ModelSettingsControls.tsx:11`）。次の送信時に選択値がHTTP payloadへ入る（`src/client/Chat.tsx:117-122`）。
- 接続状態はStart Screenにだけ`checking / available / unavailable / unselected`として表示される（`src/client/StartScreen.tsx:5-9,32-36`、`src/client/main.tsx:126,129`）。Settings / Modelには明示的な接続状態表示がない。
- Base URL、host、portの入力UIはない（`src/client/ModelSettingsControls.tsx:1-14`、`src/client/SettingsShell.tsx:60`）。
- stateはReact `useState`のみで、モデル選択をDB、`localStorage`、`sessionStorage`、settings fileへ保存する処理はない（`src/client/main.tsx:65-69`）。reload後は空値から再取得される。
- `startup.reuseModel`は永続化された「前回モデル」を復元していない。初回取得時に現在stateが空なら一覧先頭を選ぶだけである（`src/client/main.tsx:65,71-78`）。

## 3. 現在の接続経路

1. SettingsとComposerは`App`の同じ`model` stateを参照する（`src/client/main.tsx:69,142,154`）。
2. `Chat.send()`がNormal / Immediate Ask / Keep Context / New Chat Handoffのendpointを選び、`model`をJSONへ入れる（`src/client/Chat.tsx:107-123`）。
3. Serverは各経路で`model`を許可し、Repositoryの`prepareImmediateAsk`または`prepareChat`へ渡す（`src/server/http.ts:76-83`）。
4. Repositoryはモデル文字列を検証し、User Turn、Assistant Turn、GenerationRun、request snapshotをtransaction内で予約する（`src/server/storage/repository.ts:232-250,264-283,286-299,317-338`）。
5. HTTP層はprepared eventを返した後、`GenerationService.execute()`を呼ぶ（`src/server/http.ts:84-94`）。
6. `GenerationService`はRunのimmutableな`request_snapshot`をProviderへそのまま渡す（`src/server/generation.ts:11-15,17-36`）。
7. `LMStudioProvider`が`${baseUrl}/chat/completions`へPOSTする（`src/server/provider.ts:30-35`）。

全4経路のrequestはRepositoryの2メソッドへ集約され、最終的に同じ`GenerationService`とProviderを通る（`src/client/Chat.tsx:120-122`、`src/server/http.ts:77-94`）。

## 4. Base URL

- Productionの決定場所は`LMStudioProvider` constructorである。優先順位はconstructor引数、`LM_STUDIO_BASE_URL`、既定`http://127.0.0.1:1234/v1`（`src/server/provider.ts:14-19`）。
- URLはローカルHTTPの`127.0.0.1`、`localhost`、`[::1]`だけを許可し、userinfo、query、fragmentを拒否する（`src/server/provider.ts:17-18`）。末尾slashは除去する（`src/server/provider.ts:19`）。
- 既定port 1234はProviderの既定URLに含まれる（`src/server/provider.ts:16`）。独立したport設定はない。
- Production ServerはProviderを明示構築せず、`createAppServer` → default `GenerationService` → default `LMStudioProvider`の順で生成する（`src/server/main.ts:19-22`、`src/server/http.ts:21`、`src/server/generation.ts:9-10`）。
- Electron backendは親process環境を継承するため、起動前に設定された`LM_STUDIO_BASE_URL`も継承される。ただしElectron UIから編集する処理はない（`electron/main.mjs:48-53`）。
- Production runtime内の既定URL定義は`src/server/provider.ts:16`の1箇所である。実験scriptには同じfallbackを持つ独立コードがある（`scripts/generation-diagnostic.ts:28`）が、Production送信経路ではない。

## 5. モデル一覧取得

経路は次のとおり。

1. 起動時と更新buttonで`refreshModels()`を実行する（`src/client/main.tsx:71-79,124`）。
2. Clientが`GET /api/models`を呼ぶ（`src/client/main.tsx:74`、`src/client/api.ts:1-5`）。
3. Serverが`generation.provider.models()`へ委譲する（`src/server/http.ts:53`）。
4. Providerが`GET ${baseUrl}/models`を10秒timeout、redirect拒否で実行する（`src/server/provider.ts:21-24`）。既定Base URLと組み合わせると`GET http://127.0.0.1:1234/v1/models`になる。
5. responseは`{ data: [{ id: string }] }`を前提とし、重複IDを除いて文字列配列を返す（`src/server/provider.ts:25-27`）。
6. UIは一覧をselectorへ渡し、失敗時は`modelError`をalertとして表示する（`src/client/main.tsx:74-78`、`src/client/ModelSettingsControls.tsx:11-13`）。

ここでのLM Studio固有要素は、Provider名、エラーメッセージ、ローカル接続制約である。endpointとresponse schema自体はOpenAI互換形式である。

## 6. Generation endpoint

- URL: `${baseUrl}/chat/completions`。既定では`POST http://127.0.0.1:1234/v1/chat/completions`（`src/server/provider.ts:30-33`）。
- headers: `Content-Type: application/json`だけ。Authorizationは付けない（`src/server/provider.ts:33`）。
- body: Repositoryが作った`request_snapshot`をJSON化したもの（`src/server/generation.ts:32`、`src/server/provider.ts:33`）。Production snapshotは`model`、`messages`、`stream:true`、`max_tokens:4096`、`stream_options.include_usage:true`を含む（`src/server/storage/repository.ts:268-274,320-329`、`src/shared/chat-generation-settings.ts:11-18`）。
- `temperature`はProduction snapshotに設定されず、LM Studio / model側の既定に委ねられる（`src/server/storage/repository.ts:272,326-327`）。
- reasoning制御値は送信しない。候補presetはあるが`thinkingControl:'not_applied'`と明記されている（`src/shared/chat-generation-settings.ts:20-28`）。Providerは`reasoning_content`または`reasoning`を本文へ混ぜず文字数だけ数える（`src/server/provider.ts:66-74`）。
- responseは`text/event-stream`必須で、SSEの`data:` JSONと`[DONE]`を解析する（`src/server/provider.ts:34-59`）。choice index 0の本文をstreamし、usage-only chunkも許容する（`src/server/provider.ts:61-75`）。
- finish reasonは`stop`と`length`だけを許容する。tool callは未対応として拒否する（`src/server/provider.ts:65,76-79`）。
- モデル一覧は10秒、生成全体は`GenerationService`で10分timeout（`src/server/provider.ts:23`、`src/server/generation.ts:28`）。自動retryはない。
- Provider HTTP失敗、SSE破損、途中切断、空本文はRunをfailedとして保存する（`src/server/provider.ts:34-35,44-46,53-60`、`src/server/generation.ts:37-59`）。cancelとbrowser切断も既存Run lifecycleで処理する（`src/server/generation.ts:71-82`）。

## 7. Provider構造

- Generation用のProvider interfaceは存在しない。`GenerationService.provider`の型は具体的な`LMStudioProvider`である（`src/server/generation.ts:1-10`）。
- `LMStudioProvider` classは存在する（`src/server/provider.ts:14-83`）。
- Provider factory、接続方式enum、Generation用provider type registryは存在しない。
- 注入点はある。`GenerationService` constructorでProvider instanceを受け取れ、`createAppServer`はGenerationServiceを受け取れるため、テストでは差し替え可能である（`src/server/generation.ts:9-10`、`src/server/http.ts:21`）。ただし型はLM Studio具体型である。
- DBの`provider`は自由なTEXTでenum制約はないが、Production Repositoryは`lm_studio`を直接書く（`src/server/storage/migrations/001_initial.sql:30-45`、`src/server/storage/repository.ts:274,329`）。

## 8. LM Studio固有部分

LM Studio固有または現在LM Studioへ固定されている箇所は次のとおり。

- class名、error文、既定env名とURL（`src/server/provider.ts:14-18,28,34,60`）。
- localhost HTTP限定validation（`src/server/provider.ts:17-18`）。
- `GenerationService`の具体型（`src/server/generation.ts:2,9-10`）。
- Settings説明と空一覧メッセージ（`src/client/SettingsShell.tsx:60`、`src/client/ModelSettingsControls.tsx:13`）。
- Composer見出し（`src/client/Chat.tsx:165`）。
- GenerationRunのprovider固定値（`src/server/storage/repository.ts:274,329`）。

messages、model、stream、usageのbody/response形はOpenAI互換APIへ依存しているが、remote providerやcredentialを扱う設計にはなっていない。

## 9. LM Studio簡単設定への流用可否

判定: **A. ほぼ現状のまま使える**。

既定Base URL、API keyなし、モデル一覧更新、モデル選択という要件は既に成立している（`src/server/provider.ts:16-28`、`src/client/ModelSettingsControls.tsx:9-13`）。追加するとすれば、Settings / Model内にもStart Screenと同じ接続状態を表示し、「接続方式: LM Studio簡単設定」という外枠を付けるUI整理である。Generation経路の変更は不要。

注意点として、現在の「前回モデルを自動選択」は永続復元ではなく一覧先頭の自動選択である（`src/client/main.tsx:65,71-76`）。Ver1.0文言を「利用可能な先頭モデルを選択」へ直すか、将来のSettings永続化で本当に前回値を保持する必要がある。

## 10. LM Studio詳細設定への流用可否

| 項目 | 判定 | 根拠 |
|---|---|---|
| model selector | そのまま再利用可能 | `src/client/ModelSettingsControls.tsx:1-14` |
| モデル一覧更新 | そのまま再利用可能 | `src/client/main.tsx:71-79`、`src/server/http.ts:53` |
| ProviderのBase URL受け取り | そのまま再利用可能 | constructor引数済み、`src/server/provider.ts:14-20` |
| Base URL validation | LM Studio向けとして再利用可能 | loopback HTTP限定、`src/server/provider.ts:17-18` |
| SettingsからBase URL適用 | parameter化 / adapterが必要 | UI/state/API/provider再構成経路がない |
| 接続確認 | `models()`再利用可能、薄いendpoint/UIが必要 | `src/server/provider.ts:21-28` |
| port設定 | Base URLへ内包可能 | 独立port state不要 |
| timeout調整 | 現状固定、別契約が必要 | `src/server/provider.ts:23`、`src/server/generation.ts:28` |
| temperature / max tokens / reasoning | 接続設定とは別のGeneration設定設計が必要 | `src/shared/chat-generation-settings.ts:15-28` |

したがって「既存ProviderをBase URLとmodelのparameter化だけで流用できるか」への答えは、Provider単体ならmodelはrequest、Base URLはconstructorですでにparameter化済みである。しかしProduction Settingsとして成立させるには、Server runtimeへBase URLを渡す薄い設定adapterが追加で必要である。

## 11. OpenAI-compatible化の可能性

再利用できる部分は、`/v1/models`、`/v1/chat/completions`、`model`、`messages`、`stream`、usage chunkというOpenAI互換形である（`src/server/provider.ts:21-27,30-79`）。

そのまま一般化できない部分は、loopback HTTP限定、認証headerなし、LM Studio固有error、strictなSSE/finish reason/tool-call制約である（`src/server/provider.ts:17-18,28,33-35,60,65,76-78`）。OpenAI-compatible local serverへの拡張なら、共通interfaceと接続profileを作る価値がある。OpenAI公式APIを含める場合はcredential境界とremote HTTPS policyが先に必要である。

現時点で全面一般化する価値は低い。Ver1.0で有効なのはLM Studioだけであり、先にinterface/factoryを大きく作ると未検証の抽象化になる。OpenAI接続を実装するPhaseで、`models()`と`generate()`を持つ最小interfaceを`GenerationService`へ導入するのが適切である。

## 12. OpenAI API将来対応時の分離点

将来の分離点は次のとおり。

1. `GenerationService`の具体型依存を最小Provider interfaceへ変更する（現在: `src/server/generation.ts:2,9-10`）。
2. 接続方式からProviderを作るfactory/runtime ownerをServer起動層へ置く（現在: `src/server/main.ts:19-22`）。
3. Repositoryの`lm_studio`固定を選択Provider IDへ置き換える（現在: `src/server/storage/repository.ts:274,329`）。
4. LM Studioのloopback validationと、remote HTTPS / credential policyを別classへ分離する（現在: `src/server/provider.ts:16-19`）。
5. Authorization情報はProvider内部だけで使用し、client payload、GenerationRun、request snapshot、logへ渡さない。

Ver1.0でOpenAI APIを`未対応`としてグレーアウト表示するだけなら、この分離は不要である。

## 13. Secret関連コードの有無

ProductionのGeneration / UI / Electronコードに`api_key`、`API_KEY`、`Authorization`、`Bearer`、credential保存処理は見つからなかった。Provider request headerはContent-Typeだけである（`src/server/provider.ts:33`）。

検索で見つかる`api_key:'secret'`はSemantic Indexのテストfixtureで、未知fieldをidentityや保存値へ混入させないことを確認するための文字列である（`tests/semantic-contract.test.ts:10`、`tests/semantic-index.test.ts:25-27`）。Generation credentialとして使用していない。`token` / `tokens`の主な使用はLM usageのtoken数とEmbedding tokenizerであり、認証tokenではない（`src/server/provider.ts:39-40,54-56`）。

## 14. request_snapshot / DBへの影響

- `generation_runs`には`model_id`、`provider`、`request_snapshot`がある（`src/server/storage/migrations/001_initial.sql:30-45`）。
- Productionのrequest snapshotは実際のProvider bodyそのもので、`model`、`messages`、`stream`、`max_tokens`、`stream_options`を含む（`src/server/storage/repository.ts:268-274,320-329`）。Providerへ同じobjectを渡す（`src/server/generation.ts:32`）。
- provider名はsnapshot内ではなく`generation_runs.provider`に`lm_studio`として保存される（`src/server/storage/repository.ts:274,329`）。
- Base URLはDBにもrequest snapshotにも保存されない。
- usage、finish reason、reasoning文字数、durationはProvider diagnosticsとして取得し、terminal logへ出すがDBへ保存しない（`src/server/provider.ts:54-56`、`src/server/generation.ts:62-68`）。回答本文はAssistant Turn、結果はRun outcome/errorへ保存する（`src/server/generation.ts:46-55`）。
- request snapshotはRun identityの一部としてimmutableである（`src/server/storage/migrations/002_live_runs.sql:9-16`）。

LM Studio詳細設定だけならDB migrationは不要である。Base URLの履歴追跡を将来必須にする場合、現在の「snapshot = actual provider request」契約を壊さず、secretを含まない別のconnection provenance領域を設計する必要がある。API key、Authorization header、credential参照値はrequest snapshotへ絶対に保存しない。

## 15. Settings永続化との境界

現在のモデル選択、startup preference、Profileは`App`のReact stateでありsession-onlyである（`src/client/main.tsx:62-69`）。Settingsにもsession-onlyと明記されている（`src/client/SettingsShell.tsx:95`）。

将来の非secret永続化候補は次のとおり。

- 接続方式: `lm_studio_simple` / `lm_studio_advanced`
- LM Studio Base URL: loopback HTTP URLのみ
- 選択モデルID
- 任意の接続確認日時や最後の成功状態。ただし起動時に再確認する。

保存先は会話DBへ混ぜるより、Electron AppData配下などのsettings file、またはServer所有の非secret settings storeが適する。Browser / Electron共通UIから同じServer APIへアクセスする形にすれば環境差を抑えられる。API keyはこの候補に含めない。

## 16. UI実装候補

既存`ModelSettingsControls`を「更新button + selector + error」の内側componentとして維持できる（`src/client/ModelSettingsControls.tsx:1-14`）。外側をSettings / Modelに追加する最小案は次の構成である。

1. 接続方式selector: LM Studio簡単 / LM Studio詳細 / OpenAI API（未対応・disabled）。
2. 接続状態: Start Screenの`ModelConnectionState`相当を共通化して表示（現状: `src/client/StartScreen.tsx:5-9`）。
3. 簡単設定: 既存`ModelSettingsControls`だけ表示。
4. 詳細設定: Base URL、接続確認、既存`ModelSettingsControls`を表示。
5. OpenAI API: 説明だけ表示し、API key入力欄は作らない。

model選択には現在Applyがなく、次Runから即時使用される。Base URLはServer resourceなので、入力中値と適用済み値を分け、明示Applyまたは接続確認成功時適用にする方が、送信中Runへ影響させない既存Profile契約と整合する。

## 17. テスト影響

### 維持

- Providerのmodels、通常SSE、usage/reasoning、failure/cancel: `tests/generation.test.ts:16-93`。
- snapshotとProvider request一致: `tests/generation.test.ts:53-59`。
- Model controlsの選択とrefresh callback: `tests/start-screen.test.ts:116-122`。
- Start Screenのmodel/status/settings導線: `tests/start-screen.test.ts:56-72`。
- Clientがmodelをchat payloadへ入れること: `tests/normal-chat.test.ts:43-47`。
- 全Production経路のcanonical request一致はSystem/Profile側の回帰として維持する（`tests/system-prompt-experiment.test.ts:245-277`）。

### LM Studio簡単設定で拡張候補

- Settings / Modelに接続方式と接続状態が表示されること。
- 簡単設定でBase URL入力が出ないこと。
- refresh失敗時の状態と既存selector保持方針。

### LM Studio詳細設定で新規必要

- loopback URLのvalid / invalid。
- Apply前後でServer側Providerが切り替わること。
- 接続確認とモデル一覧が同じ適用済みBase URLを使うこと。
- 生成中Runの接続先が途中変更されないこと。
- reload時の非secret設定復元。

### OpenAI APIを無効表示する場合

- optionがdisabledで、credential入力欄もbackend callも発生しないことだけでよい。

## 18. 推奨最小実装順

1. 現行経路を「LM Studio簡単設定」としてUI上で明示し、既存controlを再利用する。
2. Settings / Modelへ接続状態を追加し、Start Screenと判定を共有する。
3. OpenAI APIはdisabledな将来枠だけ追加し、backendを変更しない。
4. 詳細設定を行う場合、非secretなBase URL draft/applied stateとServer adapterの契約を先に定義する。
5. `models()`を接続確認として再利用し、成功した適用済みURLでmodel一覧とgenerationを通す。
6. Settings永続化Phaseで接続方式、Base URL、選択モデルだけを保存する。
7. 実際に第二Providerを有効化するときに最小Provider interface / factoryを導入する。

## 19. リスク

- UIだけにBase URL stateを追加すると、Server Providerへ反映されず「設定できたように見える」偽UIになる。
- Providerをglobalに即時交換すると、生成中Runの途中変更やmodels取得との競合が起きる。適用単位とRun開始時のProvider captureが必要である。
- `model`はLM Studioから取得したIDだが、Serverは送信時にそのmodelが現在一覧にあるか再検証しない（`src/server/storage/repository.ts:245,293`）。Provider側エラーとして失敗する。
- model listの存在はロード済み・生成成功を保証しない。接続状態とmodel実行可能性を同一視しない。
- Base URLをsnapshotへ直接追加すると「snapshot = Provider request」の既存契約を壊す。
- remote providerをLM Studio classのvalidation緩和だけで実現すると、SSRF、credential漏えい、redirect、log/snapshot混入の境界が曖昧になる。
- reasoning設定候補は存在するが未適用であり、モデル接続設定と混ぜると対応モデル差を隠す（`src/shared/chat-generation-settings.ts:20-28`）。

## 実LM Studio確認

コード変更やDB書込みをせず、現行`LMStudioProvider`を直接生成して`models()`を実行した。調査時点では既定接続先`http://127.0.0.1:1234/v1`へのfetchが失敗し、モデル一覧を取得できなかった。このため実Generationは実行していない。これはProviderの構造調査結果を変えるものではなく、調査時点で既定URLにLM Studio APIが公開されていなかったことだけを示す。

既存の接続・UI契約はfocused testで確認した。`tests/generation.test.ts`、`tests/start-screen.test.ts`、`tests/normal-chat.test.ts`は合計23件すべてPASSした。実LM Studio smokeだけは上記の接続不可により未実施である。

## Q1〜Q7への回答

**Q1. 現在のLM Studio接続は「LM Studio簡単設定」としてそのまま残せるか？**
はい。モデル一覧更新とモデル選択はそのまま使える。接続方式名と状態表示をSettingsへ整理する程度で成立する。

**Q2. LM Studio詳細設定はBase URLをparameter化するだけで実現できるか？**
いいえ。Provider constructorは既にparameter化済みである。UIからServerへ適用するAPI/state、Providerの安全な切替、適用中URLによる接続確認が追加で必要である。

**Q3. 新しいProvider classは必要か？**
LM Studio詳細設定には不要で、既存`LMStudioProvider`を再利用できる。OpenAI公式APIを有効化するPhaseでは、remote HTTPSとcredential境界を分けるため別Provider classが妥当である。

**Q4. OpenAI-compatible Providerへ一般化する価値は今あるか？**
Ver1.0の無効表示段階ではない。実際に第二Providerを有効化するときに、`models()`と`generate()`の最小interfaceを導入する価値がある。

**Q5. Ver1.0でDB schema変更は必要か？**
不要。model_id、provider、actual request snapshotは既に保存できる。Base URL履歴を正式要件にする場合だけ、request bodyと分離したprovenance設計を別途判断する。

**Q6. OpenAI APIをグレーアウト表示するだけならbackend変更は不要か？**
不要。disabledなUIと説明だけでよく、API key入力やbackend routeを追加しない。

**Q7. API key / secretが現在のコードに入り込んでいる箇所はあるか？**
Production Generation経路にはない。Semantic関連テストに、secretらしい未知fieldを保存しないことを検証するfixture文字列があるだけである。
