# Electron Finalization Phase 2

実装・検証: 2026-10-13 / Windows x64。

## 構成

```text
electron-dist/
  AttChat.exe                    Electron配布バイナリ（electron.exeから名称変更）
  *.dll, locales/, ...           Electron本体の必要資産・LICENSE類
  staging-manifest.json          配布対象全ファイルのSHA-256、Node版、辞書hash
  resources/
    app/package.json
    app/electron/*.mjs           main/runtime/lifecycle/single-instance/distribution
    node/node.exe               Node v24.19.0 win-x64
    node/LICENSE                Node同梱依存を含む公式ライセンス全文
    backend/package.json        type=module
    backend/server/main.js      build済みentry
    backend/{server,shared,semantic,retrieval,context-preview}/...
    frontend/index.html
    frontend/assets/...         production entryから参照されるJS/CSSのみ
    frontend/dictionaries/ejdict-hand/{ejdict.json,README.md,SOURCE.json}
    migrations/001_initial.sql ... 008_immediate_ask_references.sql
    licenses/...                frontendを含む依存ライセンス・NOTICE
```

今回はASARを使わない。Electron本体に`resources/app`を配置する明示staging方式で、外部packagerは追加していない。Node実行ファイル、backend、SQL、辞書はすべて実ファイル。child cwdは絶対resources root。将来appだけASAR化する場合もこれらの資産はASAR外を維持する。

ユーザーデータはPhase 1の`app.getPath('userData')/data/{attchat.sqlite,settings.json,collections.json,quick-memo.md}`を維持し、resourcesへ保存しない。

## build・外部資産の準備

clean checkoutでは`npm ci`でlockfileどおりの依存を取得する。Nodeと辞書は必須の明示入力であり、未指定・版違い・辞書hash不一致の場合、stagingを成功扱いにしない。

1. [Node公式v24.19.0配布ディレクトリ](https://nodejs.org/dist/v24.19.0/)の`node-v24.19.0-win-x64.zip`と`SHASUMS256.txt`を取得し、SHA-256を照合して展開する。
2. [EJDict公式取得元](https://kujirahand.com/web-tools/EJDictFreeDL.php)から辞書JSONを取得する。`public/dictionaries/ejdict-hand/SOURCE.json`記録のSHA-256 `74bf048fddee2d5bad426f81cc2c10374ae7d8007d7f8550bf42d86c61614e2b`と一致する版が必要。最新版で変わっていれば出所確認とmanifest更新を先に行う。Git ignoreされた開発用ファイルの存在は前提にしない。
3. PowerShellで以下を実行する（入力ディレクトリは任意の明示場所）。

```powershell
$env:ATTCHAT_DIST_NODE_DIR = 'C:\build-assets\node-v24.19.0-win-x64'
$env:ATTCHAT_DIST_EJDICT = 'C:\build-assets\ejdict.json'
npm run build:electron-dist
```

既定出力は`electron-dist/`。既存出力へのマージを拒否し、古い資産の混入を防ぐ。再buildは未作成の`ATTCHAT_DIST_OUT`を指定するか、利用中でない生成済み出力を整理してから行う。`ATTCHAT_DIST_OUT`でrepo外へもstaging可能。

`npm run build:electron-dist`は既存`npm run build`（frontend）→`npm run build:server`→stagingを実行する。backendは`tsconfig.server-build.json`で別途emitし、相対`.ts` importを`.js`へ書き換える。`scripts/build-server.mjs`は既知の`dist-server`のみを毎回cleanする。frontendの通常buildとnoEmit typecheckは維持。

NodeはPATHから探索せず`resources/node/node.exe`を直接起動する。build時にversionを検査し、最終manifestへ実体hashを記録する。公式Nodeライセンス全文を同梱する（[公式LICENSE](https://raw.githubusercontent.com/nodejs/node/v24.19.0/LICENSE)）。Electron本体のLICENSE/Chromium noticesも維持する。

EJDictは入力assetをhash検証してfrontend配下へコピーし、既存の`/dictionaries/ejdict-hand/ejdict.json`で配信する。[配布元README](https://github.com/kujirahand/EJDict)のPublic Domain表記と出所を同梱。UI/API/辞書形式は変更していない。任意assetとしての既存missing guidanceも維持するが、このstaging build自体は辞書必須とした。

`.cache`、DB、proof画像、test log、tests、src、node_modules、Laboratory HTMLは配布対象に含めない。frontendはproduction indexとその参照資産を収集し、backendは専用build出力を使う。開発PCのPATH上のNodeや手作業のdistには実行時依存しない。

## 起動・port・readiness

`app.isPackaged`ならdistribution専用launcherへ進み、Viteを起動しない。Nodeへbuild済みbackendの絶対pathを渡し、4保存先に加えて`ATTCHAT_FRONTEND`と`ATTCHAT_MIGRATIONS`を絶対pathで注入する。

backendは既存の`ATTCHAT_PORT=0`とIPC `{port}`通知を利用する。通知を受け、`/api/conversations`と`/`のHTTP成功を確認してからWindowを作成する。IPC ready前のerror/exit/timeoutは起動失敗として扱う。frontend/APIは`http://127.0.0.1:<確定port>/`の同一origin。localhost bind、Host/Origin制約は維持した。

mainのnavigationも許可originとの完全一致へ変更した。rendererへfilesystem pathは渡さない。LM Studioは従来のbackend Provider経由であり、127.0.0.1/Z690指定はそのまま利用可能。

migrationは8ファイルを無変更でコピーし、SQLの既存正規化・checksum検査を維持する。Browser/devは従来のモジュール相対migration pathが既定。

## semantic判断

通常チャット・起動はsemanticを必要としない。既存search-runtimeはモデル設定時のみproviderをdynamic importし、workerもモデルdirがある場合のみ起動する。本stagingはモデル・ONNX/tokenizer native依存を同梱せず、親環境の`ATTCHAT_EMBEDDING_MODEL_DIR`をbackendへ引き継がない。Related Turnsの意味検索は未設定として既存の案内・エラーを返す。

配布版で意味検索を有効にしたい場合は、別途対応するnative依存と固定モデルの配布設計が必要。devのsemantic設定は変更していない。Nodeの親環境混入を避け、distribution childでは`NODE_OPTIONS`と`NODE_PATH`も除外する。

## devとの差

- Browser: `npm run dev`、既存backend起動、Vite proxy、repo/data既定を維持。
- Electron dev: 外部開発Node＋TypeScript source＋Vite、Phase 1の`.cache`保存先とdev env上書きを維持。
- distribution: 同梱Node＋build済みJS＋静的frontend、dynamic backend port一つ、userData/dataへ保存。
- Phase 1のsingle instanceを共通適用。二次起動でchildを起動しない。

## テスト・実機結果

- focused Electron tests: 18件PASS。path、build済みbackend実child、IPC portの不正値/失敗/timeout、空DB作成、静的配信、Origin拒否、4データ再読込、single instanceを検証。
- 既存DBコピー: source-runtimeでConversation/Turn/GenerationRun/Marker/Keep入りの隔離DBを作成・closeしてコピーし、build済みbackendでopen。checksum検査成功、detail/Highlights/QuestionKeepsのHTTP JSONが元データと一致。通常ユーザーDBは使用していない。
- `npm test`: 411件中409 PASS、2 SKIP、0 FAIL（localhost接続を使うためsandbox外）。
- `npm run typecheck`、`npm run build`、`npm run build:server`、`npm run build:electron-dist`、`git diff --check`: PASS。
- Browser dev: Vite 5180起動、`/` HTTP 200。
- Electron dev: 隔離`.cache/electron-phase2-dev`でbackend 5195/Vite 5194起動、frontend/APIともHTTP 200。確認後停止。

実配布stagingを`C:\Users\eigo\AppData\Local\Temp\attchat-phase2-stage-01`へ作成し、repo外cwd・空PATH・不正な開発用Node/port envで起動した。`app.isPackaged=true`を確認し、Viteなし・同梱Nodeのみで起動した。

最終成果物は`D:\att-Chat\electron-dist\AttChat.exe`。この最終staging自体も同じ隔離smokeを再実行してPASSし、検証用entryを元に戻した。起動には`electron-dist`ディレクトリ全体が必要。

`scripts/test-electron-stage.mjs`は明示stagingを検証する専用harness。stagingのentryを検証中だけ差し替え、`app.setPath('userData', 一時ディレクトリ)`で通常データから隔離する。終了後に元entryへ戻す。production用envやportable data modeは追加していない。

```powershell
$env:ATTCHAT_TEST_STAGE = 'C:\isolated\att-chat-stage'
node scripts/test-electron-stage.mjs
# 任意の実生成テスト
$env:ATTCHAT_TEST_LM_STUDIO = 'http://Z690:1234/v1'
$env:ATTCHAT_TEST_MODEL = 'qwen2.5-coder-7b-instruct'
node scripts/test-electron-stage.mjs
```

実機で初回空DB/migration、frontendのStart Screen描画、Conversation/Settings/Collection/Quick Memo保存、終了・再起動・4データ復元、GenerationRun読込、辞書appleの意味取得、参照JS/CSSのHTTP成功、二次Electronのexit 0・child非起動を確認した。再起動後startup=lastの会話画面もcapturePage画像で確認した。保存・辞書の操作確認はHTTP経由であり、ネイティブ入力で全ボタンを操作したという意味ではない。

Z690の`qwen2.5-coder-7b-instruct`へbackend経由で短い質問を送り、GenerationRun `succeeded`、finish_reason `stop`、completion 4 tokens、content 10文字を確認した。最初のテストharnessはElectron stdinでの終了待機が止まったため、検証専用終了ファイル→app.quitに修正した。本体shutdown処理は変更していない。

## 未確認事項・対象外

本番installer、他PC/Windows版、署名・SmartScreen、registry、automatic update、ASAR包装、意味検索native資産入り配布は未検証。runtime取得の自動化はなく、公式ZIP/checksum確認はbuild前の明示手順。今回の実機Node ZIPは公式SHASUMSと照合済み。

shutdown/child異常終了の本改修はPhase 3。テスト終了時にChromium GPU終了ログが出る場合があったが、保存・再起動・生成の検証は成功した。最小化/非表示からのfocusはPhase 1 mock回帰で確認し、実機smokeでは二次起動の終了を確認した。

DB/schema/SQLファイル、Settings/Collections schema、Quick Memo形式、Provider/Profile/Marker/Keep契約を変更していない。commit/push/tagは行っていない。
