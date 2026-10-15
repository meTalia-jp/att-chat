# New Chat Handoff — User Reasoning Continuity Experiment v0.5

## Purpose

New Chat Handoffが事実情報だけでなく、ユーザー自身の誤解、AIによる訂正、ユーザーの言い換え、その後の抽象化を引き継げるかを観察する。最適Turn数や本番採用は決定しない。

## Fixture

指定された8 Turnを、口語表現と途中理解を含めて固定した。

| Turn | Role | Reasoning step |
|---|---|---|
| T1 | User | 対向光の相対速度をcと考える初期理解 |
| T2 | Assistant | 接近速度2cと、光の静止系を作れないことを区別 |
| T3 | User | 距離の縮み方と言い換え、波粒子へ話題を進める |
| T4 | Assistant | 古典的な波・粒子のどちらにも完全には一致しないと補正 |
| T5 | User | 日常語の限界として抽象化 |
| T6 | Assistant | 専門用語と数式による正確な記述を説明 |
| T7 | User | 「物理の人は数式で会話」と再抽象化 |
| T8 | Assistant | 数式の役割と文章・図による補足を説明 |

## Cases

| Case | Target | Marker | Question |
|---|---|---|---|
| A | T2 | 毎秒2cで縮みます | じゃあ最初に私が言っていた「相対速度も光速でOK」は、どこが違うの？ |
| B | T4 | 波でも粒子でもない | 私が考えた「波でも粒子でもない」という言い方でもよいの？ |
| C | T6 | 日常語だけでは表現しにくい | これは「物理学でも正体が分かっていない」という意味ではないの？ |
| D | T8 | 数式は | じゃあ私が言った「物理の世界の人は数式で会話している」は、どのくらい合っているの？ |

Minimalは前1+Target、Standardは前3+Target、Wideは前5+Target+後1。会話端では存在するTurnだけを使った。このためCase AのMinimalとStandardは同じT1–T2、Case DのWideには後Turnがない。

## Generation settings

- model: `google/gemma-4-12b-qat`
- temperature: 0
- max_tokens: 2048
- system prompt: v0.4と同一
- messages: `system` + `user`のみ
- automatic retry: none
- production DB / Conversation / Question Keep write: none

各PreviewでTurn順序、Target一回、Marker・質問、固定設定、2 messages、本番DB非使用を自動確認した。旧Conversation Turnは個別messageにせず、最初のUser Message内の参考文脈としてのみ含めた。

## Results

| Case | Condition | Turns | Input chars | finish | Answer chars | Reasoning chars | Elapsed |
|---|---|---|---:|---|---:|---:|---:|
| A | Minimal | T1–T2 | 306 | stop | 862 | 3,800 | 149.0 s |
| A | Standard | T1–T2 | 306 | stop | 862 | 3,800 | 148.7 s |
| A | Wide | T1–T3 | 401 | stop | 770 | 4,080 | 161.4 s |
| B | Minimal | T3–T4 | 329 | stop | 126 | 2,013 | 57.7 s |
| B | Standard | T1–T4 | 549 | stop | 191 | 2,277 | 72.0 s |
| B | Wide | T1–T5 | 602 | stop | 199 | 2,218 | 74.2 s |
| C | Minimal | T5–T6 | 268 | stop | 213 | 2,235 | 68.2 s |
| C | Standard | T3–T6 | 517 | stop | 186 | 2,814 | 80.4 s |
| C | Wide | T1–T7 | 772 | stop | 477 | 2,478 | 98.1 s |
| D | Minimal | T7–T8 | 238 | stop | 264 | 2,932 | 85.9 s |
| D | Standard | T5–T8 | 419 | stop | 156 | 2,024 | 65.2 s |
| D | Wide | T3–T8 | 668 | stop | 168 | 2,326 | 74.1 s |

全12 Runが`stop`、errorなし。各Runは独立し、前Runの回答を後続requestへ含めていない。

## Case A

### Minimal / Standard

接近速度2cと個々の光の速度cは区別した。一方で、「光の視点では相手もcに見えるはず」という推論を持ち込み、T2の「光の静止系を作れず通常の相対速度として定義できない」という訂正と整合しない形で、ユーザーの元の理解を一部正しいと評価した。Standardは会話端clampでMinimalと同じ入力・同じ出力なので、両条件の品質差は評価できない。

### Wide

T3にあるユーザー自身の「2cは距離の縮み方であって、光そのものの速度ではない」という言い換えを使い、接近速度は2c、光から見た相対速度は定義できず単にcとは言えない、と整理した。T3後半の波粒子話題は回答へ混入しなかった。ユーザーの修正理解が補助になった候補。

## Case B

3条件とも、T3の「波でも粒子でもない」をユーザーの言い換えとして受け、T4の「古典概念のどちらにも完全には収まらない」と結びつけた。Minimalで主要な回答は成立した。Standardの相対速度話題、WideのT5の日常語の話題による明確なノイズは観察しなかった。

## Case C

3条件とも、T5のユーザーの抽象化とT6の補正を区別し、「日常語の限界」と「物理学上の正体不明」は同義ではないと回答した。Minimalは「断定できない」とやや慎重、Standardは直接的だった。Wideは区別を維持したが、fixture外の半導体・レーザー例を追加し477文字へ長文化した。誤答ではないが、広いContextで一般論へ拡大した候補。

## Case D

3条件とも、T7のユーザー表現をAI自身の発言と混同せず、「かなり合っているが数式だけでは完結せず、文章や図も必要」と評価した。Minimalで成立し、Standard / Wideによる明確な品質改善は確認できない。Wideに含まれる波粒子話題の混入も観察しなかった。

## Comparison

### User misunderstanding and correction

- Case Aでは、T1–T2だけのMinimal / Standardが訂正を完全には維持できず、T3のユーザー自身の言い換えを含むWideで区別が安定した候補が見られた。
- Case B–Dでは、直前のUser Turnが質問に必要な言い換えを明示しており、Minimalで主要な流れを引き継げた。

### User statement attribution

全12回答で、質問中の「私が言った／私が考えた」をAI自身の過去発言として明確に取り違えた例は観察しなかった。ただしB/Cの回答は「提供された文脈」と一般化しており、話者帰属を明示的に説明したわけではない。

### Context too small candidates

- A-Minimal / A-Standard。対象自体は特定したが、誤解と訂正の境界が不安定だった。
- B–Dには明確な不足候補なし。

### Context sufficient candidates

- A-Wide。ただしMinimalとの差はT3追加だけであり、「Wide一般」が必要という意味ではない。
- B-Minimal、C-Minimal、D-Minimal。

### Context noise candidates

- C-Wideは別話題の誤認ではないが、fixture外の一般例と長文化が増えた。
- A-Wide、B-Wide、D-Wideでは後続・遠い話題の明確な混入を観察しなかった。

## Limitations

- 各条件1 Runであり、temperature 0でも実行環境の完全決定性は保証されない。
- 各Caseの直前1 Turnが必ずユーザー発言なので、Minimalでもユーザー側前提を含む。ユーザー発言がさらに遠い場合は未検証。
- Case AのMinimal / Standardは会話端で同じ入力になり、条件差を比較できない。
- 回答の物理的妥当性と会話連続性は別評価であり、本ReportはCodex一次観察。

## Human Review（2026-10-01）

この節は実モデル出力に対する人間側の解釈記録であり、上記のCodex一次観察やAutomatic checksとは分けて扱う。既存Run、Preview、Codex一次観察は変更しない。

### Assistant回答だけでなく、User発言にも重要な意味がある

今回の結果では、Assistant側の説明だけでなく、User側の発言が後続理解に影響する例が観察された。

特にCase Aでは、T2でAssistantが接近速度2c、個々の光の速度c、光の静止系を作れないため「光から見た他方の相対速度」は通常の意味では定義できないことを説明していた。それにもかかわらず、T1–T2だけを渡したMinimal / Standardでは、その訂正が完全には維持されなかった。

一方、T3のUserによる「2cになるのは距離の縮み方であって、光そのものの速度ではない」というユーザー自身の言い換え・理解更新まで含めたWideでは、区別が明確になった。

したがって、Assistantの説明は提供された情報であり、Userの発言はその情報をどう理解・誤解・再解釈したかの痕跡と考えられる。

### Conversationの価値は個々のTurnだけでなく、往復そのものにある可能性

今回の実験から、`User → Assistant → User → Assistant`の往復そのものが思考の流れを形成している可能性がある。

- Userが最初にどう考えていたか
- Assistantがどこを訂正したか
- Userがその説明をどう言い換えたか
- そこからどのような疑問・抽象化へ進んだか

これらは単一Turnには完全には保存されていない。Conversationは単なる情報の列ではなく、思考状態が更新されていく過程として扱う価値がある。

### New Chat Handoffで重要なのは固定Turn数そのものではない

v0.3〜v0.5では、Minimalで十分なケース、Standardが無難なケース、Wideでノイズが増えるケース、Wideで遠い重要Turnを拾って改善するケースが混在した。

必要なのは「前何Turn」ではなく、質問に必要な思考のつながりがContextに含まれていることだと考える。Turn数は、その思考のつながりを近似的に取得するための単純な窓サイズにすぎない。

### 「思考の節目」が重要という仮説

将来的には、次のようなTurnが重要Contextになり得る。

- User自身の誤解
- Assistantによる訂正
- User自身による言い換え
- 理解の更新
- 新しい疑問
- 抽象化
- 前提の変更

これらを本Human reviewでは仮に「思考の節目」と呼ぶ。現時点で自動判定する仕様は作らず、固定ルール、LLM判定、RAG、Embedding等による自動抽出も行わない。

### 設計上の示唆

Att-ChatにおけるConversationは、AI回答の保存場所だけでなく、UserとAIの対話による思考の軌跡として扱う価値がある。

New Chat Handoffも、会話履歴をコピーする機能というより、その時点までの思考状態を新しいConversationへ持ち運ぶ機能として捉えられる。ただし、これは設計思想と実験結果の解釈であり、実装仕様ではない。

### 現時点の実装方針

このHuman reviewから、自動Context selection、User Turn優先取得、思考の節目検出、RAG、Embedding、Semantic Search、User SOUL / Learner Stateを自動的に実装しない。

現状のTurn-based Handoffは、「思考のつながり」を単純な近接Turn窓で近似する方式として維持する。固定の最適Turn数、本番採用、自動Context拡張は決定せず、本番DB / Conversation / Question Keepへ接続しない。

### Human Review Summary

> v0.5では、Assistant回答だけでなくUser自身の誤解・言い換え・理解更新が後続回答の安定に寄与する例が観察された。
>
> Conversationの価値は個々のTurnの情報量だけでなく、UserとAssistantの往復によって形成される思考の流れに存在する可能性がある。
>
> New Chat Handoffで本質的に必要なのは固定Turn数ではなく、質問に関係する前提・訂正・再解釈などの「思考の節目」がContextに含まれていることである。
>
> 現時点ではその節目を自動判定せず、Turn-based Contextを近似手段として維持する。
