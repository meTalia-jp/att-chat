# Att-Chat Electron Skeleton v0.1 Pre-Commit Audit

Baseline: `d2e54a526703e095bccc2eadeb954b07422454a7`

Audit date: 2026-10-04

## Current working tree

監査文書作成前の`git status --short -uall`には168ファイルがあり、Electron Skeleton候補7件と、既存Laboratory / Experiment差分161件に分離できる。staged差分は0件である。この監査文書を含めると、推奨Electron commit setは8件になる。

Tracked modificationのうちElectronに属するのは`package.json`と`package-lock.json`だけである。残るtracked modification 9件はLaboratory関連であり、Electron commitへ混ぜない。

## Electron commit candidates

分類A。次の8ファイルを明示pathでstageする構成を推奨する。

| Path | 理由 |
| --- | --- |
| `electron/main.mjs` | 既存backendとViteを起動し、BrowserWindowを作る薄いmain process |
| `electron/runtime.mjs` | 隔離port / DB pathとport衝突確認を定義 |
| `vite.electron.config.mjs` | Electron開発用rendererと既存localhost API proxy |
| `package.json` | `electron:dev` scriptとElectron dev dependency |
| `package-lock.json` | Electron 44.5.1と必要なtransitive dependencyの固定 |
| `tests/electron-skeleton.test.ts` | 隔離設定、port衝突、thin launcher、renderer securityの回帰確認 |
| `docs/electron-skeleton-v01.md` | 構成、起動、実機SQLite / LM Studio / reload結果、packaging課題 |
| `docs/electron-skeleton-v01-precommit-audit.md` | commit boundaryと既知リスクの監査記録 |

上記以外にElectron Skeleton成立に必要なsource、migration、production UI変更はない。

## Optional files

分類Bはなし。隔離SQLite、ログ、build成果物、スクリーンショットを追加する必要はない。

## Excluded files

分類C。次は既存Laboratory / Experiment差分であり、Electron Skeletonから除外する。

- tracked Laboratory差分9件:
  - `docs/laboratory/marker-quick-action-prototype.md`
  - `src/laboratory/Laboratory.tsx`
  - `src/laboratory/MarkerQuickActionPrototype.tsx`
  - `src/laboratory/catalog.ts`
  - `src/laboratory/marker-quick-action.css`
  - `src/laboratory/server.ts`
  - `tests/laboratory-ui.test.ts`
  - `tests/laboratory.test.ts`
  - `tests/marker-quick-action.test.ts`
- untracked Laboratory文書・実験結果106件: `docs/laboratory/**`
- untracked Laboratory実装36件: `src/laboratory/**`
- untracked Laboratory / Experiment tests 9件: `tests/context-correction*.test.ts`、`tests/new-chat-handoff*.test.ts`、`tests/retrieval-chunking.test.ts`、`tests/turn-map.test.ts`
- Electronと無関係な未追跡文書1件: `docs/core-status-and-next-phase.md`
- local / generated: `.cache/**`、`dist/**`、`node_modules/**`、DB、log。これらは`.gitignore`対象である。

`git status --short -uall`で確認したElectron以外の161件は、上記分類Cにすべて収まり、分類Dへ回す混在ファイルはない。

## Ambiguous files

分類Dはなし。`package.json`と`package-lock.json`にはElectron追加以外の変更が混在していない。

## Package changes

`package.json`の差分は次の2行だけである。

- script: `electron:dev = electron electron/main.mjs`
- devDependency: `electron = ^44.5.1`

既存`dev`、`server`、`start`、`test`、`typecheck`、`build` scriptは変更されていない。

`package-lock.json`にはElectron追加に対応する122行が追加され、削除はない。baselineに対する新規package entryはElectron本体を含む10件で、Electronの取得・展開に必要なtransitive dependencyだけである。`npm ls electron --depth=0`は`electron@44.5.1`を返す。

## Browser coexistence

- `npm run dev`は従来どおり`vite --host 127.0.0.1 --port 5180 --strictPort`である。
- Electronはfrontend 5186、backend 5187を使用し、Browser既定portを変更しない。
- Electron mainは既存`src/server/main.ts`を子processとして起動し、serverを複製しない。
- Production Integration v0.1のclient / server / shared sourceに差分はない。
- Electron候補ファイルから`src/laboratory`へのimport・参照はない。
- 前回実機確認ではElectron起動中にも既存`npm run dev`が5180でreadyになった。

## Security settings

`BrowserWindow`は次を維持している。

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- 新規window openを拒否
- Electron frontend URL外へのnavigationを拒否

commit対象の実行コード・設定・testにcheckout固有のabsolute pathはない。`docs/electron-skeleton-v01.md`の`D:\att-Chat`はWindows向け起動例であり、runtime依存ではない。

LM Studio接続先はElectron側へhardcodeしていない。既存`LMStudioProvider`が`LM_STUDIO_BASE_URL`、未指定時`http://127.0.0.1:1234/v1`を使用する。

`.cache/electron-skeleton-v01.sqlite`は`.gitignore`の`.cache/`および`*.sqlite`に一致し、Git管理対象ではない。

## Known lifecycle issue

観察された表示:

```text
vite stopped before Electron shutdown
```

`electron/main.mjs`は子processの非0終了時、`stopping`がまだ`false`なら早期停止として扱う。`stopping`はElectronの`before-quit`または失敗処理で初めて`true`になる。そのため、Viteが独立して停止した場合、terminalからのCtrl+C等で子processの終了通知がElectronの`before-quit`より先に届いた場合、または開発環境の終了順序が入れ替わった場合に、この表示が起こり得る。

通常の起動、Conversation作成、LM Studio生成、SQLite保存、終了後の再起動・復元は完了している。データ破損やBrowser版回帰は確認されていないため、Skeleton v0.1のcommit blockerとはしない。ただし、正常終了と異常終了を明確に区別できず、終了時に誤ったerror表示や競合したcleanupを起こす可能性がある。次Phaseのlifecycle cleanupで、終了signal、子processの待機、正常終了順、二重fail防止を独立して扱うべきである。

今回は再現条件の記録だけを行い、lifecycle codeは変更していない。

## Validation status

- Electron固有test: 3 pass / 0 fail
- `npm test`: 323 total / 321 pass / 2 skip / 0 fail
- `npm run typecheck`: PASS
- `npm run build`: PASS（Vite 327 modules）
- `git diff --check`: PASS
- staged files: 0
- 実モデルRun: 今回は実施していない

## Risks

- child processの終了順に関する既知のlifecycle表示が残る。
- development Skeletonはsystem Node、source TypeScript、Vite dev server、`node_modules`へ依存し、packaged appとしては未完成である。
- DB保存先は正式なAppDataではなく`.cache`である。
- localhost port ownership、single-instance、crash recoveryはPoC水準である。
- Electron 44.5.1はdevDependencyとして固定されるが、installer、署名、auto updateは対象外である。

## Recommended commit set

分類Aの8ファイルだけを明示pathでstageする。他の161件とlocal / generated assetはstageしない。`git add .`または`git add -A`は使用せず、stage後にfile count、name-status、cached diff checkを再確認する。

この8ファイルはbaseline `d2e54a526703e095bccc2eadeb954b07422454a7`上で、Electron Skeleton v0.1を独立して理解・実行・検証するための自己完結したcommit boundaryである。

## Proposed commit message

```text
feat: add Electron skeleton for Att-Chat
```
