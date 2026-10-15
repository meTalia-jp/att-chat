# New Chat Handoff — Turn-based Stability Experiment v0.3

## Purpose

既存Case 1のHandoff OFF失敗を上書きせず比較基準とし、Target Turnと少量の周辺Turnを新しい最初のUser Message内へ入れた場合に、同じモデル・生成設定で最終回答へ到達するかを確認する。最適な引継ぎ量の採用判断は行わない。

## Previous OFF failure

- Source: `docs/laboratory/new-chat-handoff-v02-data/case-1-OFF.json`
- Model: `google/gemma-4-12b-qat`
- max_tokens: 2048
- finish_reason: `length`
- answer: 0 chars
- reasoning: 8,028 chars
- elapsed: 236,351 ms
- error: `Empty answer`

既存JSONは削除・上書き・再実行していない。この1件だけからHandoff OFFを失敗原因とは断定しない。

## Fixture / Target Turn

- Conversation: Conversation A
- Target: T25 / Assistant
- Marker: `月がきれいですね`
- Question: `この表現が好意を伝えるのはなぜですか？`
- T20〜T26を固定fixtureとして作成し、T25本文にはv0.2 Case 1の`sourceTurnText`全文をそのまま使用した。
- T25は2,684 UTF-16文字。oversized停止基準12,000文字未満のため、chunk化せず全文を使用した。
- 制限: T25は同じ説明の繰り返しを含む人工fixtureであり、自然なAssistant回答を代表しない。

## Conditions

| Condition | Included Turns | Count | First user message |
|---|---|---:|---:|
| OFF | なし（既存基準） | 0 | 47 chars |
| Minimal | T24, T25 | 2 | 2,832 chars |
| Standard | T22, T23, T24, T25 | 4 | 2,957 chars |
| Wide | T20, T21, T22, T23, T24, T25, T26 | 7 | 3,110 chars |

各Runは独立New Chat。旧Turnは個別のmessage履歴にせず、最初のUser Message内の参考文脈として順番どおりに埋め込んだ。

## Generation settings

- model: `google/gemma-4-12b-qat`
- temperature: 0
- max_tokens: 2048
- system prompt: v0.2と同一
- messages: `system` + `user`のみ
- timeout: 240 seconds
- automatic retry: none
- production DB write: none

## Automatic checks

Minimal / Standard / Wideの全Previewで以下をPASSした。

- system + userの2 messagesだけで開始
- 旧Conversation履歴をmessage配列へ直接追加しない
- Turn順序維持
- Target Turn全文を1回だけ包含
- Marker本文と質問を包含
- Minimal = 直前1 + Target
- Standard = 直前3 + Target
- Wide = 直前5 + Target + 後1
- max_tokens 2048固定
- model固定
- 自動retryなし
- 本番DB書込みなし

## Run results

| Condition | finish_reason | answer chars | reasoning chars | elapsed | error |
|---|---|---:|---:|---:|---|
| OFF | length | 0 | 8,028 | 236,351 ms | Empty answer |
| Minimal | stop | 59 | 2,077 | 73,461 ms | none |
| Standard | stop | 88 | 2,120 | 71,743 ms | none |
| Wide | stop | 116 | 2,235 | 76,534 ms | none |

### Minimal

> 提供された情報の中には、この表現がなぜ好意を伝えるのかについての説明が含まれていないため、お答えすることができません。

### Standard

> 提供された対象の箇所（[T25 / Assistant / Target]）には、その表現がなぜ好意を伝えるのかについての説明が含まれていないため、お答えすることができません。

### Wide

> ご提示いただいた対象箇所（T25）には、この表現がなぜ好意を伝えるのかについての説明が含まれていません。対象箇所は、既存仕様と試験範囲の区別に関する記述の繰り返しと、補足説明やExperimentalに関する記述で構成されています。

## Comparison

- 最終回答: OFFは未到達、Minimal / Standard / Wideは到達。
- finish_reason: OFFの`length`に対し3条件は`stop`。
- reasoning量: 3条件はいずれも約2,100〜2,235文字で、OFFの8,028文字より少なかった。
- 応答時間: 3条件は約72〜77秒で、OFFの約236秒より短かった。
- 対象特定: Minimal / Standardは入力に説明がないことを認識。WideはT25の内容まで具体的に識別した。
- 回答品質: 3条件とも根拠のない由来を推測しなかったが、前Turnにある文化的連想を使って質問へ答えることもしなかった。
- ノイズ候補: WideはT25中のExperimental等へ言及した。これはContext増加というより、人工的で長いTarget Turn全文の影響候補でもある。

## Codex first observation

同じ生成上限でMinimalが`stop`と最終回答へ到達したため、少量Turn Contextによって生成が安定した可能性はある。reasoning量と時間もOFFより大幅に小さい。ただし単発Runであり、OFFとの差をContextの有無だけに帰属できない。

周辺Turnを増やしても質問への実質的な回答は得られなかった。モデルはTarget Turnを強く優先し、そこに由来説明がないことを理由に回答を控えた。StandardからWideへ増やすにつれて回答文字数とreasoning量はわずかに増えたが、有益な説明の増加とは確認できない。

この結果は最適なTurn数を示さない。Minimalで正常終了した事実、全条件で回答を控えた事実、Wideにノイズ候補が出た事実を分けて扱う。

## Human review

全条件 `pending`。採用判断は行わない。
