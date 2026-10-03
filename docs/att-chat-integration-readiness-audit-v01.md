# Att-Chat Integration Readiness Audit v0.1

調査日: 2026-10-02
調査対象: working tree（HEAD `17b8e7c`）

> この監査は現在のworking treeを対象にした。New Chat Handoff Production Connection v0.1は本番コード経路へ実装されているが、関連する既存ファイルは未コミット変更を含み、共通helper・専用test・説明文書は未追跡である。したがって「現在のworking treeでは接続済み」と「HEADから再現可能」は分けて扱う。

## Current production components

### Marker / Highlight

本番Markerの永続化契約は揃っている。

- 型の正本は `src/shared/contracts.ts` の `Highlight`。`highlight_id`, `turn_id`, `start_offset`, `end_offset`, `source_text`, `target_text`, `color`, `note`, `status`, `reason` を持つ。
- DBは `src/server/storage/migrations/003_highlights.sql`。Highlightはcompleted Assistant Turnにだけ作成でき、resolved Highlight同士の範囲重複を拒否する。
- `start_offset` / `end_offset` はJavaScript文字列、すなわちUTF-16 code unit offset。`source_text` はTurn原文の厳密なslice、`target_text` は画面上で選択された表示文字列である。anchorを構成するTurn・offset・source/target textは作成後に変更できない。
- client側の `src/client/marker.ts` は、同じcompleted Assistant Turn・同じMarkdown block内だけを選択対象にし、`Intl.Segmenter(..., { granularity: 'grapheme' })` でgrapheme境界も検証する。
- Markdown表示と原文offsetの対応は `src/client/TurnMarkdown.tsx` が担う。コードブロック・表・原文へ一意に戻せない表示は選択対象外である。
- APIは `POST/GET /api/conversations/:conversationId/highlights`、`PATCH/DELETE /api/conversations/:conversationId/highlights/:highlightId`。Repository実装は `src/server/storage/repository.ts` の `createHighlight`, `listHighlights`, `updateHighlight`, `deleteHighlight`。
- update対象は色とメモ。原文不一致を検出したHighlightは位置を動かさず`unresolved`にする。自動re-anchorはしない。
- 本番UIは `src/client/MarkerCore.tsx`。選択、作成、編集、削除、一覧、jump/pulse、色filter、miniMAPを実装済み。ただし既設Marker本文のクリックは`beginEdit`を呼ぶ編集導線であり、LaboratoryのSignal / Marker Detail popupは本番にはない。
- Marker削除はDBの `question_keeps.highlight_id ... ON DELETE CASCADE` により、そのMarkerに属するQuestion Keepを同時削除する。すでに作成された`run_question_references`は履歴保持のためFKを持たず、DELETE triggerで削除も禁止されているため残る。

### Deferred Ask / Question Keep

Question Keepの永続化・API・会話内UIは本番に存在する。

- 型は `src/shared/question-keep.ts`。状態は`pending | asked | dismissed`。
- DBは `src/server/storage/migrations/004_question_keeps.sql`。`keep_id`, `highlight_id`, `question_draft`, `memo`, `status`, `created_at`, `updated_at`, `asked_at`を持つ。
- `highlight_id`にUNIQUE制約はない。したがって同一Markerへ複数Keepを作成できる。
- 新規Keepはresolved Highlightに対して`pending`でのみ作成可能。`asked`は送信開始後の不変状態で、`asked_at`を必須とする。
- Repositoryは `src/server/storage/question-keeps.ts`。会話単位のlist/create/update/deleteを提供する。Marker削除時はKeepがcascade削除される。Keep単独削除では、既存Run referenceは保持される。
- APIは `GET/POST /api/conversations/:conversationId/question-keeps` と `PATCH/DELETE .../:keepId`。
- 本番UIは `src/client/QuestionKeeps.tsx`。Markerの「追加操作 → 質問キープ」からdraft/memoを保存し、pending/dismissed/askedの表示・編集・削除・同じチャットでの質問を行える。
- 同じチャットで質問すると、Keepの引用と確定質問だけを`system + user`で送り、通常会話履歴は含めない。送信開始時にpending Keepをaskedへ移す。

### GenerationRun / reference tracking

- `generation_runs`は `src/server/storage/migrations/001_initial.sql` と`002_live_runs.sql`。`kind`, `context_strategy`, `strategy_version`, `request_snapshot`, outcome、User/Assistant Turn参照を持つ。
- `request_snapshot`, `context_strategy`, `strategy_version`はRun作成後に変更できない。したがってContext選択はRun予約前に確定する必要がある。
- `run_question_references`は `005_keep_runs.sql`。1 Runにつき1行（`run_id`が主キー）で、`keep_id`, source Highlight/Turn, user question, immutable JSON snapshotを保持する。
- `006_branch_questions.sql`により、strategy version 1は同一Conversation、version 2はsource snapshotを検証した別Conversationを許可する。
- Keep/Highlight削除後もRunの出典snapshotを残す設計になっている。

### Normal Chat send path

実際の本番送信経路は次の通り。

1. `src/client/Chat.tsx` の`send()`が通常送信では `POST /api/conversations/:id/chat` を呼ぶ。
2. `src/server/http.ts` がpayloadを検証し、`Repository.prepareChat(...)`を呼ぶ。
3. `prepareChat`がtransaction内で、completed User Turn、generating Assistant Turn、preparing GenerationRun、idempotency用`chat_requests`を保存する。
4. 通常Chatは同じConversationのcompleted Turnsをrole/contentのmessage履歴へ変換し、最後に新しいUser本文を追加する。
5. HTTP層が`prepared`をstreamし、`GenerationService.execute()`へRunを渡す。
6. `src/server/generation.ts` が`startRun`、`LMStudioProvider.generate`、途中checkpoint、`finishRun`を行う。
7. 成功時はAssistant Turnがcompleted、Runがsucceeded。失敗・cancel・process interruptionもTurnとRunへ保存し、自動retryしない。

Immediate Ask / Deferred Askを接続する最小の差し込み位置は、UIでは`MarkedTurns` / `Chat`間の明示的な質問state、serverでは`prepareChat`へ渡す前のrequest/context組立層である。LM Studio providerやstream保存処理を作り直す必要はない。

## Laboratory-only components

### Immediate Ask composer

`src/laboratory/MarkerQuickActionPrototype.tsx`にだけ存在する。

- Marker Detailの「今すぐ質問 / 後で質問」、可視prefix（質問・しかし…・意見）、短い質問inputを持つ。
- `mainDraft`とMarker由来の`immediateQuestions`を別stateで保持する。
- `immediateQuestions`は配列なので複数Marker質問を同時に載せられる。同じMarkerは置換する。
- 確定時に通常入力欄相当へ表示するが、API送信、GenerationRun、DB保存には接続していない。
- 「今すぐ質問可能か」の判定はfixture上のT25に結び付いた`canAsk`であり、本番の「最新completed Assistant Turn」判定ではない。

本番`Chat.tsx`は通常本文`input`と単一の`question`（Question Keep）を持つだけで、main draftと複数Marker由来質問を独立保持する構造はない。

最新completed Assistant Turnは、本番clientなら`ConversationDetail.turns`から`role === 'assistant' && status === 'completed'`の最大`sequence_no`を選べる。serverでも`Repository.listTurns(conversationId)`から同じ判定ができる。ただし現在はこのpolicyを共有する専用helper/APIがない。

### Question Box

全Conversation横断の質問箱は `src/laboratory/QuestionBoxSidebar.tsx` とMarker Quick Action fixtureにだけ存在する。

| 機能 | 本番 | Laboratory |
|---|---|---|
| Chat / 質問箱タブ | なし | あり |
| KeepがあるConversationだけgroup化 | なし | あり |
| group / Keepの新着順、折りたたみ | なし | あり |
| 元Conversation / Turn / Markerへ戻る | なし | exact ID/anchorでjumpしpulse |
| unresolved | sendを禁止しKeep表示は維持 | Turnへfallbackし「Marker位置を確認できません」 |
| `… → 質問する` | Question Keep内の「このチャットで聞く」は本番実装済み。ただしQuestion Boxのellipsis経路はない | 未実装noticeのみ |
| `… → 新規チャット` | 現在のworking treeではQuestion Keep UIから本番接続済み | Setup / memory-only実験あり |

本番APIのQuestion Keep一覧はConversation単位であり、全Conversation横断read model/APIはない。本番左SidebarもConversation一覧のみである。

### Context Correction experiments

- `src/mode-b-poc/context-builder.ts`はpure/read-onlyなPoC。quote onlyとsame-Turn local window（300/600/1000 UTF-16、5:5/6:4/7:3）を構築する。
- `src/context-preview/service.ts`は本番serverで利用可能なread-only Preview service。same-Turn local windowに加え、前後0〜3 completed Turnsを組み合わせたA/A+B Previewを作る。
- `src/retrieval/repository.ts` / `src/retrieval/service.ts`は同じConversationのcompleted Turnsを前後0〜10件取得できる。順序、Conversation境界、未完了Turn拒否を実装済み。
- HTTPにはHighlight Context PreviewとTurn Retrievalのread-only endpointがある。
- Context Correction v0.1〜v0.5のfixture、実験runner、結果・Human ReviewはLaboratory配下。Question Boxの「質問する」や通常Chat sendへは接続されていない。

`007_semantic_index.sql`にはEmbedding保存用schemaが存在するが、今回確認したContext Correction経路はlocal window / Turn windowであり、Semantic SearchやRAGを前提にしていない。

## Already connected

### New Chat Handoff Production Connection v0.1

現在のworking treeでは、Question KeepからのNew Chat Handoffが本番Conversation作成経路まで接続済みである。これは再実装対象にしない。

- setup: `QuestionKeeps.tsx` の`… → 新規チャット`から`Chat.tsx`のhandoff UIへ渡す。
- level: `none / minimal / standard / wide`。前0/1/3/5 completed Turns + Target。未来Turnは含めない。
- preview: `POST .../question-keeps/:keepId/handoff-preview`。`Repository.previewNewChatHandoff`は書込みを行わない。
- builder: `src/shared/production-new-chat-handoff.ts`。Turn順序とroleを保ち、最初のUser Message内部へ参考文脈、質問対象、質問を組み立てる。
- Conversation作成: `handoff-new`の明示送信時だけ新規Conversationを作る。
- Turn保存: formatted first user messageをcompleted User Turn、回答先をgenerating Assistant Turnとして保存する。
- model request: 旧Conversationをmessage履歴として再構築せず、`system + user`の2 messagesだけを送る。
- Assistant保存: 既存`GenerationService`が成功・失敗を通常Turn/Runへ保存する。
- GenerationRun: kind=`highlight_question`, context_strategy=`turn_based_handoff`, strategy_version=`2`。
- reference snapshot: source Conversation/Turn/Highlight、offset、source/target text、handoff level、included Turn IDsを保持する。
- Keep: handoff送信ではpending→askedへ変更せず、元Keepを維持する。
- error: Conversation作成後のprovider失敗でもConversationとUser Turnを削除せず、Assistant Turnをfailed、Runをfailedとして残す。
- test: `tests/production-new-chat-handoff.test.ts`にPreview非書込み、level/clamp、2-message request、Keep不変、成功保存、失敗保持、HTTP経路の検証がある。

ただし、`src/shared/production-new-chat-handoff.ts`, `tests/production-new-chat-handoff.test.ts`, `docs/new-chat-handoff-production-v01.md`は未追跡で、既存production filesも未コミット変更である。HEAD `17b8e7c`だけではこの接続状態を再現できない。

### Same-chat Question Keep ask

既存Question Keepの「このチャットで聞く」はすでに本番接続済みである。`/question-keeps/:keepId/ask`から、引用+質問を`system + user`で送信し、GenerationRunと`run_question_references`を保存する。Context strategyは`quote_question_only`である。

## Missing adapters

### 1. Marker Detail action surface

Marker persistenceを変更せず、LaboratoryのDetail / Immediate / Deferred操作を本番compositionへ載せる薄いUI adapterが必要。`MarkerCore`には`renderEditorExtras`, `renderMarkerActions`, `renderListExtras`という差し込み口があるため、MarkerCore本体の再実装は不要である。

### 2. Immediate Ask composer adapter

次が必要。

- `mainDraft`とMarker質問群を分離する本番client state。
- Marker referenceの追加・置換・解除と、複数Marker表示。
- 最新completed Assistant TurnだけImmediate Askを許可する共有policy。
- 通常Chatの最終requestへMarker質問を明示的に合成するrequest builder。
- 自動送信せず、送信前にユーザーが編集できる境界。

### 3. Global Question Box read model

本番Question KeepはConversation単位でしか読めない。Question Boxには次が必要。

- Keep + Highlight + source Turn + Conversation titleを返す全Conversation横断read query/API、または同等のserver-side adapter。
- 左SidebarのChat / 質問箱切替、Conversation grouping、件数・新着順・折りたたみ。
- exact conversation/turn/highlight IDを用いたreturn-to-source controller。
- unresolved時のTurn fallback。文字列一致による別Markerへの自動移動は禁止する。

DB schema追加は必須ではない。既存4 tableのjoinでread modelを作れる。

### 4. Context Correction send adapter

Preview/retrievalを、Keep-backed sendのrequest作成へ接続するadapterが必要。

- Context parametersをRun作成前に確定する。
- builder出力と実際の`request_snapshot.messages`を同一にする。
- included Turn IDs、local range、strategy parametersを`reference_snapshot`へ保存する。
- `context_strategy` / `strategy_version`を固定し、Run作成後に変更しない。

同じConversationのQuestion Keepからの質問なら、既存KeepとHighlightを利用できるためDB migrationなしで接続可能である。`reference_snapshot` JSONは拡張可能だが、`src/shared/contracts.ts`の型拡張とserver validationは必要になる。

### 5. Question Box action adapter

- `質問する`: 本番の既存same-chat askをQuestion Boxの選択Keepへ接続するだけなら薄いrouting adapterで足りる。Context Correctionを使う場合は上記adapterも必要。
- `新規チャット`: 現在のworking treeのProduction Handoff setup/sendをQuestion Box項目へ開くrouting adapterだけが必要。Conversation作成・Run保存処理は再利用する。

## Schema / API blockers

### Keepを作らないImmediate Askの参照保存

最大のblockerである。

- `run_question_references.keep_id`は`NOT NULL`。
- insert validation triggerは実在するQuestion Keepをjoinし、そのKeepとsource Highlight/Turnの一致を必須にする。
- 1 Run 1行で`run_id`が主キーなので、1 Runへ複数Marker referenceを正規化して保存できない。

GenerationRunの`request_snapshot`は任意JSONなので、技術的にはMarker参照をそこへ埋め、`run_question_references`を作らずRunを保存することはできる。しかし、その場合は次を失う。

- `listQuestionRuns`からの取得。
- DB triggerによるHighlight/Turn/Keep整合性検証。
- 現行のstructured reference contract。
- 複数参照の検索・追跡可能性。

したがって、Immediate Askで「Keepなしだが永続的で検証可能なRun reference」が必須なら、先に設計判断が必要である。選択肢は、nullable Keepを許すよう現table/triggerを拡張する、Run対Markerの別child tableを作る、またはrequest snapshotだけを正式契約として受け入れる、のいずれか。後者はmigration不要だが参照品質を下げる。

### Multiple Marker questions

Lab composerは複数Markerを保持できるが、現行`run_question_references`は1 Run 1 referenceである。複数Markerを1 requestに含め、各Markerを構造化して追跡したい場合はschema/API設計判断が必要。単にrequest JSONへ配列を入れるだけなら可能だが、現行triggerは検証しない。

### Question Box global list

API不足はあるがschema blockerではない。既存Conversation/Turn/Highlight/Question Keepをjoinすればよい。

### Context Correction for Keep-backed asks

schema blockerはない。strategy/versionとsnapshotをRun作成前に固定する必要がある。既存version 1 triggerはsourceとdestinationが同じConversationであることを要求し、Question Boxから同じチャットで聞く場合に合致する。

### Keep lifecycle

same-chat askは送信開始でpending Keepをaskedにし、asked Keepは不変。New Chat HandoffはKeepを変更しない。この差は現行仕様どおりだが、Question Box統合時に「質問済み」の表示意味を混同しない必要がある。

## Reusable code

| 再利用対象 | 用途 | 注意 |
|---|---|---|
| `MarkerCore` + render slots | 本番Markerと追加操作のcomposition | Lab SignalをMarkerCore内部へ直書きしない |
| `marker.ts` / `TurnMarkdown.tsx` | UTF-16 anchor、grapheme、Markdown原文対応 | code/table/複数blockは対象外 |
| `QuestionKeepRepository` + API | Deferred Ask保存 | 全体一覧にはcross-conversation queryが別途必要 |
| `Repository.prepareChat` + `GenerationService` | User/Assistant/Runのtransactionとmodel stream | contextはRun作成前に確定する |
| `run_question_references` version 1 | Keep-backed same-chat質問 | Keepなし・複数Markerには使えない |
| `run_question_references` version 2 | Keep-backed New Chat Handoff | source snapshot一致が必須 |
| `mode-b-poc/buildContext` | same-Turn local windowの純粋builder | PoC versionをそのまま本番strategy名にしない |
| `ContextPreviewService` | local + temporal Contextのread-only検証 | Previewでありsendではない |
| `RetrievalService` | completed Turnの前後取得 | before/after最大10、同一Conversation限定 |
| `buildProductionHandoffMessage` | 本番New ChatのTurn-based first message | current working treeで未追跡 |
| Question Box Lab fixture | grouping / return UXの仕様参照 | production schemaとして流用しない |

## Components that should NOT be rebuilt

- Highlight schema、anchor validation、Marker CRUD、Marker rendering/jump/pulse。
- Question Keep schema、CRUD、same-chat quote-only send、Keep/Highlight削除契約。
- Conversation/Turn/GenerationRun作成transaction、stream、checkpoint、error/cancel/interrupted保存。
- LM Studio provider。
- Turn RetrievalとContext Previewのread-only基盤。
- 現在のworking treeで完成しているNew Chat HandoffのPreview、level builder、Conversation作成、2-message request、Run/reference保存、Keep不変、error保持。

統合Phaseではこれらを置き換えず、UI/read model/request builderのadapterを追加する方が変更範囲を小さくできる。

## Minimum integration path

1. **基準状態を固定する**: 現working treeのNew Chat Handoff本番接続と関連helper/test/docを、他のLab大量差分と区別できる状態にする。今回の監査ではcommitしない。
2. **Question Box read adapterを作る**: cross-conversation Keep query/APIと左Sidebar表示を追加する。schemaは変更しない。
3. **return-to-sourceを接続する**: conversationを開き、source Turnを表示し、exact Highlight ID/anchorがresolvedならpulse、そうでなければTurn fallback。
4. **既存actionを配線する**: Deferred Askは既存Question Keep CRUD、New Chatは既存Production Handoff、same-chat質問は既存quote-only askを利用する。
5. **Context Correctionを一つの明示strategyとして接続する**: Previewとsendのbuilderを共通化し、Keep-backed same-chat Runへsnapshotを保存する。自動selectionは行わない。
6. **Immediate AskのUI/stateを接続する**: latest completed Assistant policy、main draftとの分離、reference解除を実装する。
7. **Immediate Askの永続参照方針を決める**: Keepを作るか、schemaを拡張するか、request snapshotだけを正式契約にするかを決めてからRun接続する。
8. **複数Markerを送る場合だけ追加判断する**: 1 Run 1 referenceを維持するか、1:N reference schemaにするかを先に決める。

この順序なら、すでに動いているMarker / Keep / Run / Handoffを再構築せず、未接続部分だけを段階的に確認できる。

## Risks

- **working treeとHEADの差**: New Chat Handoff本番接続は現working treeにはあるがHEADから再現できない。次Phase開始前に基準点を誤認すると再実装や欠落が起きる。
- **Lab stateを本番契約と誤認**: `LabQuestionKeep`, fixtureのT番号、`canAsk(T25)`は本番の型・policyではない。
- **source_text / target_text混同**: anchor検証は`source_text`、画面表示は`target_text`。モデルへどちらを渡すかは既存flow間でも異なるため明示する必要がある。
- **Run作成後のContext変更不可**: request snapshotとstrategy identityはimmutable。Previewとsendの間で入力が変わったら再Preview/再buildが必要。
- **askedの意味**: same-chat send開始を示す。New Chat利用やQuestion Box閲覧をaskedへ読み替えない。
- **削除後の表示**: Marker/Keepは削除できるがRun referenceは履歴として残る。UIはlive entityとsnapshotを区別する必要がある。
- **複数参照**: Labの複数Marker composerをそのまま送ると、現DBの1 Run 1 reference契約と衝突する。
- **unresolved**: 自動re-anchorしない。Question Box returnはTurn fallback、sendは拒否、という操作差を維持する必要がある。
- **`prepareChat`の分岐増加**: 現在もnormal / same-chat Keep / old ask-new / turn-based handoffをboolean引数で分岐する。さらにImmediate AskやContext Correctionを直接足すと条件組合せが増える。既存処理を壊さず、型付きの準備入力または薄いrequest builderで入口を整理する方が安全。
- **Semantic schemaの早期流用**: Embedding schemaが存在しても、今回の統合にRAGは不要。Context Correction実験の結論を自動retrieval実装へ読み替えない。

## Recommended implementation order

| 順序 | 部品 | 理由 |
|---:|---|---|
| 1 | 現New Chat Handoffの基準化 | すでに本番接続済みの処理を再実装しないため |
| 2 | Global Question Box read/UI | 既存Keepを見つける入口。schema変更なしで独立実装できる |
| 3 | return-to-source | 送信機能から独立し、exact ID/unresolved契約を先に確認できる |
| 4 | Deferred Ask / existing actions配線 | 既存CRUDとsendを再利用できる |
| 5 | Keep-backed Context Correction | 現schemaで可能。Preview/send一致を先に固める |
| 6 | Immediate Ask UI/composer | Labで検証済みのstate分離を本番へ移す |
| 7 | Keep-less / multiple reference設計 | DB契約判断を伴うため、UIとは分ける |
| 8 | 統合回帰 | Marker削除、Keep lifecycle、Run failure、unresolved、New Chatを横断確認する |

## Readiness classification

分類:

- **A**: そのまま再利用できる
- **B**: 薄いAdapterで接続できる
- **C**: 本番実装が必要
- **D**: schema/API制約のため先に設計判断が必要

| 対象 | 分類 | 結論 |
|---|---|---|
| Marker | **A** | persistence、anchor、API、UI、jump、delete契約まで本番実装済み。Lab Signal / Detailだけは別のUI adapter対象。 |
| Immediate Ask | **D** | UI/composerはLabのみ。Keepなしのstructured Run referenceと複数Marker参照が現schemaに合わない。UI自体はB相当だが、永続参照を含む全体は先に契約判断が必要。 |
| Deferred Ask | **A** | Question Keep CRUDとMarkerからの保存は本番済み。Lab Detail内の「後で質問」と同じ見た目にする場合だけB。 |
| Question Box | **C** | cross-conversation read model/API、左Sidebar、grouping、return-to-sourceが本番にない。既存Keep/Handoffを再利用できるため基盤の作り直しは不要。 |
| Context Correction | **B** | local/Turn windowとPreview/Retrievalが存在する。Keep-backed sendへrequest/snapshotを接続するadapterが必要。自動strategy選択は未決定のままにする。 |
| New Chat Handoff | **A** | 現working treeではProduction Connection v0.1が完成。再実装しない。ただし未コミット/未追跡資産を基準化する必要がある。 |
| GenerationRun / reference tracking | **A / D** | 単一Keep-backed same/new chatはA。KeepなしImmediate Askまたは1 Run複数MarkerはD。 |

## Files inspected

### Contracts and schema

- `src/shared/contracts.ts`
- `src/shared/question-keep.ts`
- `src/shared/production-new-chat-handoff.ts`
- `src/server/storage/migrations/001_initial.sql`
- `src/server/storage/migrations/002_live_runs.sql`
- `src/server/storage/migrations/003_highlights.sql`
- `src/server/storage/migrations/004_question_keeps.sql`
- `src/server/storage/migrations/005_keep_runs.sql`
- `src/server/storage/migrations/006_branch_questions.sql`
- `src/server/storage/migrations/007_semantic_index.sql`
- `src/server/storage/database.ts`

### Production client / server

- `src/client/main.tsx`
- `src/client/Chat.tsx`
- `src/client/MarkerCore.tsx`
- `src/client/MarkedTurns.tsx`
- `src/client/QuestionKeeps.tsx`
- `src/client/marker.ts`
- `src/client/TurnMarkdown.tsx`
- `src/server/http.ts`
- `src/server/generation.ts`
- `src/server/provider.ts`
- `src/server/storage/repository.ts`
- `src/server/storage/question-keeps.ts`

### Context / retrieval

- `src/mode-b-poc/context-builder.ts`
- `src/context-preview/service.ts`
- `src/retrieval/repository.ts`
- `src/retrieval/service.ts`

### Laboratory and records

- `src/laboratory/MarkerQuickActionPrototype.tsx`
- `src/laboratory/QuestionBoxSidebar.tsx`
- `src/laboratory/NewChatHandoffSetup.tsx`
- `src/laboratory/new-chat-handoff.ts`
- `docs/laboratory/marker-quick-action-prototype.md`
- `docs/laboratory/context-correction-v01-report.md`
- `docs/laboratory/context-correction-v02-report.md`
- `docs/laboratory/context-correction-v03-report.md`
- `docs/laboratory/new-chat-handoff-v02-report.md`
- `docs/laboratory/new-chat-handoff-turn-v03-report.md`
- `docs/laboratory/new-chat-handoff-natural-v04-report.md`
- `docs/laboratory/new-chat-handoff-reasoning-v05-report.md`
- `docs/new-chat-handoff-production-v01.md`

### Tests read as contract evidence

- `tests/highlights.test.ts`
- `tests/question-keeps.test.ts`
- `tests/keep-runs.test.ts`
- `tests/branch-questions.test.ts`
- `tests/mode-b-context.test.ts`
- `tests/context-preview.test.ts`
- `tests/retrieval.test.ts`
- `tests/production-new-chat-handoff.test.ts`

No source, UI, schema, migration, or test files were changed by this audit. No model run was performed.
