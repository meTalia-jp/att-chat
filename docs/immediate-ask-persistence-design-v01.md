# Immediate Ask Persistence Design v0.1

## Current constraint

この文書は、Phase 2で用意したImmediate Askの本番UI/stateを、将来1つの`GenerationRun`として永続化するための設計監査である。今回はschema、migration、API、UI、testを変更しない。

現行コードから確認できる制約は次のとおり。

- `generation_runs`は`kind`、`context_strategy`、`strategy_version`、実際のモデルrequestを保存する`request_snapshot`を持つ。これらはRun予約後に変更できない。
- `kind`の既存値は`mock | chat | highlight_question`である。Immediate Askは`highlight_question`を再利用し、`context_strategy`でKeep-backed質問と区別できる。
- `run_question_references`は`run_id`が主キーなので、1 Runにつき1行しか保存できない。
- `keep_id`は`NOT NULL`であり、insert triggerは実在するQuestion Keep、resolved Highlight、completed Assistant Turnとの一致を要求する。
- `run_question_references`は削除可能なKeep / Highlightへのlive FKを意図的に持たない。作成時だけtriggerで実体とsnapshotを照合し、その後はUPDATE / DELETEを禁止して履歴を残す。
- Marker削除ではQuestion Keepが`ON DELETE CASCADE`で削除されるが、既存Runと`run_question_references`は残る。
- `request_snapshot`はモデルへ送った内容の正本であり、Providerへ渡したrequestと一致する契約である。
- Phase 2の本番UIは`ImmediateAskDraft | null`で1件だけを保持する。一方、Laboratoryの検証済みUIと今回の将来契約は1回の送信に複数Marker質問を含める。この差は永続化実装時に配列stateへ変更する必要がある。
- Immediate AskはQuestion Keepを作らず、最新completed Assistant Turnのresolved Markerだけを送信時の参照元とする。

このため、既存`run_question_references`へ現在の形のままImmediate Askを保存することはできない。

## Option A

### 既存`run_question_references`を拡張する案

想定変更:

- `keep_id`をnullableにする。
- `reference_no`を追加する。
- 主キーを`run_id`から`(run_id, reference_no)`へ変更する。
- Keep-backed行とImmediate Ask行を識別する`reference_kind`等を追加する。
- triggerをKeepあり / Keepなしで分岐させる。

利点:

- RunのMarker由来参照を1テーブルから検索できる。
- Run詳細取得コードで参照先テーブルを増やさずに済む可能性がある。

問題:

- SQLiteでは`NOT NULL`解除と主キー変更のため、既存テーブルの作り直し、全行コピー、index / trigger再作成が必要になる。
- 既存行はすべて`reference_no=0`へ変換する必要があり、既存のimmutable snapshotに対するmigrationリスクが大きい。
- `keep_id IS NULL`がImmediate Askという暗黙の判別になりやすく、Keep-backed質問とKeep-less質問の意味が混ざる。
- 現行triggerはKeep lifecycle、同一Keepのactive Run排他、同一Conversation / branch snapshot検証を担っている。nullable化すると、1つのtrigger群に別の整合性規則を共存させる必要がある。
- rollback時に旧schemaへ戻すには再度テーブルを作り直す必要がある。

評価: 実現可能だが、既存の安定したKeep-backed契約へ与える影響が大きい。採用しない。

## Option B

### `run_marker_references`を新設する案

Keep-backed質問は既存`run_question_references`をそのまま使い、Keepを作らないImmediate Askだけを新tableへ保存する。

利点:

- `1 Run : N Marker`を`(run_id, reference_no)`で直接表現できる。
- Keep lifecycleとImmediate Askの意味を混ぜない。
- 既存`run_question_references`の列、既存行、保持triggerを変更しない。
- source Conversation / Turn / Highlight IDを列として検索でき、Run詳細やdebug表示を作りやすい。
- 完全なMarker状態をimmutable JSON snapshotにも残せる。
- Highlightへのlive FKを持たなければ、Marker削除後もRun履歴を保持できる。
- 追加migrationなので、既存データのコピーやbackfillが不要である。

追加で必要なこと:

- RepositoryのRun取得で0件以上のMarker参照配列を読む。
- Run予約transaction内でGenerationRun、全参照行、`chat_requests`を一括保存する。
- 1行でも保存に失敗した場合はUser Turn / Assistant Turn / Runを含めて全rollbackする。
- 既存`run_question_references`と新tableの両方へ同じRunが入らない相互排他をtriggerで保証する。

評価: 既存契約を壊さず、複数Markerという新しいcardinalityを明示できる。推奨する。

## Option C

### `generation_runs.request_snapshot`だけへ保存する案

Marker参照配列、質問、offset、source text等をモデル向けrequest JSONへ含め、新tableを作らない。

利点:

- schema / migration変更がない。
- 実際に送った内容は既存のimmutable `request_snapshot`で完全に保持できる。
- 実装撤回が最も容易である。

問題:

- Marker参照だけをRun横断で検索するにはJSON走査が必要になる。
- `request_snapshot`はProvider requestの正本であり、参照管理用のdomain recordではない。モデルprompt形式の変更が検索契約へ波及する。
- `source_highlight_id`、質問別のordinal、参照件数などに通常のindexを付けにくい。
- Run詳細UIがProvider固有request構造を理解しなければならない。
- DB triggerで「resolved Markerをexact ID / offset / textで取得した」「Targetが重複していない」といった予約時整合性を保証しにくい。
- request本文だけでは、モデルに送るpresentationと履歴上の参照metadataの責務が混ざる。

評価: 短期PoCやrollback手段としては有用だが、Productionの監査・debug契約としては不足する。structured tableの代替にはしない。

## Comparison

| 観点 | A: 既存table拡張 | B: 新table | C: snapshotのみ |
|---|---|---|---|
| 既存schemaへの影響 | 大。table再構築 | 小。追加中心 | なし |
| migration複雑度 | 高 | 中〜低 | なし |
| 既存trigger整合性 | 大幅な分岐変更 | 既存を維持し、新規規則を分離 | DB保証が弱い |
| Keep-backedとの意味分離 | 弱い | 明確 | JSON解釈に依存 |
| 1 Run:N Marker | PK変更が必要 | 自然 | JSON配列で可能 |
| Marker削除後の履歴 | FKを付けなければ可能 | snapshot + 非FK IDで可能 | 可能 |
| query / debug | 可能だが条件分岐が多い | 最も容易 | JSON走査が必要 |
| 将来のRun詳細 | 参照kind判別が必要 | 参照配列として明確 | Provider requestへの依存が強い |
| 既存テストへの影響 | 大 | 限定的 | 小 |
| rollback容易性 | 低 | コード側は高、schema downgradeは別途必要 | 最も高い |
| 責務の明確さ | 低〜中 | 高 | 低 |

## Recommended contract

**Option B: `run_marker_references`新設を推奨する。**

理由:

1. Keep-backed質問とImmediate Askはlifecycleが異なる。前者はKeepを質問済みにするが、後者はKeepを作らない。別tableならこの違いをschema上でも維持できる。
2. Immediate Askの本質的な違いである`1 Run : N Marker`を自然に表現できる。
3. 既存`run_question_references`の履歴、trigger、migration済みデータを作り直さずに済む。
4. `request_snapshot`は引き続き「実際のモデルrequest」の正本、新tableは「Runが参照したMarker質問」の正本として責務を分離できる。
5. source IDを列、削除後にも必要な内容をJSON snapshotへ置くことで、検索性と履歴保持を両立できる。

推奨するRun契約:

- `generation_runs.kind = 'highlight_question'`を再利用する。`generation_runs`のCHECK変更は不要である。
- `context_strategy = 'immediate_marker_questions'`、`strategy_version = '1'`でKeep-backed Runと区別する。
- 1 Runは`run_question_references`または`run_marker_references`のどちらか一方だけを持つ。
- Immediate Askは1件以上のMarker質問を持つ。
- `reference_no`は0始まりで、API配列順と一致させる。表示順・prompt組立順にも同じ順序を使う。
- 同じHighlightは1 Run内で1回だけ許可する。既存UIの「同じMarkerは置換」と整合する。
- source Highlightは予約時にresolvedで、最新completed Assistant Turnに属することを検証する。
- Run予約後は参照行とsnapshotを変更・削除できない。
- live Highlight / Turn / ConversationへのFKは持たない。予約時にtriggerで実体と照合し、以後はhistorical snapshotとして保持する。
- `run_id`だけは`generation_runs`へのFKを持つ。
- `request_snapshot`にも実際に送るMarker Context / 質問を含める。structured tableがあっても、モデルrequestの完全保存を省略しない。

APIは現在の単数`ImmediateAskDraft | null`へ合わせず、最初から配列を受ける。

```json
{
  "main_draft": "通常入力。空でもMarker質問が1件以上あれば送信可",
  "marker_questions": [
    {
      "highlight_id": "...",
      "question_text": "これはどういう意味ですか？"
    }
  ],
  "model": "...",
  "request_id": "..."
}
```

推奨endpointは通常Chatのoptional fieldsを増やすより、`POST /api/conversations/:conversationId/immediate-ask`として分ける。これにより通常Chat、Keep-backed ask、Immediate Askの入力検証を混在させない。Provider streaming、checkpoint、finish、cancelは既存`GenerationService`を再利用する。

Serverはlive Markerからsource情報を引き直し、clientから送られたID以外のsnapshot値を信用しない。配列順で参照行とモデル向け本文を組み立て、同一transactionで予約する。

## Proposed schema

以下は次Phase用の設計案であり、今回は適用していない。

```sql
CREATE TABLE run_marker_references (
  run_id TEXT NOT NULL REFERENCES generation_runs(run_id) ON DELETE RESTRICT,
  reference_no INTEGER NOT NULL CHECK(reference_no >= 0),
  source_conversation_id TEXT NOT NULL,
  source_turn_id TEXT NOT NULL,
  source_highlight_id TEXT NOT NULL,
  question_text TEXT NOT NULL
    CHECK(length(trim(question_text)) > 0 AND length(question_text) <= 10000),
  reference_snapshot TEXT NOT NULL
    CHECK(json_valid(reference_snapshot) AND json_type(reference_snapshot) = 'object'),
  PRIMARY KEY(run_id, reference_no),
  UNIQUE(run_id, source_highlight_id)
) STRICT;

CREATE INDEX marker_runs_source_highlight
  ON run_marker_references(source_highlight_id);

CREATE INDEX marker_runs_source_turn
  ON run_marker_references(source_conversation_id, source_turn_id);
```

`source_conversation_id`、`source_turn_id`、`source_highlight_id`をFKにしない。削除可能なlive objectへFKを張ると、Marker削除時にRun履歴も消すか、削除を拒否するかのどちらかになるためである。既存`run_question_references`と同じく、IDはhistorical identifierとして保存する。

`reference_snapshot` v1の最小形:

```json
{
  "snapshot_version": 1,
  "source_conversation_id": "...",
  "source_conversation_title": "...",
  "source_turn_id": "...",
  "source_turn_sequence_no": 7,
  "source_turn_role": "assistant",
  "source_highlight_id": "...",
  "start_offset": 10,
  "end_offset": 24,
  "source_text": "原文上の選択範囲",
  "target_text": "表示・質問対象の文字列",
  "color": "blue"
}
```

`question_text`は検索・表示用の列として保持する。完全なmodel-facing textは`generation_runs.request_snapshot`へ保存する。Marker memoはユーザーの作業メモであり、モデル送信や参照履歴に必要と判断した場合だけsnapshotへ追加し、既定では含めない。

必要なtrigger契約:

- INSERT時にRunが`preparing`、`kind='highlight_question'`、`context_strategy='immediate_marker_questions'`であること。
- RunのConversationと`source_conversation_id`が一致すること。
- live Highlightがresolvedで、source TurnがそのConversationの最新completed Assistant Turnであること。
- ID、offset、source / target textがsnapshotとlive Highlightに一致すること。
- `reference_no`が同Runの現在件数と一致し、0から連続すること。
- 同じRunが`run_question_references`に存在しないこと。
- UPDATE / DELETEを常に拒否すること。
- 既存`question_reference_validate`にも「同じRunが`run_marker_references`に存在しない」検証を加え、insert順にかかわらず相互排他を保証すること。

「Runに最低1件ある」は子table単体のCHECKでは保証できない。Repositoryの1 transaction内でRunと全参照を作成し、0件入力をAPIで拒否する。途中の参照INSERT失敗時はtransaction全体をrollbackする。

## Migration impact

推奨案では次の1 migrationを追加する想定である。

- `run_marker_references`、2 index、validation / immutable / retained triggerを追加。
- 既存`question_reference_validate`を、相互排他チェックを加えた等価triggerへ置換。
- 既存tableの再構築、既存行のcopy、backfillは行わない。
- `generation_runs.kind`のCHECKは変更しない。
- 既存migration checksumは変更せず、新しい連番migrationだけを追加する。

migration失敗は既存`migrate()`のtransactionで全rollbackされる。アプリケーション側をrollbackしても追加tableはDBに残るが、参照されなければ既存動作へ影響しない。現在のmigration方式はdown migrationを提供しないため、schema自体を戻す場合はbackup restoreまたは明示的な次migrationが必要である。

Option Aはtable再構築が必要なため、これよりrollbackリスクが高い。

## API impact

追加候補:

- `POST /api/conversations/:conversationId/immediate-ask`
- 任意のread-only Previewを設ける場合は`POST .../immediate-ask-preview`

send時の処理順:

1. `main_draft`と`marker_questions[]`を検証する。
2. exact Highlight IDで全Markerを再取得する。
3. 全Markerが同じConversationの最新completed Assistant Turnに属し、resolvedであることを確認する。
4. model-facing user text、`request_snapshot`、全reference snapshotを確定する。
5. 1 transactionでUser Turn、Assistant Turn、GenerationRun、N参照、`chat_requests`を予約する。
6. prepared event後は既存`GenerationService`で送信・checkpoint・完了保存する。

Question Keepは作成・変更しない。`startRun()`もImmediate AskではKeep lifecycle処理を行わない。

`main_draft`が空でMarker質問だけを送れるようにする場合、保存されるUser Turnの表面本文を実装前に固定する必要がある。推奨は、通常draftと各Marker質問を人間が読める決定的なplain textへ合成してUser Turnへ保存し、Run詳細ではstructured tableから参照カードを復元する方式である。内部IDやoffsetはUser向け本文へ混ぜない。

Run取得DTOは、既存の単数`keep_id / reference_snapshot`へ無理に詰めず、次の配列を追加する。

```ts
marker_references: Array<{
  reference_no: number;
  source_conversation_id: string;
  source_turn_id: string;
  source_highlight_id: string;
  question_text: string;
  reference_snapshot: MarkerReferenceSnapshot;
}>;
```

Keep-backed Runの既存fieldsと`run_question_references`読込は変更しない。

## Test impact

実装Phaseで最低限必要な検証:

- migration 007→新versionで既存Conversation / Turn / Run / Highlight / Keep / question referenceが完全保持される。
- 1 / 2 / 3件のMarker質問が`reference_no`順で保存・復元される。
- 同一Highlightの重複、ordinalの重複・欠番、会話外Marker、過去Assistant Turn、User Turn、unresolved Markerを拒否する。
- `run_question_references`と`run_marker_references`の同一Run併存を両insert順で拒否する。
- 2件目以降の参照INSERT失敗でUser Turn、Assistant Turn、Run、全参照、request IDがrollbackされる。
- PreviewだけではTurn / Run / referenceを作成しない。
- explicit send時だけ1 GenerationRunとN referenceを作る。
- Providerへ渡したrequestが`request_snapshot`と一致する。
- success / failure / cancel / interruptedで参照配列が不変のまま残る。
- Marker削除後もRun、質問、source snapshotを取得できる。
- Question Keepを作成せず、既存Keep lifecycleを変更しない。
- 既存Keep-backed same-chat / New Chat Handoff testsが変更なしで通る。
- 再起動後もreference順序とsnapshotを復元する。
- 通常Chatのpayloadと挙動を維持する。

既存の`listRuns()`は単数の`run_question_references`だけを読むため、新table読込後もKeep-backed fieldsを上書きしないDTO合成テストが必要になる。

## Risks

- **User Turnの表面表現**: 通常draftと複数Marker質問をどのplain textとして保存するかは、永続化実装前に決める必要がある。`request_snapshot`だけに質問を置くと通常Transcriptから質問が見えなくなる。
- **参照上限**: 無制限配列はrequestとComposerを肥大化させる。上限値はschemaへ埋め込まず、実装前にAPI/UI policyとして決める。
- **最新Turn判定の競合**: UI準備後に新しいAssistant Turnが完成する可能性があるため、送信予約transaction内で最新completed Assistant Turnを再検証する。
- **Marker削除競合**: client snapshotを信用せず、予約transaction内でlive Highlightを読み、参照行保存までを同じtransactionに含める。
- **二重の正本**: `request_snapshot`は送信内容、`run_marker_references`は参照構造の正本と役割を明記し、片方だけを更新する設計にしない。両方を同一transactionで確定する。
- **将来のcross-conversation利用**: v1はsame-chatかつ最新Assistant Turnだけに限定する。New Chat Handoffや過去Marker質問へ流用する場合はstrategy versionを上げ、既存v1の意味を変えない。
- **新tableの削除禁止**: 誤記録も後から編集できない。Run予約前のPreview/validationを厳密にし、修正は新Runとして記録する。
- **schema rollback**: additive migrationは実行コードのrollbackには強いが、現行基盤にdown migrationはない。適用前backupが必要である。

確認した主な実装:

- `src/server/storage/migrations/001_initial.sql`
- `src/server/storage/migrations/002_live_runs.sql`
- `src/server/storage/migrations/003_highlights.sql`
- `src/server/storage/migrations/004_question_keeps.sql`
- `src/server/storage/migrations/005_keep_runs.sql`
- `src/server/storage/migrations/006_branch_questions.sql`
- `src/server/storage/database.ts`
- `src/server/storage/repository.ts`
- `src/server/storage/question-keeps.ts`
- `src/server/http.ts`
- `src/shared/contracts.ts`
- `src/client/Chat.tsx`
- `src/client/MarkerDetailAdapter.tsx`
- `src/client/main.tsx`
- `tests/keep-runs.test.ts`
- `tests/branch-questions.test.ts`
- `tests/highlights.test.ts`
- `tests/normal-chat.test.ts`
