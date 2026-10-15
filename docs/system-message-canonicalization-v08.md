# Att-Chat System Message Canonicalization v0.8

## 背景

Att-Chatは、内部Context、System Profile、User Profileを独立した論理要素として管理する。従来はそれぞれを独立した`system` messageとしてrequestへ追加していたため、複数要素が有効な場合は`system, system, ...`という物理配列になっていた。

2026-10-10の`qwen/qwen3.6-35b-a3b`実行では、System ProfileとUser Profileを同時に有効化したrequestが、LM Studioのchat template展開時に次の500エラーで拒否された。

```text
Jinja Exception: System message must be at the beginning.
```

実際の失敗requestは先頭に2件の`system`を含んでいた。2件目は配列先頭ではないため、単一の先頭systemだけを許可するtemplate制約に違反した。

## 修正内容

共通helper `canonicalizeSystemMessages` を追加した。RepositoryがGenerationRunを予約し、`request_snapshot`を確定する直前に全Production生成経路でこのhelperを使用する。

対象経路:

- Normal Chat
- Marker Immediate Ask
- Question Keep Context Correction
- New Chat Handoff

内部Context、System Profile、User Profileの設定・責務は分離したままで、Provider requestの物理表現だけを最大1件の`system`へ変換する。経路別のmerge実装は追加していない。

## Canonical system仕様

- system要素が0件なら、新しいsystem messageを作らない。
- system要素が1件なら、本文を変更しない。
- system要素が複数なら、元の論理順序を維持して1件へ統合する。
- 複数要素時は、`ATT-CHAT CONTEXT`、`SYSTEM PROFILE`、`USER PROFILE`の見出しで境界を示す。
- User Profile既存wrapperの`USER PROFILE`見出しは重複させない。
- user / assistant messageの内容と順序は変更しない。

統合順序:

```text
# ATT-CHAT CONTEXT
<内部Context>

# SYSTEM PROFILE
<System Profile>

# USER PROFILE
<User Profile wrapper本文>
```

OFFまたは空の要素は、セクションごと出力しない。

## Request snapshot

正規化後のmessagesから`GenerationRun.request_snapshot`を作成する。GenerationServiceは従来どおり、そのsnapshotを変更せずProviderへ渡す。

Focused testでは全4経路について、以下を確認した。

```text
canonical messages
== request_snapshot.messages
== actual Provider request messages
```

過去Runのsnapshot、DB schema、migrationは変更していない。

## Qwen 3.6確認結果

モデルID: `qwen/qwen3.6-35b-a3b`

再現条件のSystem Profile ON + User Profile ONを、Production Repository / GenerationServiceと隔離memory DBで1回実行した。

| 項目 | 結果 |
|---|---|
| roles | `system,user` |
| system件数 | 1 |
| System Profile保持 | PASS |
| User Profile保持 | PASS |
| snapshotとProvider request一致 | PASS |
| outcome | `succeeded` |
| finish_reason | `stop` |
| 500エラー | 再発なし |
| 応答時間 | 約26.1秒 |

## Qwen 3.8確認結果

モデルID: `qwen/qwen3.8-27b`

System Profile ON + User Profile ONを1回実行した。

- roles: `system,user`
- system件数: 1
- 両Profile本文を保持
- snapshotとProvider request一致
- outcome: `succeeded`
- finish_reason: `stop`
- 応答時間: 約24.6秒

## Gemma確認結果

モデルID: `google/gemma-4-26b-a4b-qat`

| 条件 | roles | system | outcome | finish_reason | snapshot一致 |
|---|---|---:|---|---|---|
| System Profileのみ | `system,user` | 1 | succeeded | stop | PASS |
| User Profileのみ | `system,user` | 1 | succeeded | stop | PASS |
| 両方 | `system,user` | 1 | succeeded | stop | PASS |
| Structured Context + 両方 | `system,user` | 1 | succeeded | stop | PASS |

Structured条件では、内部Context、System Profile、User Profileの3要素がcanonical system内にこの順で存在することも確認した。

## その他確認モデル

今回の実モデル確認は、必須対象のQwen 3.6、追加確認のQwen 3.8、Regression対象のGemma 4に限定した。Llama系、Mistral系の追加Runは行っていない。

## 連続user観察

今回の正規化はsystemだけを対象とする。既存Conversationに失敗Assistant Turnなどがある場合に、次のようなrole配列が残る可能性は変更していない。

```text
system,user,user,user,assistant,user
```

今回の短いsmoke fixtureでは各requestが`system,user`だったため、連続userに起因するtemplate互換性は評価していない。実会話で別のtemplate errorが発生した場合は、History Compatibilityの別Phaseとして扱う。

## Validation

- Focused canonicalization test: 16 pass / 0 fail
- `npm test`: 376 total / 374 pass / 2 skip / 0 fail
- `npm run typecheck`: PASS
- `npm run build`: PASS
- `git diff --check`: PASS（既存working treeの改行変換warningのみ）

## 未対応事項

- 連続userのmerge・role変換
- system非対応モデル向けの専用変換
- Llama / Mistral全モデル検証
- Settings永続化
- Profile本文・Profile UI変更
- DB schema / migration変更
