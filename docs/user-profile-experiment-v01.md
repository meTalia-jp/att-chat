# Att-Chat User Profile Experiment v0.1

## Purpose

Settings の `System Prompt` 画面へ、回答相手の前提知識・説明量・専門用語の好みを自由記述で渡す `User Profile` を追加した。User Profile は命令や固定属性ではなく、現在の質問と明示的な指示を優先する補助 Context として扱う。

## UI

- `System Prompt` と `User Profile` は独立した ON/OFF、textarea、適用操作を持つ。
- 説明文は「回答の難易度、説明量、専門用語の使い方を調整するための参考情報です。」とした。
- placeholder に Python、数学、専門用語、結論先行の入力例を表示するが、初期値は空である。
- 状態は既存 System Prompt Experiment と同じ React session state だけに保持し、DB・localStorage・migration は追加していない。
- 実モデル確認後は System Prompt / User Profile とも OFF へ戻した。入力文は同じセッション内の再編集用に残る。

## Wrapper

User Profile が ON かつ trim 後に空でない場合だけ、次の wrapper を system message として追加する。

```text
USER PROFILE

以下は回答相手についての参考情報です。
回答を作る前に一度確認し、難易度、説明量、専門用語の使い方を調整する際の参考にしてください。

ただし、
- 現在の質問内容を優先してください。
- ユーザーの明示的な指示を優先してください。
- プロフィールだけを根拠に過度な推測をしないでください。
- 必要以上に初心者向け・専門家向けへ寄せすぎないでください。

[User Profile]
<自由記述本文>
```

`必ず従うこと`、`最優先`、`厳守` は使用していない。改行は LF へ正規化し、空文字は未指定として扱う。上限は実験用 System Prompt と同じ 20,000 文字である。

## System message order

送信時の順序は次の通り。

1. 既存 Att-Chat system context（Immediate Ask / Keep Context / New Chat Handoff）
2. Model System Prompt Experiment
3. User Profile
4. history / current user request

通常 Chat に既存 system context がない場合は、System Prompt、User Profile、既存 history、current user の順になる。OFF または空文字のレイヤーだけを省略する。

## Connected generation paths

共通 Composer request と Repository の生成予約処理へ optional `user_profile` を追加した。

- Normal Chat
- Marker Immediate Ask
- Question Keep same-chat Context Correction
- New Chat Handoff

Provider 用 `messages` を確定してから、その同じ値を `generation_runs.request_snapshot` に保存する。schema は変更していない。

## Real model comparison

実施日時: 2026-10-08

Model: `gemma-4-12b-coder-fable5-composer2.5-v1`

共通質問:

```text
量子もつれが量子コンピュータで重要な理由を説明してください。
```

### Profile OFF

- Run: `48a0ac79-ceec-457d-8e0e-6f2c0e101a8b`
- request roles: `user`
- Hilbert 空間、CNOT、HHL、Surface code 等を早い段階から使用した。
- 3項目構成で説明量は多いが、専門語の初出説明は限定的だった。

### Beginner profile

Profile:

```text
対象分野についてほとんど知識がありません。
専門用語は初出時に短く説明してください。
高校生程度でも理解できる説明を好みます。
```

- Run: `80c8990f-889c-4452-bdd6-6d7dfbdba279`
- request roles: `system, user`
- 重ね合わせや干渉へ説明を加えようとする変化は見られた。
- Shor、Grover、constructive interference 等も残り、初心者向けへの寄せ方は完全ではなかった。
- このモデルでは User Profile の効果は見えるが、出力品質と日本語の安定性にはばらつきがある。

### Expert profile

Profile:

```text
対象分野について専門的な知識があります。
基礎説明は最小限で構いません。
専門用語をそのまま使用してください。
```

- Run: `69228c83-c146-4c3a-89c0-5011cca511d5`
- request roles: `system, user`
- `tensor product 分解不能性`、`entangled basis`、`QEC`、`EPR pair / Bell state` などを定義なしで使った。
- 基礎説明を短くし、専門用語の密度を上げる差が明確だった。

## System Prompt + User Profile

System Prompt:

```text
すべての回答の先頭に必ず「PROFILE-SYSTEM」と書いてください。
```

Beginner profile と同時に ON にして `量子もつれとは何ですか？` を送信した。

- Run: `36155075-6ebd-4af7-b1cf-22ed0d752cb7`
- request roles: `system, system, user`
- 1件目が Model System Prompt、2件目が wrapper 付き User Profile であることを snapshot で確認した。
- 回答先頭に `PROFILE-SYSTEM` が入り、同時に dice の比喩と `superposition` の短い定義が使われた。
- Behavior と Profile は互いを上書きせず、独立した system message として同時に作用した。

## Marker Immediate Ask

最新 completed Assistant Turn の resolved Marker `Quantum entanglement` から、次を Immediate Ask として送信した。

```text
初心者向けに、なぜ量子計算で役立つのか説明してください。
```

- Run: `b8cd35dd-d087-46da-887a-281ccbecab25`
- kind: `highlight_question`
- request roles: `system, system, user`
- 1件目に既存 Immediate Ask system context、2件目に User Profile、3件目に構造化した Marker 質問が保存された。
- 回答は「量子もつれ」「重ね合わせ」「qubit」を説明しながら回答し、ProfileがImmediate Askでも欠落しなかった。
- System PromptはこのRunの前にOFFへ戻しており、snapshotにも含まれていない。

## Keep Context / New Chat Handoff

自動テストで両経路を確認した。

- Keep Context: `keepContextSystemPrompt → Model System Prompt → User Profile → user`
- New Chat Handoff: `productionHandoffSystemPrompt → Model System Prompt → User Profile → user`
- User Profile OFF / 空文字では既存requestを変更しない。
- 元会話を履歴messageとして増やす既存契約変更はない。

## Request snapshot

実モデル4条件の `request_snapshot.messages` をDB/APIから読み直した。実際のRunはすべて `succeeded` で、Profile OFF、Beginner、Expert、System Prompt併用、Immediate Askの各role順とwrapper本文が実request snapshotへ保存されていた。GenerationServiceがsnapshotをProviderへそのまま渡す既存テストも維持している。

## First observation

- Profileなしとの差は確認できた。特にExpert profileは専門語密度と説明開始位置の差が明確だった。
- Beginner profileも定義追加の傾向を示したが、専門語を十分に抑えるほど強くはない。
- System Promptの形式指示より弱く、現在質問を置き換える挙動は観察されなかった。
- Marker Immediate Askでも同じProfileが適用された。
- モデル固有の日本語崩れや事実表現の粗さは残り、User Profileは回答品質そのものを保証しない。

## Validation

- User Profile UI、独立ON/OFF、textarea、session-only適用
- OFF / 空文字の非介入
- Normal Chat / Immediate Ask / Keep Context / New Chat Handoff
- System Promptとの併用・順序
- request snapshot保持
- LM Studio実モデル比較
- `npm test`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

実行結果:

- `npm test`: 356 total / 354 pass / 2 skip / 0 fail
- `npm run typecheck`: PASS
- `npm run build`: PASS（338 modules transformed）
- `git diff --check`: PASS

## Future evaluation

正式機能化は未判断。今後評価する場合は、専門分野別に質問を固定し、説明長・専門語の初出定義・誤った過剰推測を人間評価する。Profile preset、自動推定、自動更新、Conversation別保存、永続化は今回実装していない。
