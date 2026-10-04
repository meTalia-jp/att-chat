# Att-Chat Electron Skeleton v0.1

## Purpose

Production Integration v0.1 (`d2e54a526703e095bccc2eadeb954b07422454a7`)を作り直さず、既存React UI・Node backend・SQLite・LM Studio経路をWindowsの独立Electron windowから利用できるかを確認するPoCである。installerや配布形式を決めるものではない。

## Electron構成

```text
Electron main (electron/main.mjs)
├─ existing backend child: src/server/main.ts
│  ├─ .cache/electron-skeleton-v01.sqlite
│  └─ existing LMStudioProvider
├─ Vite child: vite.electron.config.mjs
│  └─ /api proxy → isolated backend
└─ BrowserWindow → existing index.html / React UI
```

rendererは`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`で動かす。IPC、preload、Electron専用provider、server複製は追加していない。

## 起動方法

前提:

1. Node.js 24系と依存を用意する。
2. LM Studioのlocal serverを`http://127.0.0.1:1234/v1`で起動し、利用モデルをloadする。

```powershell
cd D:\att-Chat
npm.cmd install
npm.cmd run electron:dev
```

Electron専用既定値:

- frontend: `127.0.0.1:5186`
- backend: `127.0.0.1:5187`
- SQLite: `.cache/electron-skeleton-v01.sqlite`

`ATTCHAT_ELECTRON_FRONTEND_PORT`、`ATTCHAT_ELECTRON_BACKEND_PORT`、`ATTCHAT_ELECTRON_DB`でPoC値を変更できる。frontendまたはbackend portが使用中なら、所有者不明のprocessへ接続せず起動を停止する。

## Backend起動方式

Electron mainがsystem Node childとして既存`src/server/main.ts`を起動する。backendが`/api/conversations`へ応答した後、Electron専用Vite serverを起動し、frontend応答後にBrowserWindowを作る。window終了時はmainが両childを終了する。

Browser版の`npm run dev`（5180→5181）と`npm start`は変更していない。Electronは5186/5187を使うため同時起動できる。

## SQLite確認

Electronは通常の`data/attchat.sqlite`を使用しない。`.cache/electron-skeleton-v01.sqlite`へ既存migrationを適用し、Conversation、Turn、GenerationRunを既存Repository経路で保存する。再起動後も同じ隔離DBから復元する。

2026-10-04の実機確認ではmigration 1〜8が適用され、次を保存できた。

- Conversation: 1件（`Electron Skeleton 検証`）
- Turn: 2件（User / Assistant、ともに`completed`）
- GenerationRun: 1件（`succeeded`、provider=`lm_studio`）

Electronを終了して同じコマンドで再起動すると、画面は`DBから読込済み`となり、Conversation、User Turn、Assistant Turnを同じ隔離DBから復元した。

## LM Studio確認

Electron専用providerは存在しない。backendの既存`LMStudioProvider`を使い、model listとgeneration requestをlocalhost HTTPで行う。Skeletonの手動確認では1 Conversation・1 generationだけを実行する。

実機確認では`google/gemma-4-12b-qat`を選び、次の1 Runだけを送信した。

- User: `Electron Skeletonの疎通確認です。日本語で「接続成功」と一言だけ返してください。`
- Assistant: `接続成功`
- finish reason: `stop`
- GenerationRun outcome: `succeeded`

Provider requestとRun保存には既存経路を使用しており、Electron専用のモデル処理は追加していない。

## Browser版との共存

- `npm run dev`のscriptと既定portは不変。
- Production React componentはElectronをimportしない。
- Production server、Repository、GenerationServiceにElectron分岐を追加していない。
- Electron固有処理は`electron/`と`vite.electron.config.mjs`に分離した。

Electronが5186/5187を使用中の状態で、既存`npm.cmd run dev`が5180で起動し、Viteがreadyになることを確認した。Browser版のscript、port、build経路は変更していない。

## Manual check

2026-10-04にWindows上で次を確認した。

1. `npm.cmd run electron:dev`でURL barのない独立windowが起動した。
2. 既存Att-Chat UIのConversation list、Chat、Question Box tab、Composer、model selector、Marker管理入口、miniMAPが表示された。
3. `Electron Skeleton 検証`を作成し、LM Studioへ1件送信した。
4. Assistantの`接続成功`とRunの`succeeded`を画面で確認した。
5. 隔離DBにConversation 1件、Turn 2件、GenerationRun 1件が保存された。
6. Electronを終了・再起動し、Conversationと両Turnが復元された。
7. occupied-portの自動テストでは、既知でないprocessへ接続せず起動を拒否した。

今回の会話にはMarkerを作らなかったため色付きMarkerそのものの追加操作は行っていない。既存Marker UIの入口とrender領域はProduction UIのまま表示され、Electron側にはMarker固有実装を追加していない。

## Packaged buildで予想される問題

- 現在はsystem Nodeとsource `.ts`をchild起動するため、packaged app単体では動かない。backend bundleまたは同梱Nodeが必要。
- Vite dev serverと`node_modules`を参照するため、ASAR内外のresource配置を設計する必要がある。
- SQLiteの正式保存先は`.cache`ではなく`app.getPath('userData')`等へ移す必要がある。
- backend/frontendの固定localhost port、firewall、port reservation、single-instance制御が必要。
- packaged rendererはVite dev URLではなくbuilt assetを安全に配信する方式が必要。`file://`へ直接移す場合、相対asset pathとsame-origin APIの扱いが変わる。
- child process終了、crash recovery、ログ保存、app update時のmigration順序を正式化する必要がある。

## 次回Electron化で必要な作業

- packaged backend/runtime方式の選定
- AppData配下DB・log・cache配置
- production asset loadingとCSP
- single-instance / port ownership / graceful shutdown
- installer、署名、更新方式の検討
- Browser開発経路とdesktop配布経路を分けたCI

## Status

Implementation: Skeleton complete
Automated validation: passed（Electron固有3件、全suite 323件中321 pass / 2 skip）
Windows Electron window: passed
Isolated DB + LM Studio one-run/reload: passed
