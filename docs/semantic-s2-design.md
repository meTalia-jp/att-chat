# Semantic Index S2 設計

基準: `4c44718058808052157dd4c9d531ac11d3d4ebd8`。Semantic Indexはcompleted Turnから再生成できる派生データ。検索・chunk・Context統合は対象外。

## 構成と障害分離

`SemanticIndexRepository`にspace登録、missing補完、lease、ready/failed/stale、counts、rebuildを分離。`BackgroundIndexer`はS0 Providerを呼ぶ単一逐次worker。`worker.ts`は別NodeプロセスでローカルCPU Providerを所有する。

サーバーlisten成功・既存Run recovery後、`ATTCHAT_EMBEDDING_MODEL_DIR`設定時だけworkerを起動する。未設定では保存schemaのみ利用可能。active spaceはworkerのProvider/spec設定から決まる。DBの全体設定テーブルは追加せず、全Repository操作でspaceを必須にする。別ProviderはspecとProviderを同時に渡す。S2 CLIの選択肢は固定Built-inのみで、モデル選択UIは追加しない。

GenerationService内にフックを置かず、別接続からcommit済みcompleted Turnを1秒間隔で走査する。User TurnはAssistant生成中でも既にcompletedなので対象。generating/failed/cancelledは除外する。各tickでmissingを最大100件pending補完し、1件推論する。起動時にも同じ走査を実行するため、Turn commit→pending作成の間の停止を回復できる。

チャットRepository/GenerationService/LMStudioProviderは無変更。pending登録・推論・結果保存・worker初期化/native障害にはチャット状態を変更する経路がない。worker障害は本文を含まない固定コードでstderrに報告。DB busyはworker側で回復する。ただし、同一SQLiteのディスク障害や一般的な書込競合自体を解消するものではなく、新しいチャット保存自体が失敗した場合の既存エラー処理は維持する。

## migration 007 / schema

`007_semantic_index.sql`を追加。001〜006は変更しない。既存のchecksum検証・transaction migration runnerに007だけ追加する。全DDL/版登録は一括transaction。実DBはこの作業で開いてmigrationしない。利用者の次回起動では通常runnerにより適用される。

- `embedding_spaces`: space_id PK、fingerprint UNIQUE、spec_version、provider_id、model_id、model_revision、dimensions、spec_json、created_at。S0 identifySpaceを使い、spec_jsonは既知の仕様フィールドのみ投影してcanonical化する。更新禁止。表示名や秘密情報の未知フィールドは保存しない。
- `turn_embeddings`: (turn_id,space_id) PK、source_hash、input_hash、vector BLOB、status、input_tokens、attempt_count、next_attempt_at、lease_token、lease_until、error_code、created_at、updated_at。Turn/space FK、completed検証trigger、BLOBサイズtrigger、状態CHECK。
- 時刻はUnix epoch milliseconds。Float32 little-endian BLOBはBuffer.writeFloatLE/readFloatLEで変換し、ホストendiannessに依存しない。ready時サイズはdimensions×4。S0 validationでspace/次元/NaN/Infinity/zero/truncationを確認する。直接SQLによるfinite要素検査はしないため、書込はRepositoryを利用する。
- input_tokensは成功時の実token数。S0 failureにtoken数がないためINPUT_TOO_LONG失敗時はNULLとする。失敗件数はerror_codeで取得できる。

## hash / space

source_hash = SHA-256(Turn.contentをUTF-8エンコードしたbyte列)、input_hash = SHA-256(spec.prefixes.document + Turn.contentのUTF-8 byte列)。再正規化はしない。LFは既存Turn確定契約、Unicode正規化はなし。input_hashはtoken ID列ではなく、tokenizerに渡す実テキストを識別する。特殊token処理・tokenizer・runtime artifact等はspace仕様が識別する。S2で実装済み入力adapterはraw-text-prefix-special-tokens-v1とfakeのidentity-v1だけ。他のpreprocessingは登録拒否して取り違えを防ぐ。

S1 Providerを選択移植し`src/semantic/builtin-provider.ts`を追加。出典は基準commitの`src/semantic/poc/builtin-provider.ts`。クラス名、import相対パス、説明のみ変更。PoCは保存しruntime importしない。推論・pooling・prefix・上限拒否・hash固定処理を維持するためS1と同一spaceを維持する。provider名の`builtin-onnx-s1`は永続identityとして意図的に保持。新依存なし。本文/vectorはログ出力しない。モデルはローカル配置のみ、取得機能なし。

## 状態・lease・retry

| 入力 | 結果 |
|---|---|
| missing | pending、attempt=0 |
| pending、due、未lease/期限切れ | pendingのまま新lease、attempt+1 |
| 有効lease、vector検証成功 | ready、lease解除 |
| retry可能失敗、attempt<3 | pending、1秒/2秒backoff、lease解除 |
| 非retry失敗/3回失敗 | failed、lease解除 |
| 3回取得後worker消失、期限切れ | failed / LEASE_EXHAUSTED |
| 原文/input hash不一致 | stale、vector破棄、lease解除 |
| 明示rebuild | 対象spaceをpendingへ、attempt=0、旧lease無効 |

leaseは60秒、推論timeout要求は30秒。claim transactionをcommitしてから推論し、短い別transactionで結果保存する。保存時には現在rowのpending、space、lease_token、lease期限>現在時刻、source_hash、input_hash、現在Turnのcompletedと原文hashを照合する。旧workerの結果は拒否し、期限切れrowは次回claimで回収する。

retryは最大3回、TIMEOUT・一部PROVIDER_ERROR（retryable=true）・DB_BUSYだけ。INPUT_TOO_LONG、INVALID_VECTOR、MODEL_UNAVAILABLE、SPACE_MISMATCH、CANCELLED、STORAGE_ERRORは自動retryしない。DB全書込不能なら失敗状態も書けないためleaseを残し、復旧後期限切れ回収を使う。正常化しない場合もattempt上限がある。failed/staleの再生成は明示rebuild。

S1と同様、native推論は即時強制cancelできず、AbortSignal後は結果を破棄する。戻るまで次の推論を開始しない。native処理が永久停止した場合はworkerを終了してアプリ再起動で回復する。worker異常終了の無制限な自動再起動は実装しない。1アプリにつき1workerを想定し、同じDBへ複数アプリを同時起動する運用は対象外（leaseは同一rowの重複保存を防ぐが、複数プロセス全体のCPU並行数を制限しない）。

## rebuildと件数

rebuildは対象spaceのcompleted Turnを列挙し、行をupsertしてpendingへ戻す。created_atは既存値維持、vectorと旧leaseは解除。全体transactionで途中失敗はrollback。Turn/Highlight/Keep/Runや他spaceのreadyには触れない。旧モデルspaceは有効なまま保持する。

countsはactive spaceについてtotal_completed、ready、pending（leased含む）、failed、stale、input_too_long、missingを返す。INPUT_TOO_LONG率はinput_too_long / total_completed。未索引や他の失敗が多い状態で0%を根拠にchunk不要と判定してはいけない。

## 実行方法

PowerShell、D:/att-Chatで実行。モデルはS1で検証した4ファイルを配置する。

```powershell
$env:ATTCHAT_EMBEDDING_MODEL_DIR='D:\att-Chat\.cache\semantic-s1'
npm.cmd start
```

通常のATTCHAT_DB設定も利用できる。単独worker／管理コマンドではDBを明示する。stats/rebuildはモデルをロードしないが、現在のBuilt-in spaceを登録しmigrationを適用するので読み取り専用コマンドではない。

```powershell
$env:ATTCHAT_DB='D:\att-Chat\data\attchat.sqlite'
node --experimental-strip-types src/semantic/worker.ts stats
node --experimental-strip-types src/semantic/worker.ts rebuild
```

`run`（既定）は1秒間隔で動作。`once`は現在dueの仕事を処理し終えると終了し集計を表示する（backoff待ちのpendingは残り得る）。別の管理workerによる推論とアプリworkerを同時実行しない。モデル未配置環境の通常テストは実モデルtestをskip、明示検証はATTCHAT_S2_MODEL_DIRを設定する。
