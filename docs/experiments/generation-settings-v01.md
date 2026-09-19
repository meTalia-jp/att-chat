# Att-Chat Generation設定 v0.1 実装・観測結果

## Research result

先行調査 `generation-max-tokens-investigation.md` では、Core Chatの固定値
`max_tokens=2048` を完全消費して本文が0文字になった実利用Runを確認した。
同じモデルは `reasoning_content` と `content` を別々にstreamし、completion
budgetにはreasoningも含まれる。比較実験では2,184 completion tokensを使う
成功Runも観測した。このため2,048は通常Chatの暫定既定値として余裕が不足する
可能性がある。一方、2,048でも成功するRunがあり、上限だけを障害の単独原因とは
断定できない。

## Decision

- Core Chatの暫定既定値を2,048から4,096へ変更した。
- 4,096は最終値ではない。実利用のfinish reason、usage、reasoning量を観測して再評価する。
- Laboratory Single Text Generation、Study P0、Mode B PoCなど、独自設定を持つExperimentは変更しない。
- Core ChatをcompositionするSimple Marker ChatとLaboratory Simple Marker Chatは、同じ経路の結果として4,096になる。
- DB schemaやmigrationは変更せず、Generation診断は構造化ログへ出す。

## Why 4096

2,048を完全消費した空本文Runと、2,184 tokensを使った成功Runが既にあるため、
2,048より明確に余裕がある。今回の実モデル追加確認でも通常説明は3,671 tokensを
使って正常終了した。4,096はこの事例を収めつつ、生成時間と資源消費を無制限に
増やさない最小の候補である。

## Why not 8192

8,192なら余裕は増えるが、先行比較と今回の確認では8,192を必要とする成功例を
まだ観測していない。上限増加はthinkingモデルの待ち時間と最大計算量も増やし得る。
したがって8,192を標準値にする根拠は不足している。

## Implementation

`src/shared/chat-generation-settings.ts` にCore Chat専用の型付きdefaultを置いた。
`Repository.prepareChat` はその値を使い、LM Studioへ
`stream_options.include_usage=true` を要求する。magic numberはrequest builderから除いた。

将来UI向けに次の暫定定義を追加した。

| Thinking表示 | max_tokens | 状態 |
| --- | ---: | --- |
| OFF | 2048 | provisional |
| Low | 4096 | provisional |
| Medium | 8192 | provisional |
| High | 16384 | provisional |

この定義はmax token候補だけを表す。モデル固有のthinking制御は送信せず、全モデルへ
強制適用もしない。通常Chatの将来UIはModelと簡易Thinking選択を担当し、Settingsは
Thinking level、max_tokens、連動ON/OFF、モデル別preset、その他parameterの詳細設定を
担当する想定である。制御方式が未確定なので今回はUIを追加していない。

## Runtime observations

モデルは `qwen/qwen3.6-35b-a3b`、`max_tokens=4096`、streaming、
usage取得有効で確認した。文字数はJavaScript文字列長で、reasoning本文そのものは保存していない。

| 条件 | status | finish | completion | content chars | reasoning chars | duration |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 短い質問 | succeeded | stop | 192 | 5 | 608 | 20,963 ms |
| 通常説明 | succeeded | stop | 3,671 | 274 | 8,167 | 128,296 ms |
| reasoningが長くなりやすい問題 | succeeded | stop | 3,197 | 1,346 | 5,601 | 112,024 ms |
| Core API短文 | succeeded | stop | 266 | 2 | 880 | 10,131 ms |
| Core API Stop | cancelled | 未受信 | 未受信 | 0 | 未受信 | 1,565 ms |

Core API短文では保存済みrequest snapshotが4,096であること、stream eventが
`prepared -> running -> delta -> terminal`、Assistant Turnがcompletedになることを確認した。
StopではRunとAssistant Turnがcancelledになった。今回の実機Stopはcontentが出る前の
reasoning中に停止したため部分本文は0文字だった。500 ms checkpointによる部分本文保存は
既存の自動テストで確認した。

## Diagnostics

Generation終端で `GENERATION_DIAGNOSTIC` という1行JSONを標準出力へ記録する。
項目はmodel、effective max_tokens、finish_reason、completion/prompt/total tokens、
content chars、reasoning chars、duration、status、error messageである。本文とreasoning本文は
記録しない。Providerからusageやfinish reasonを受け取れない通信失敗・早期cancelではnullにする。

空本文かつ `finish_reason=length`、completionが上限の95%以上、reasoningが1文字以上なら、
従来の一般的な「本文のない応答です」ではなく
「回答本文を生成する前に出力上限へ達した可能性があります」と記録する。
原因を断定する表現にはしていない。HTTP/stream通信失敗は従来どおりProvider errorとして
区別される。

## Regression

- Unit testでCore snapshot=4,096、usage取得、content/reasoning分離、暫定preset、
  reasoning-only length終了の分類を確認した。
- 既存のstreaming、cancel、checkpoint、Question Keep、Simple Marker Chat、MarkerCore、
  Laboratory、Studyを含む全testを実行する。
- migration、DB schema、package dependencyは変更していない。

## Limitations

- 構造化ログは永続DBへ格納しないため、プロセス出力を保存しなければ後から検索できない。
- cancelや通信切断ではterminal/usage chunkを受け取れず、finish reasonやtoken数はnullになる。
- reasoning文字数はtoken数ではなくJavaScript文字列長である。
- モデルごとのthinking制御方法、上限、推奨値は未確定である。
- 4,096でも長いreasoningでは本文前に上限へ達する可能性がある。

## Next experiment

実利用Runのうち `finish_reason=length`、空本文、上限近傍、長時間Runを少数収集し、
4,096での空本文率と待ち時間を再評価する。その後、対応が確認できたモデルだけで
thinking制御とmax token presetの組み合わせを比較する。8,192への既定値変更はその結果で判断する。

## Used Equipment / Component

- `LMStudioProvider`: 実モデルstream、reasoning/content、usage、finish reason取得。
- `GenerationService`: streaming、cancel、checkpoint、終端状態保存。
- `Repository.prepareChat`: Core Chatの一貫した予約とrequest snapshot。
- `scripts/generation-diagnostic.ts`: 同条件比較と実モデル計測。

## Reused fixtures

`scripts/generation-diagnostic.ts` は先行調査で9 Run、今回の4,096再確認で3 Run、
合計12 Runに使用した。入力、上限、反復数を環境変数で指定でき、結果をJSONへ残すため、
一回限りの作業専用治具を超えてReusable fixture候補になった。

## Equipment candidate判断

Generation診断Equipment候補として設計・評価する段階には達した。ただし、入力/result schema、
ログprivacy、artifact lifecycle、失敗時契約、対応Providerをまだ固定していないため、今回の変更で
共通Equipmentへ昇格させない。

Laboratoryでは通常Chatの4,096を共通defaultにしない。各Experimentが必要生成量、thinking量、
待ち時間、目的から選び、ExperimentRunへ実効max_tokensを残す方針を推奨する。Single Textは既に
generation settingsとrequest bodyをRunへ記録している。ほかのExperimentも共通化せず、必要時に
同等の実効値記録を追加する。
