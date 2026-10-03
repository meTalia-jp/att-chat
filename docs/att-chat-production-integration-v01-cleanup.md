# Att-Chat Production Integration v0.1 Cleanup

## Scope

Phase 6 Full Integration v0.1で確認した、送信受付後のPreview残留と、Handoff Previewの質問対象へraw Markdownが露出する問題だけを修正した。新機能、schema、migration、GenerationRun契約、Question Keep lifecycleは変更していない。

## 1. Preview state cleanup

### Cause

same-chat Keep askとNew Chat Handoffは、serverから`prepared`を受け取った後に質問確認UIを閉じていたが、`keepContextPreview` / `handoffPreview`のReact state自体はclearしていなかった。このため通常Composerへ戻った後も、直前のPreviewが残る場合があった。

### Change

streamの`prepared`イベントを受け取った時点で、送信種別に対応するPreview stateだけをclearする。

- same-chat Keep ask: `keepContextPreview → null`
- New Chat Handoff: `handoffPreview → null`

Preview作成だけではclearしない。server validationが`prepared`前に失敗した場合もPreviewを保持する。Provider失敗が`prepared`後に発生した場合は、送信予約済みという既存lifecycleに合わせてPreviewをclearした状態を維持する。Immediate Ask stateには触れない。

## 2. User-facing Marker quote

### Cause

New Chat Handoff Previewは、anchor検証用の`source_text`から組み立てたmodel-facing `first_user_message`を、そのままユーザー向けPreviewにも表示していた。Markdown装飾境界をまたぐMarkerでは、`source_text="干渉**は"`、`target_text="干渉は"`となり、質問対象へraw `**`が露出した。

### Change

New Chat Handoff Preview DTOへ次を追加した。

- `marker_target_text`: ユーザー向けの選択表示
- `display_first_user_message`: `target_text`で質問対象を組み立てた表示専用メッセージ

既存の`marker_source_text`とmodel-facing `first_user_message`は維持した。実際のProvider requestは従来どおり`source_text`を使い、Runの`reference_snapshot`には`source_text`と`target_text`を両方保持する。Keep Contextは既に質問対象へ`target_text`を使用していたため、その契約をfixtureで明示的に検証した。

## Tests

追加・更新した確認:

- Preview-onlyではsame-chat / Handoff Previewを保持
- validation failureでは両Previewを保持
- `prepared`受領後は対応するPreviewだけをclear
- Handoff成功時は新Conversation IDでrefreshし、旧Previewを残さない
- `source_text != target_text`の装飾境界fixture
- user-facing質問対象は`target_text`
- model-facing Handoff requestは既存の`source_text`契約を維持
- `reference_snapshot`は`source_text` / `target_text`を両方保持

Focused tests: PASS — 15 tests / 15 pass / 0 fail。

## Phase 6 regression

- `npm test`: PASS — 320 tests / 318 pass / 2 skipped / 0 fail
- `npm run typecheck`: PASS
- `npm run build`: PASS — Vite 8.2.2、327 modules transformed
- `git diff --check`: PASS（既存working treeのCRLF→LF warningのみ、whitespace errorなし）

Phase 6で確認済みのNormal Chat、Immediate Ask、Deferred Ask、Global Question Box、return-to-source、Keep Context、New Chat Handoff、および両reference tableの契約は再設計していない。
