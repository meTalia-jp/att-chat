# Att-Chat Production Integration v0.1 Pre-Commit Audit

監査日: 2026-10-03
監査基準HEAD: `17b8e7c feat: establish reproducible laboratory baseline`

## Current working tree

監査文書作成前の `git status --short -uall` は、tracked modified 30件、untracked 168件、合計198件だった。staged fileは0件で、`git diff --cached --name-status` は空だった。本書を加えた後はuntrackedが1件増え、合計199件となる。

tracked差分は30 files / 1,327 insertions / 133 deletions。Production Integration Phase 1〜6.1の変更と、それ以前から継続しているLaboratory実験差分が同じworking treeに混在している。したがって `git add -A`、`git add .`、ディレクトリ単位の一括stageは安全ではない。

分類結果は次のとおり。件数は本書を含む現在の差分199件を対象とする。

| Classification | Count | Meaning |
|---|---:|---|
| A | 38 | Production Integration v0.1 commitへ含める |
| B | 3 | 含めてもよいが必須ではない |
| C | 154 | 今回は除外 |
| D | 4 | hunk分離または人間判断が必要 |

`.gitignore` は `node_modules/`、`dist/`、`.cache/`、`.vite/`、`coverage/`、`data/`、`*.db`、`*.sqlite*`、ログ、一時ファイル、`public/dictionaries/ejdict-hand/ejdict.json` を除外している。`git check-ignore` でも `.cache/phase6-e2e.sqlite`、`dist/index.html`、`node_modules`、`data/local.sqlite`、辞書本体が除外対象であることを確認した。これらは `git status` に現れておらず、commit候補ではない。

## Commit candidate files

### A. Production Integration v0.1 commitへ含める

#### Production UI / client / shared / server — 19 files

| File | Reason |
|---|---|
| `src/client/Chat.tsx` | same-chat Context、New Chat Handoff、Immediate Ask送信とPreview lifecycleの本番UI |
| `src/client/MarkedTurns.tsx` | 本文Markerとproduction adapterの接続 |
| `src/client/MarkerCore.tsx` | exact Marker表示・jump/pulse接続に必要な既存core拡張 |
| `src/client/QuestionKeeps.tsx` | Keep-backed actionとの本番接続 |
| `src/client/main.tsx` | Global Question Box、Marker Detail、Composer stateの本番composition |
| `src/client/normal-chat.css` | Frozen Referenceに沿う本番Question Box、Detail、Composer、Preview表示 |
| `src/client/GlobalQuestionBox.tsx` | Conversation横断Question Box本体 |
| `src/client/MarkerDetailAdapter.tsx` | 本文MarkerからDeferred / Immediate Askへ接続する薄いadapter |
| `src/context-preview/service.ts` | Keep Context Previewの本番生成 |
| `src/server/http.ts` | Question Box、Keep Context、Handoff、Immediate Ask endpoint |
| `src/server/storage/database.ts` | migration 008の登録とDB初期化 |
| `src/server/storage/question-keeps.ts` | Global read modelとKeep lifecycleの本番repository処理 |
| `src/server/storage/repository.ts` | Handoff / Context / Immediate Askのtransactionとreference保存 |
| `src/server/storage/migrations/008_immediate_ask_references.sql` | `run_marker_references`を追加する新規migration |
| `src/shared/contracts.ts` | client/server間の追加DTOとsnapshot contract |
| `src/shared/question-keep.ts` | Question Box / Keep actionの共有contract |
| `src/shared/production-immediate-ask.ts` | Immediate Askの入力検証・表示本文builder |
| `src/shared/production-keep-context.ts` | Keep Context levelとmessage builder |
| `src/shared/production-new-chat-handoff.ts` | New Chat Handoff levelとfirst-message builder |

#### Production integration tests — 13 files

| File | Reason |
|---|---|
| `tests/branch-questions.test.ts` | New Chat分岐、snapshot、transaction、失敗保持の回帰 |
| `tests/keep-runs.test.ts` | Keep-backed Run/reference lifecycleの回帰 |
| `tests/marker-core.test.ts` | Marker rendering / exact anchor / jumpの回帰 |
| `tests/normal-chat.test.ts` | 本番compositionとLab非依存の確認 |
| `tests/question-keeps.test.ts` | Keep CRUD、asked、Marker削除契約の回帰 |
| `tests/restart.test.ts` | 追加referenceを含むrestart / durable state回帰 |
| `tests/semantic-index.test.ts` | migration 008適用後も既存index処理が維持されることを確認 |
| `tests/storage.test.ts` | migration、DB制約、保存contractの回帰 |
| `tests/global-question-box.test.ts` | Conversation横断read model、group、exact return-to-source |
| `tests/immediate-ask.test.ts` | 1:N Marker reference、上限、排他、rollback、snapshot |
| `tests/production-keep-context-ui.test.ts` | Context Preview、明示送信、成功後clear、`target_text`表示 |
| `tests/production-keep-context.test.ts` | 少/標準/多、前方Turn、request/reference snapshot |
| `tests/production-new-chat-handoff.test.ts` | Preview、明示作成、Keep不変、分岐先保存 |

#### Documentation — 6 files

| File | Reason |
|---|---|
| `docs/att-chat-integration-readiness-audit-v01.md` | 本番接続前の部品・制約・再利用判断の根拠 |
| `docs/new-chat-handoff-production-v01.md` | Production Handoff contractと実装結果 |
| `docs/immediate-ask-persistence-design-v01.md` | migration 008 / Option B採用理由 |
| `docs/att-chat-full-integration-v01.md` | Phase 6のA〜F横断確認とDB整合性 |
| `docs/att-chat-production-integration-v01-cleanup.md` | Phase 6.1のPreview clear / `target_text`修正記録 |
| `docs/att-chat-production-integration-v01-precommit-audit.md` | 本監査とcommit境界の正本 |

## Optional files

### B. 含めてもよいが必須ではない — 3 files

| File | Reason |
|---|---|
| `docs/laboratory/att-chat-integrated-dummy-v01.md` | Frozen Visual Reference。設計背景として有用だがproduction runtimeには不要 |
| `src/laboratory/AttChatIntegratedDummy.tsx` | Frozen DummyのLab画面。productionからimportされていない |
| `src/laboratory/att-chat-integrated-dummy.css` | Frozen Dummy専用style。productionからimportされていない |

この3件をcommitする場合、Catalogから実際に開ける状態まで含めるには後述Dのregistration hunkが必要になる。今回の推奨commit setは、Production境界を明確にするためBを含めない。

## Excluded files

### C. 今回は除外 — 154 files

以下のpath表記は、その配下で現在 `git status --short -uall` に列挙された全ファイルを表す。各項目は今回のProduction runtimeからimportされておらず、独立したExperiment、実モデルRun記録、fixture、または別判断の文書である。

| File / group | Reason |
|---|---|
| `docs/core-status-and-next-phase.md` | Production Integration v0.1とは別の全体状況文書 |
| `docs/laboratory/marker-quick-action-prototype.md` | Phase以前から継続するQuick Action Experiment記録 |
| `src/laboratory/MarkerQuickActionPrototype.tsx` | Quick Action Experiment本体 |
| `src/laboratory/marker-quick-action.css` | Quick Action Experiment専用style |
| `src/laboratory/server.ts` | Laboratory runtime変更。production serverではない |
| `tests/marker-quick-action.test.ts` | Laboratory Quick Action専用test |
| `docs/laboratory/context-correction-v01-data/*` と `context-correction-v01-report.md` | v0.1実験Run / report |
| `docs/laboratory/context-correction-v02-data/*` と `context-correction-v02-report.md` | v0.2実験Run / report |
| `docs/laboratory/context-correction-v03-data/*` と `context-correction-v03-report.md` | v0.3実験Run / report |
| `docs/laboratory/new-chat-handoff-v02-data/*` と `new-chat-handoff-v02-report.md` | Lab実モデルRun |
| `docs/laboratory/new-chat-handoff-turn-v03-data/*` と `new-chat-handoff-turn-v03-report.md` | Turn-based Lab実験 |
| `docs/laboratory/new-chat-handoff-natural-v04-data/*` と `new-chat-handoff-natural-v04-report.md` | natural conversation Lab実験 |
| `docs/laboratory/new-chat-handoff-reasoning-v05-data/*` と `new-chat-handoff-reasoning-v05-report.md` | reasoning continuity Lab実験 |
| `docs/laboratory/retrieval-chunking-observations.txt` | RAG/chunkingの別実験観察 |
| `docs/laboratory/retrieval-chunking-output.txt` | RAG/chunkingの生成出力 |
| `docs/laboratory/turn-minimap-important.md` | Turn miniMAP Experiment記録 |
| `src/laboratory/CollapsibleTools.tsx` | Right Sidebar Experiment-local component |
| `src/laboratory/NewChatHandoffSetup.tsx` | Lab Handoff setup fixture |
| `src/laboratory/QuestionBoxSidebar.tsx` | Lab Question Box prototype |
| `src/laboratory/TurnMapPrototype.tsx` | Turn miniMAP prototype |
| `src/laboratory/collapsible-tools.css` | Lab Sidebar専用style |
| `src/laboratory/context-correction/*` | Context Correction Experiment implementation / fixtures / reports |
| `src/laboratory/new-chat-handoff*.ts` | v0.2〜v0.5 Lab Experiment / runner / fixture |
| `src/laboratory/retrieval-chunking/*` | Retrieval chunking Experiment |
| `src/laboratory/turn-map-fixture.ts` | Turn miniMAP fixture |
| `src/laboratory/turn-map-position.ts` | Turn miniMAP position helper |
| `src/laboratory/turn-map.css` | Turn miniMAP style |
| `tests/context-correction*.test.ts` | Context Correction Lab tests |
| `tests/new-chat-handoff.test.ts` | Lab Handoff prototype test。production版とは別 |
| `tests/new-chat-handoff-turn.test.ts` | Turn-based Lab test |
| `tests/new-chat-handoff-natural.test.ts` | Natural Conversation Lab test |
| `tests/new-chat-handoff-reasoning.test.ts` | Reasoning Continuity Lab test |
| `tests/retrieval-chunking.test.ts` | Retrieval chunking Lab test |
| `tests/turn-map.test.ts` | Turn miniMAP Lab test |

生成物・local資産はGit差分へ出ていないが、明示的に除外する。

- `.cache/` と配下の隔離SQLite DB、一時checkout、UI test build
- `dist/`、`.vite/`、`coverage/`
- `node_modules/`
- `data/`、`*.db`、`*.sqlite*`
- logs、screenshots、一時ファイル
- `public/dictionaries/ejdict-hand/ejdict.json`（External Data Asset）

## Ambiguous files

### D. 判断が必要 — 4 files

| File | Reason |
|---|---|
| `src/laboratory/Laboratory.tsx` | Frozen Dummy登録を含む一方、多数の別Experiment登録も混在。whole-file stageは不適切 |
| `src/laboratory/catalog.ts` | Frozen ReferenceのCatalog entryと他の未基準Experiment entryが混在 |
| `tests/laboratory.test.ts` | Frozen Dummy参照確認と多数の別Lab asset検証が混在 |
| `tests/laboratory-ui.test.ts` | Lab UI全体の複数Phase変更が混在 |

これらは今回のProduction commitへwhole-fileで含めない。Frozen Dummyを同じcommitへ入れる判断をする場合に限り、関連hunkと依存Lab assetを別途監査してstageする。推奨はB/Dを別のLab reference commitへ分離すること。

## Migration check

migrationは `001` から `008` まで連番で存在する。

| Migration | Working tree vs HEAD |
|---|---|
| `001_initial.sql` | blob一致、変更なし |
| `002_marker_core.sql` | blob一致、変更なし |
| `003_generation_runs.sql` | blob一致、変更なし |
| `004_question_keeps.sql` | blob一致、変更なし |
| `005_semantic_index.sql` | blob一致、変更なし |
| `006_branch_questions.sql` | blob一致、変更なし |
| `007_study_p0.sql` | blob一致、変更なし |
| `008_immediate_ask_references.sql` | 新規追加のみ |

既存001〜007は `git hash-object` とHEAD blobの照合ですべて一致した。既存migrationのchecksum変更・書換えはない。`008`は `database.ts` へ新規登録され、既存migrationを変更せず `run_marker_references`を追加する。

## Production / Laboratory boundary

- `src/client`、`src/server`、`src/shared`、`src/context-preview` から `src/laboratory` へのimportは0件だった。
- Production codeは `production-immediate-ask.ts`、`production-keep-context.ts`、`production-new-chat-handoff.ts` を直接利用し、Lab runner / fixtureに依存していない。
- Frozen DummyのReact / CSSをProductionへ直接importまたはコピーした形跡はない。Production側は既存Chat、MarkerCore、Repository、GenerationService経路へadapterとして接続されている。
- A候補だけをHEADへ重ねた一時checkoutで、除外Lab filesなしにtypecheckとbuildが成功した。Production候補testsは294 total / 291 pass / 3 skip / 0 failで成功した。
- 一時checkoutの最初の並列testでは `production-keep-context-ui.test.ts` が30〜40ms待機のタイミングにより1件だけ失敗した。単独再実行と全体再実行は成功したため、Lab依存ではなく負荷時のUI test timing揺らぎと判断する。commit blockerではないが既知リスクとして残す。

## Validation status

2026-10-03に実working treeで再実行した結果:

| Check | Result |
|---|---|
| `npm test` | PASS — 320 total / 318 pass / 2 skip / 0 fail |
| `npm run typecheck` | PASS |
| `npm run build` | PASS — Vite 327 modules transformed |
| `git diff --check` | PASS |

`git diff --check` の出力にはCRLFからLFへの変換警告があるが、whitespace errorはない。実モデルRunは行っていない。

## Risks

1. **Blanket staging risk** — untracked 168件とmixed Lab filesがあるため、`git add -A`で実験Run JSONや別Phaseを混入させる危険が高い。
2. **Mixed-file risk** — Dの4ファイルはFrozen Dummyと別Experimentが同居しており、whole-file stagingでは境界を保てない。
3. **UI test timing risk** — A-only一時checkoutの高負荷並列実行で1回だけ待機時間由来の失敗を観測した。再実行は成功し、現在の正式suiteは0 fail。
4. **Line-ending noise** — 複数tracked fileでCRLF→LF警告が出る。内容上のdiff errorではないが、stage後のdiff量を再確認する必要がある。
5. **Documentation boundary** — Frozen Visual Reference本文はB、Production実装記録はA。双方を同じcommitへ含める場合はLab registration一式まで再監査が必要になる。
6. **Ignored local state** — Phase 6隔離DBやbuild出力は正しくignoreされている。force-addしないこと。

## Recommended commit set

Production Integration v0.1は、Aの38ファイルだけをpath指定でstageすれば、1つの基準commitとして固定できる。B、C、Dはstageしない。

推奨手順:

1. Aの38 pathだけを `git add -- <paths...>` で明示stageする。
2. `git diff --cached --name-status` で38件であることを確認する。
3. `git diff --cached --check` を実行する。
4. `008`が含まれ、001〜007、B/C/D、cache、DB、実験Run JSONが含まれないことを確認する。
5. 必要ならstaged stateで最終test / typecheck / buildを再実行する。

結論: **working tree全体はそのまま一括stageできないが、Aの38ファイルはProduction Integration v0.1の基準commit候補として整合している。**

## Proposed commit message

```text
feat: integrate Att-Chat production question workflows
```
