# Electron Finalization Phase 3

実装・検証日: 2026-10-13 / Windows x64。

## Shutdown protocol

Electronからbackendへ既存parent-child IPCで`{type:"shutdown"}`を送る。HTTP shutdown endpointは追加していない。distributionに加えElectron dev backendもIPC付きspawnへ変更した。二次Electronはsingle instance lock失敗で起動処理へ入らず、primary backendへ停止要求を送らない。

backendでは起動初期からshutdown IPC、親IPC disconnect、SIGINT、SIGTERMを受け付ける。初期化中の停止要求は記録し、初期化後にlistenせずcleanupへ進む。終了Promiseは共有し、重複要求でも以下を一回だけ実行する。

1. HTTP handler入口を閉じる。既存keep-aliveで届いた後続requestは503を返す。
2. `server.close()`で新規接続を止め、処理中handlerとHTTP接続の両方が完了するまで待つ。
3. Settings、Collections、Quick Memoの`flush()`をすべて待つ。
4. 中断Runを整理し、SQLite connectionを明示`close()`する。
5. semantic workerがあればshutdown IPC→exit待ちを行う。
6. 成功ならbackend exit 0、保存や終了処理に失敗があればexit 1。

HTTPはsocket closeだけでなく、async handlerのPromiseを追跡する。クライアントが切断しても、handler内の保存や生成終了処理が未完了ならDBを閉じない。正常経路では即座の`closeAllConnections()`を使わない。

## Store flushとQuick Memo

各Storeへ`flush(): Promise<void>`のみを追加した。既存write queueが完了するまで待ち、writerで発生した保存失敗を終了処理へ返す。queueを継続可能にする既存catchは維持した。writerの失敗はStoreインスタンスの存続中保持するため、後続保存が成功しても終了結果は保守的に失敗となる。入力validation失敗を保存I/O失敗とは扱わない。

Quick Memoは既存`writeFileAtomically`を再利用し、tempファイル→write→sync→close→renameへ変更した。Markdown形式、API、UI、並び順、重複許容は維持。rename失敗時は旧Markdownを残し、一時ファイルをcleanupする。Settings/Collections schemaとDB schema/migrationは変更していない。

## Timeoutとfallback

| 対象 | 待機・fallback |
| --- | --- |
| backend終了処理 | 最大4秒。timeoutを記録し、worker停止を試み、exit 1。処理が残っているDBに対し安全を装ってclose成功とは記録しない |
| Electronのbackend待機 | shutdown IPC後5秒。未終了childだけSIGKILLへ移行 |
| kill後 | exit確認を最大2秒待つ。未確認なら失敗結果として扱う |
| semantic worker | IPC停止から500ms待つ。未終了ならSIGKILLし、さらに500ms exit待ち |
| workerの親切断 | 停止要求・indexer cancel。1.5秒後も終了していなければexit 1 |

backendにSIGTERMを正常停止要求として送る方式は廃止した。Electron devのViteのみ従来どおりSIGTERMを使用する。Windows上ではこれは強制的な停止になり得るが、DB/Storeを持つbackendはIPCで終了させる。

timeout時は未完了の処理が最後まで保存される保証はない。明示的に失敗としてログ・dialogへ反映する。WALを手作業で削除せず、再起動時は既存SQLite/migration/中断Run回復を使用する。

## Electronのerror handling

- spawn直後にchildの`error`と`exit` handlerを登録する。spawn失敗のようにPID/exit eventがない場合もcleanupが永久待機しない。
- stopping外の常駐backend/Vite exitはcode 0を含めて異常。残存childを停止し、Windowをdestroyして操作不能にしてからdialogを表示し、Electronをexit 1にする。
- 正常終了開始時はWindowをdisabledにして新たな操作を止める。
- cleanup Promiseを共有し、before-quit、window-all-closed、startup failure、child error/exitが重なっても一回だけ実行する。
- stopping中のexitを異常通知として重複報告しない。ただしbackend非0 exitや停止開始直後の失敗は終了結果に保持する。
- 起動途中に停止した場合、追加child/Windowを作らない。runtime parse、path解決、同期startup例外はfailure経路へ入れる。
- dialogやcleanup自体の例外でもElectron終了へ進む。

consoleには`CHILD_STARTED`（label/PID）、`ELECTRON_FAILURE`、`CHILD_ERROR`、`CHILD_UNEXPECTED_EXIT`、`SHUTDOWN_TIMEOUT`、`BACKEND_DB_CLOSED`、`BACKEND_SHUTDOWN_SUCCESS/ERROR`、`CHILD_SHUTDOWN_SUCCESS/ERROR`などを出す。新しいログに会話本文やrequest全文は含めない。file loggerは追加していない。

## Browser/dev/distribution

Browser devは既存source backend/Vite/API/保存先を維持する。backend側の安全なdrain/flush/closeは共通。Windowsから外部killで送るSIGTERMが強制終了になるOS挙動自体は変更しない。

Electron devは既存Node＋source backend＋Viteを維持し、backendだけIPCによる停止へ移行。`.cache`保存先とenv上書きも維持する。

distributionはPhase 1/2のuserData/data、single instance、同梱Node、build済みbackend、static frontend、dynamic port、migration/辞書資産を維持。backend/Node/資産はASAR外で、repo/PATH上Node/Viteへ依存しない。semanticモデル/nativeは引き続き未同梱。

## テスト

focused:

```powershell
node --experimental-strip-types --test tests/backend-shutdown.test.ts tests/electron-distribution.test.ts tests/electron-lifecycle.test.ts tests/electron-finalization.test.ts tests/electron-skeleton.test.ts tests/quick-memo.test.ts
```

27件PASS。主な検証内容:

- Settings/Collectionsを意図的に遅延させ、保存完了→DB close→worker停止→exitの順を確認。
- flushの保存失敗検出と失敗時exit 1。Quick Memo rename失敗時の旧内容保全。
- 切断済みクライアントのHTTP handlerが保存中でも、DB closeを待機。
- 重複shutdownは同一Promise。timeout時に処理中DBを正常close扱いにしない。
- 実worker fixtureのshutdown IPC、hung workerのkillとexit待ち。
- FakeChildのspawn error、code 0/nonzero unexpected exit、stopping中exit、IPC timeout、force kill後のexit待ち。
- build済みbackendの実Node childにIPCを2回送り、exit 0・DB close/成功ログ各1回。親IPC切断時も同様に終了。
- SQLite書込み後のshutdown/restart、4保存先復元、既存DBコピーのConversation/Marker/Keep/GenerationRun一致。
- Phase 1/2 path、single instance、distribution resource/readiness、HTTP Origin回帰。

全体検証:

| コマンド | 結果 |
| --- | --- |
| `npm test` | 418件中416 PASS、2 SKIP、0 FAIL |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run build:server` | PASS |
| `npm run build:electron-dist` | PASS（新規の出力先を指定） |
| `git diff --check` | PASS |

最初のsandbox内focused testでatomic renameがEPERMになったため、許可を得たsandbox外で検証した。UAC昇格コードはなく、実機検証tokenの`Administrator`判定はFalseだった。

## Windows実機

初回はrepo外の`%TEMP%/attchat-phase3-stage-01`、最終成果物は`D:\att-Chat\electron-dist-phase3\AttChat.exe`。既存Phase 2の`electron-dist`を上書きせず、新規stagingにした。起動にはフォルダ全体が必要。

実行例:

```powershell
$env:ATTCHAT_TEST_STAGE = 'D:\att-Chat\electron-dist-phase3'
node scripts/test-electron-stage.mjs
node scripts/test-electron-failures.mjs
node scripts/test-electron-dev-shutdown.mjs
```

すべて隔離userData/DBを使用し、通常ユーザーDBを使用していない。staging harnessは検証時だけentryを差し替え、終了後に元へ戻す。productionの保存先上書きやfault injection機能は追加していない。

正常系は空PATH・repo外cwd・`app.isPackaged=true`で、Conversation/Settings/Collection/Quick Memo保存→app.quit→backend DB close→exit 0→Electron exit 0→再起動復元を確認。GenerationRun、辞書apple、static資産も回帰確認した。二次起動直後もprimary APIが応答し、shutdownログが出ないことを確認。

異常系は次の7条件がすべてPASS:

1. userData path取得例外。
2. dev runtime port parse例外。
3. 存在しないNodeによるspawn ENOENT。
4. 不正なbuild済みbackend entry。
5. 起動後backendへ停止要求を送り、予期しないexit 0を発生。
6. 起動後backendを意図的にkillして非0/強制exitを発生。
7. harnessでshutdown IPC送信を意図的に抑止し、5秒timeoutからforce kill。

各条件でerror dialog呼出し1回、cleanup1回、Electron exit 1、開始したbackend PIDが残らないことを確認した。異常系のdialogはharness内で自動応答した。実ネイティブ入力でdialogを操作した検証ではない。

Electron devは隔離`.cache`のDBでbackend/Vite起動、API/画面HTTP 200、保存、app.quit、IPC正常停止、backend/Vite両PID消滅を確認。最初のharnessではChromium userDataをrepo内に置いたためVite watcherがEBUSYになった。その際もVite異常を検出しbackendを正常停止できた。harnessのChromium userDataをrepo外へ移して正常系もPASS。本体のVite設定は変更していない。

Browser devもsource backendのAPIとVite frontendがHTTP 200となり、隔離backendのDB close/終了を確認した。

## Orphan確認・限界

正常系・異常系harnessは、開始時ログのchild PIDへ`process.kill(pid,0)`を行い、終了後に存在しないことを検査する。Electron devはbackendとViteの両方を検査。加えてWindows process一覧で隔離staging配下のAttChat.exe/node.exe残存なしを確認した。

実semanticモデルを読み込んだworkerの停止は未確認。IPC worker fixtureと既存semantic回帰テストで確認した。OS電源断、kill権限自体の拒否、native処理のOSレベル停止不能、他PCでの長時間負荷・巨大保存は未検証。kill後もexitが確認できなければログと失敗結果を返し、成功とは報告しない。

Chromium終了時のGPUログが出る場合はあったが、正常終了・保存復元の検証はPASS。ログはconsoleのみであり、Explorer起動時の恒久的なログ収集UIは未実装。

installer/NSIS、registry、署名/SmartScreen、自動更新、semantic同梱、data migration UIなどは対象外。commit/push/tagは行っていない。
