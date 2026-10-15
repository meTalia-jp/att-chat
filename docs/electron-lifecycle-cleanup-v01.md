# Att-Chat Electron Lifecycle Cleanup v0.1

Baseline: `ec9e85508340d316f1a6a9db308533fd25e5b4dc`

## 原因

Electron Skeleton v0.1では、子processをkillした直後に追跡対象から外し、終了を待たずにElectron終了を続けていた。また、正常終了開始を示す`stopping`は`before-quit`でのみ設定されていたため、Ctrl+CなどでViteのexit通知が先に届くと、正常終了中でも`vite stopped before Electron shutdown`として扱う可能性があった。

## Cleanup sequence

終了入口を単一のcleanupへ集約した。

1. `stopping`を同期的に`true`へする。
2. backendとViteへ`SIGTERM`を送る。
3. 各childの`exit`イベントを待つ。
4. 両方が終了した時点で待機を即終了する。
5. timeoutまで残ったchildだけへ`SIGKILL`を送る。
6. Electronのquitを続ける。

window close、`app.quit()`、SIGINT、SIGTERMは同じcleanup promiseを共有する。cleanupは一度だけ開始され、重複したsignal送信やquit処理を行わない。

## Timeout policy

graceful timeoutは5秒とした。固定sleepではなく、全childのexit promiseとtimeoutを`Promise.race`する。childが早く終了すれば5秒を待たない。timeout時には、その時点でexitしていないchildだけを強制終了する。

## 正常終了 / 異常終了の判定

正常終了ではcleanup開始前に`stopping = true`とする。以後にbackendまたはViteがexitしてもerror dialogを表示しない。

終了処理に入っていない状態でchildが非0終了した場合は、従来どおり異常終了として扱い、残るchildを同じcleanupで停止してerrorを表示する。exit通知とSIGINTが同じタイミングに来る場合に備え、異常判定は次のevent-loop turnで`stopping`を再確認する。

## Test結果

- Electron固有test: 7 pass / 0 fail
- window close / Ctrl+C / Electron quit: 同じcleanup promiseを共有し、各childへの`SIGTERM`は1回
- 正常終了: child exitをerror扱いしない
- Vite / backend異常終了: 両labelで非0終了を検知
- timeout: すでに終了したchildを除外し、残存childだけへ`SIGKILL`
- Windows実機window close: backend / Viteとも終了し、誤った早期停止表示・dialogなし
- `npm test`: 327 total / 325 pass / 2 skip / 0 fail
- `npm run typecheck`: PASS
- `npm run build`: PASS（Vite 327 modules）
- `git diff --check`: PASS

full suiteの初回に既知のKeep Context UI timing testが1件だけ一時失敗した。対象test単独再実行は2 pass、その後のfull suite再実行は上記のとおり0 failで、testまたはproduction codeは変更していない。
