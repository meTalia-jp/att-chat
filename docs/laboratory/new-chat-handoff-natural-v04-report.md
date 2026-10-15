# New Chat Handoff — Natural Conversation Experiment v0.4

## Purpose

量子力学、LLMモデルの数値表現、量子コンピュータで近い語が繰り返される自然な8 Turn会話を使い、Markerの対象理解に必要な周辺Turn量を観察する。最適量や本番採用は決定しない。

## Fixture

| Turn | Role | Topic |
|---|---|---|
| T1 | User | 量子・似た言葉は同じ意味か |
| T2 | Assistant | 時計の目盛りと物理／工学の違い |
| T3 | User | LLMの4bit／8bit |
| T4 | Assistant | LLMの量子化と量子コンピュータの違い |
| T5 | User | 電子スピンと古典bit |
| T6 | Assistant | 上向き／下向き、qubit状態 |
| T7 | User | 重ね合わせが有利な理由 |
| T8 | Assistant | 干渉と測定の制限 |

人工的な同文反復を避け、User / Assistantを交互にした固定fixture。各Marker文字列はTarget Turn内で一意。

## Cases

| Case | Target | Marker | Question |
|---|---|---|---|
| A | T4 | 量子化 | これはLLMの量子化と同じ意味ですか？ |
| B | T8 | 重ね合わせ | これがあると、なぜ計算に有利になるのですか？ |
| C | T6 | 上向きと下向き | これはそのまま0と1という意味ですか？ |

各CaseのMinimalは前1+Target、Standardは前3+Target、Wideは前5+Target+後1。会話端では存在するTurnだけを使用した。

## Generation settings

- model: `google/gemma-4-12b-qat`
- temperature: 0
- max_tokens: 2048
- system prompt: v0.3と同一
- messages: `system` + `user`のみ
- automatic retry: none
- production DB / Conversation / Question Keep write: none

9 PreviewでTurn順序、Target一回、Marker・質問、固定設定、2 messages、本番DB非使用を自動確認した。

## Results

| Case | Condition | Turns | Input chars | finish | Answer chars | Reasoning chars | Elapsed |
|---|---|---|---:|---|---:|---:|---:|
| A | Minimal | T3–T4 | 311 | stop | 325 | 2,584 | 90,213 ms |
| A | Standard | T1–T4 | 543 | stop | 161 | 3,834 | 115,088 ms |
| A | Wide | T1–T5 | 615 | stop | 200 | 4,066 | 130,509 ms |
| B | Minimal | T7–T8 | 329 | stop | 130 | 1,960 | 61,774 ms |
| B | Standard | T5–T8 | 579 | stop | 146 | 2,216 | 65,281 ms |
| B | Wide | T3–T8 | 825 | stop | 166 | 2,142 | 70,182 ms |
| C | Minimal | T5–T6 | 319 | stop | 114 | 2,640 | 80,899 ms |
| C | Standard | T3–T6 | 565 | stop | 157 | 2,065 | 74,480 ms |
| C | Wide | T1–T7 | 859 | stop | 145 | 2,134 | 77,012 ms |

全9 Runが`stop`、errorなし。前Runの回答は後続requestへ含めていない。

## Case A

### Minimal

LLMでの低bit近似と物理的な離散現象を区別した。Target内のMarkerがLLMの工学処理を指すことも述べたが、冒頭を「文脈による」とし、質問より広い説明になった。

### Standard

MarkerをLLMの工学的処理として直接特定し、「同じ意味」と回答した上で、物理的な離散化とは仕組みが異なると整理した。一次観察では最も質問へ直接的。

### Wide

「同じ意味ではない」と回答し、LLMの量子化と量子コンピュータを比較した。後1 Turnの電子スピン／量子コンピュータ話題を拾い、質問の比較対象を取り違えたノイズ候補。

## Case B

### Minimal

干渉によって望ましい振幅を強め不要な振幅を打ち消す、と正しく説明した。単純な並列計算だけには還元しなかった。

### Standard

重ね合わせ自体ではなく干渉操作が有利さを生む、と明示した。Minimalからの明確な品質改善は確認できない。

### Wide

干渉、測定で全結果を取り出せない制限、全計算が速くなるわけではない点を保持した。別の量子化話題の混入は観察しなかった。

## Case C

### Minimal

上向き／下向きを測定結果として|0⟩／|1⟩へ対応できるが、古典的な0と1が隠れている意味ではないと区別した。

### Standard

測定軸に沿った結果であることを明示した。Minimalでも主要な区別は成立しており、追加Contextの必須性は確認できない。

### Wide

古典bitとの区別を維持した。LLM量子化など別概念の混入は観察しなかった。

## Comparison

### Context too small candidates

- 明確な不足候補なし。
- A-Minimalは正しいが質問より広く、対象特定の直接性はStandardより低い。

### Context sufficient candidates

- A-Standard。
- B-Minimal。Standard / Wideも正しいが、Minimalから必須の改善は確認できない。
- C-Minimal。Standardは測定軸を明示する補足が加わった。

### Context noise candidates

- A-Wide。後続の量子コンピュータ話題を比較対象として拾い、Markerの局所的な意味を取り違えた。
- B-Wide / C-Wideでは明確なノイズを観察しなかった。

## Codex first observation

「Minimalでは曖昧、Standardで安定、Wideでノイズ」という差はCase Aで観察した。一方、Case BとCではMinimalで十分だった。必要量は固定値ではなく、Target Turn内の説明完結度と近接する同形語の数に依存する可能性がある。

各条件1 Runであり、temperature 0でも実行環境の完全決定性は保証されない。Context量の最適値や自動選択規則は決定しない。

## Human review pending

全9 Run pending。本番接続、自動Context escalation、RAG、Embedding、FTS、retrieval chunkへ進まない。
