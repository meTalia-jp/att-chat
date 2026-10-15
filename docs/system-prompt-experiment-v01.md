# Att-Chat System Prompt Experiment v0.1

## UI

Settingsの左navigationへ `System Prompt` を追加した。画面は `Experimental` 表示、使用可否checkbox、8行textarea、`適用` button、LM Studio側のPromptと両方が影響し得る旨の短い説明で構成する。メインChatにはSystem Prompt専用UIを追加していない。

設定値はProduction React rootが次のsession stateとして保持する。

```ts
{
  enabled: boolean;
  text: string;
}
```

初期値は `enabled=false`, `text=""`。`適用`を押した時点でeditor内容を生成設定へ反映する。reload、Electron再起動、DBへの永続化は行わない。

## ON / OFF仕様

- OFFではclientが `system_prompt` fieldを送らず、既存requestを維持する。
- ONでもtrim後が空文字ならfieldを送らず、既存requestを維持する。
- ONかつtextありの場合だけ `system_prompt` を送る。
- serverは改行をLFへ正規化し、前後空白を除去する。上限は20,000文字で、NUL、非文字列、上限超過を拒否する。
- 実験終了後の手動確認画面ではOFFへ戻した。

## Generationへ入れた場所

ClientはNormal Chat、Marker Immediate Ask、Question Keep same-chat ask、New Chat Handoffの共通Composer送信時にoptional `system_prompt` を付与する。

Serverはrequestを検証後、GenerationRunを作る直前にmodel messagesへ追加する。通常Chatでは先頭、既存system messageを持つ経路では既存system message群の直後へ挿入する。Providerへ渡す正本は従来どおり `generation_runs.request_snapshot` であり、実験Promptを含む実際のmessagesがそのまま保存される。schema変更は行っていない。

```text
Normal Chat
  system: Experimental prompt
  completed history
  user: current message

Immediate Ask / Keep Context / Handoff
  system: existing Att-Chat context instruction
  system: Experimental prompt
  user: structured context and question
```

## Normal Chat結果

2026-10-07、Production UIとLM Studio実モデル `gemma-4-12b-coder-fable5-composer2.5-v1` で確認した。

### Test A: 接続確認

Prompt:

```text
すべての回答の先頭に必ず「SYSTEM-TEST」と書いてください。
```

同じ質問 `水は何度で凍りますか？短く答えてください。` に対し、OFFでは `水は0度（摂氏）で凍ります。`、ONでは `SYSTEM-TEST 0度` となった。ON Runのsnapshotは `system + user`、OFF Runは `user` のみだった。

### Test B: 1文制限

Prompt:

```text
すべての回答を必ず1文だけで答えてください。
説明を追加しないでください。
```

`太陽系の惑星について詳しく説明してください。` に対し、回答は1文のみになった。

### Test C: 箇条書き指定

Prompt:

```text
回答では最低5項目の箇条書きを使用してください。
最後に必ず「以上です。」と書いてください。
```

`集中して読書するための工夫を教えてください。` に対し、5項目の箇条書きと末尾 `以上です。` が生成された。

## Marker Immediate Ask結果

Production Conversation `Phase 2A 実機検証` の最新completed Assistant Turn T19にあるMarker `特徴と近年の動向` から、`この見出しの意味を1文で説明してください。` をImmediate Askとして送信した。

回答は `SYSTEM-TEST` から始まった。保存済みsnapshotのrole順序は `system, system, user` で、1つ目に既存Immediate Ask instruction、2つ目にExperimental prompt、3つ目にMarker対象と質問が入っていた。Immediate Ask固有contextは置換されていない。

## OFF比較

Test A後にOFFへ戻し、新規Conversationで `日本の首都はどこですか？都市名だけで答えてください。` を送信した。新しいRunのsnapshotは `user` のみで、回答に `SYSTEM-TEST` は含まれなかった。モデル回答の内容精度はこの接続試験の評価対象外であり、ここでは新規requestから実験Promptが除外されたことを確認した。

## request snapshot確認

実DBの直近Runをread-onlyで確認し、次を確認した。

- OFF 2 Run: system message 0件。
- Test A ON: Experimental system message 1件。
- Immediate Ask ON: 既存system + Experimental systemの2件。
- Test B / C: 適用した各Promptがsnapshotへ保存。
- 全確認Runは `succeeded`。

Developer / ExperimentalのRun詳細表示は既存 `request_snapshot` を表示するため、今回Promptが適用されたか追跡できる。

## 既存Contextとの関係

既存ContextをExperimental promptで上書きしていない。先頭から連続する既存system messagesの後ろへ追加するpure helperを共通利用し、Normal Chat、Immediate Ask、Keep Context、Handoffのmessage構造を維持する。ProviderやLM Studio側設定、Thinking、Reasoning Effort、Preserve Thinkingには変更を加えていない。

## Tests

- Settings tab、checkbox、textarea、ApplyをUI testで確認。
- OFF / 空文字で既存Normal Chat requestと同じことを確認。
- ONでNormal Chat snapshotへsystem messageを追加することを確認。
- Immediate AskとKeep Contextで既存system messageを維持することを確認。
- ClientのNormal Chat payloadへ適用済み `system_prompt` が入ることを確認。
- Prompt正規化と挿入順を固定。

## 残課題

- 設定値の永続化は未実装。
- Conversation別、model別のPrompt切替は未実装。
- LM Studio側Promptとの競合を可視化・解決する機能は未実装。
- Prompt preset、history、libraryは未実装。

## Experimental継続 / 再検討の判断材料

極端な指示3種類がNormal Chatの形式を明確に変え、Immediate Askにも同じ効果が出たため、Att-Chat側System Promptの接続価値は確認できた。一方、session-onlyであり、LM Studio側Promptとの優先関係も利用者には見えない。正式機能化の前にSettings永続化方針と競合表示をまとめて設計する必要がある。
