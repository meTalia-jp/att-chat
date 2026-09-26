# Laboratory Tool Cards

Tool Cardは初見Agentが「この道具を使うべきか」を判断するための札です。APIリファレンスを複製せず、用途・条件・副作用・誤用を示します。[Inventory](../current-laboratory-inventory.md)から探し、Cardから実コード・テストへ進みます。

これはMarkdown文書であり、Registry・動的discovery・実行許可ではありません。Cardの存在はEquipment認定を意味しません。作業範囲は[LAB_GUIDE](../../../LAB_GUIDE.md)と対象ExperimentのScope Boundaryに従います。

## 作成対象の基準

以下のいずれかを満たす資産を候補とします。

- 複数Experiment、または本番とLabで共有。
- filesystem / DB / network / process / browser state等への副作用がある。
- 誤用で本番データや実験結果を壊し得る。
- コードだけでは利用条件が判断しにくい。

今回は[LMStudioProvider](lmstudio-provider.md)、[RunFiles](run-files.md)、[Marker stack](marker-stack.md)の3枚だけです。完全な型はコード、判断の経緯はExperiment文書を正本とします。Owner / sourceは責任範囲・由来であり、人の担当を推測しません。

最終照合: 2026-09-26、dirty tree（詳細はInventory）。実装変更時は該当Cardも照合します。

## 最小フォーマット

```markdown
# Tool Card: <name>

- Classification:
- Code:
- Owner / source:
- Used by:
- Evidence:

## What it is
## What it is for
## When to use
## Inputs
## Outputs
## Side effects
## Do not use for
## Failure and recovery
## Current maturity
```

必要な場合だけKnown limitationsを追加します。Experiment一覧・状態やAPI定義は重複させません。
