# Att-Chat Full Integration v0.1

## Scope

Phase 1〜5で接続した本番経路を、Frozen Visual Reference `Att-Chat Integrated Dummy UI v0.1` と照合しながら横断確認した。新機能、schema再設計、Production UI修正は行っていない。

実ブラウザ確認は通常ユーザーDBから分離した `D:\att-Chat\.cache\phase6-e2e.sqlite` と `http://127.0.0.1:5198/` を使用した。実モデルは `qwen3.5-0.8b` を選択し、同一の代表シナリオ内で Normal Chat、Immediate Ask、same-chat delayed question、New Chat Handoff の4 GenerationRunを実行した。

## Representative end-to-end scenario

1. `Phase 6 E2E 統合確認` Conversationを作成し、通常質問を送信した。
2. 最初のAssistant TurnへMarker A / Bを作成した。
3. Marker AをDeferred AskとしてKeepへ保存した。
4. Marker BとMarker AをImmediate Ask参照へ追加し、2 Markerを1 Runとして送信した。
5. Question BoxからMarker Aへ戻り、exact Turn / exact Markerのpulseを確認した。
6. Marker AのKeepを標準Contextでsame-chat送信した。
7. Marker Bから別のKeepを作成し、標準Handoffで新Conversationを作成した。
8. 元Conversationへ戻り、Marker Bをunresolvedへ変更してTurn fallbackを確認した。
9. Marker Bを本番削除APIで削除し、live Highlight / Keep削除後も過去Run snapshotが残ることを確認した。

## Flow results

| Flow | Result | Evidence / observation |
|---|---|---|
| A — Normal Chat | PASS | Conversation作成、User Turn保存、モデル送信、Assistant Turn保存、通常Run成功を確認した。 |
| B — Immediate Ask | PASS | 最新completed Assistant Turnのresolved Markerを2件追加し、通常draftと独立した参照として1 Runへ送信した。User Turnは人間が読めるplain text、`run_marker_references`は `reference_no` 0 / 1で保存された。Keepは増えなかった。 |
| C — Deferred Ask | PASS | Marker DetailからQuestion Keepを作成し、Global Question BoxへConversation groupとして即時反映された。 |
| D — Return | PASS | resolved時はexact Conversation / Turn / Markerへ戻り、`該当Markerへ移動しました。`とpulseを確認した。unresolved時はexact Turnへ戻り、`Marker位置を確認できません。`を表示し、文字列による再anchorは行わなかった。 |
| E — Same-chat delayed question | PASS | Question Boxから確認画面を開き、標準ContextのPreview後に明示送信した。`system + user`のrequest、Context snapshot、Keep `pending → asked`、Assistant Turn保存を確認した。 |
| F — New Chat branch | PASS | PreviewだけではConversation数は増えず、明示送信で初めて新Conversation、User Turn、Assistant Turn、Runを作成した。元Keepはpendingのまま維持された。 |

## State continuity

連続操作中、selected Conversation、Marker Detail、Immediate Ask配列、Question Box grouping、Handoff setup、model selectionは互いの処理内容を取り違えなかった。Immediate Ask送信後に参照配列は消去され、Deferred AskだけがKeepとして残った。新Conversation作成後に元Conversationを選び直すこともできた。

model selectionは経路切替後も `qwen3.5-0.8b` を維持した。Marker Detailの単純closeやQuestion Box閲覧だけで送信・Keep lifecycle変更は発生しなかった。

一方、成功後の表示stateには次の非阻害問題が見つかった。

- same-chat送信後、確認UIは閉じるが直前の `Keep Context Preview` が通常Composer内に残った。`戻る`で消せる。
- New Chat Handoff成功後、新Conversationへ移動しても直前の `New Chat Handoff Preview` がComposer内に残った。Conversationを切り替えると消えた。

## Database integrity

### Marker削除前

| Table | Count |
|---|---:|
| conversations | 2 |
| turns | 8 |
| highlights | 2 |
| question_keeps | 2 |
| generation_runs | 4 |
| run_question_references | 2 |
| run_marker_references | 2 |

4 Runはそれぞれ次の契約で保存された。

- Normal Chat: `kind=chat`, `context_strategy=completed_turns`, succeeded
- Immediate Ask: `kind=highlight_question`, `context_strategy=immediate_marker_questions`, succeeded
- same-chat Keep ask: `kind=highlight_question`, `context_strategy=turn_based_keep_context`, succeeded
- New Chat Handoff: `kind=highlight_question`, `context_strategy=turn_based_handoff`, succeeded

Immediate Askの2参照は同一Runに `reference_no=0,1` で保存され、Question Keepは作成されなかった。same-chat Keepは送信開始時にaskedとなり、New Chat Handoff元のKeepは送信後もpendingだった。

### Marker削除後

Marker Bを削除した結果、live `highlights` は2→1、Marker Bに属するlive `question_keeps` は2→1となった。一方、`generation_runs=4`、`run_question_references=2`、`run_marker_references=2` は維持された。

削除済みMarker Bについても、Immediate Ask側には `source_highlight_id`、source Turn、question、offset、`source_text`、`target_text`を含むsnapshotが残った。New Chat Handoff側にも元Keep ID、source Conversation / Turn / Highlight、included Turn IDsを含むsnapshotが残った。live FKを持たないhistorical referenceとして期待どおり取得できる。

## Frozen Dummy comparison

### BLOCKER

なし。A〜Fの主要経路は隔離DBと実モデルで完走した。

### FUNCTIONAL ISSUE

1. **送信成功後のPreview残留**
   same-chat Context PreviewとNew Chat Handoff Previewが、成功後の通常Composerに残る。保存・送信結果は正しいが、次の入力時に古い確認内容が見える。
2. **装飾境界をまたぐMarkerのHandoff表示**
   Markdownのstrong境界をまたいで保存したMarker Bは `target_text="干渉は"` に対し `source_text="干渉**は"` だった。snapshotとして両者を保持すること自体は契約どおりだが、Handoff Previewの質問対象にraw `source_text` が表示され、`**` が露出した。

### UI POLISH

- 本文選択からMarkerを作成すると、折りたたまれていた開発用Marker登録パネルが自動展開される。登録後は閉じるが、Frozen ReferenceのSignal起点より操作の占有が大きい。
- New Chat Handoffの新Conversationでは、Frozen Referenceが想定した「表面User Turnは質問だけ」ではなく、構造化された引継ぎ本文全体がTurnに表示される。保存内容とmodel requestは追跡しやすいが、Conversationの読みやすさはReferenceと異なる。
- Question Box、Marker Detail、Composer参照は機能するが、KeepやImmediate Askが増えた場合の縦密度は引き続き実使用での確認が必要。

### INTENTIONAL DIFFERENCE

- Frozen Dummyは3カラムすべてを一画面へ固定したが、本番は既存Production architectureを維持している。Phase 1〜5の対象外だったQuick辞書 / Quickメモの本番Right Sidebar統合は行われておらず、現在の右側はTurn miniMAP中心である。
- 開発用Marker管理、Run詳細、model selectorは検証導線として残っている。通常時はMarker管理を折りたためるが、Frozen Dummyには存在しない。
- Dummy componentはProductionへコピーせず、既存Marker rendering、Question Keep、GenerationService、GenerationRun、Handoff経路へ接続している。

## Data-contract conclusions

- Immediate AskはKeepを作成せず、1 Run:N Markerを `run_marker_references` で保持した。
- Deferred AskだけがQuestion Keepを作成した。
- same-chat Keep askだけが元Keepをaskedへ移行した。
- New Chat Handoffは元Keepを変更しなかった。
- Marker削除はlive Keepを削除したが、完了済みRunのreference snapshotを削除しなかった。
- Normal、Immediate、same-chat、Handoffはすべて同じ隔離DB内で独立したGenerationRunとして追跡できた。

## Validation

- `npm test`: PASS — 317 tests / 315 pass / 2 skipped / 0 fail
- `npm run typecheck`: PASS
- `npm run build`: PASS — Vite 8.2.2、327 modules transformed
- `git diff --check`: PASS（既存working treeのCRLF→LF warningのみ、whitespace errorなし）

## Remaining work

1. 成功後にsame-chat / Handoff Previewを明示的にclearする。
2. HandoffとContext Previewで、ユーザー向け引用には`target_text`を使い、raw Markdown sourceとの役割を分ける。
3. Frozen Referenceに合わせる場合、新Conversationの保存本文と表面表示本文をどう分離するかを設計判断する。
4. 開発用Marker登録パネルとRun詳細を通常利用からさらに分離するか、人間評価で決める。
5. Quick辞書 / Quickメモの本番Right Sidebar統合は別Phaseとして扱う。

この監査では上記問題を修正せず、分類と再現結果の記録で停止した。
