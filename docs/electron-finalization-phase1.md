# Electron Finalization Phase 1

実装・検証日: 2026-10-13。保存先集約、Quick Memo分離、single instanceのみを対象とした。

## 保存先とモード

Electron mainで`app.isPackaged`を判定する。配布版ではmainが`resolve(app.getPath('userData'), 'data')`を計算し、runtimeへ渡す。rendererへ保存先は渡さない。

| ファイル | Browser dev | Electron dev | Electron distribution |
| --- | --- | --- | --- |
| DB | `repo/data/attchat.sqlite` | `repo/.cache/electron-skeleton-v01.sqlite` | `<userData>/data/attchat.sqlite` |
| Settings | `repo/data/settings.json` | `repo/.cache/electron-settings-v1.json` | `<userData>/data/settings.json` |
| Collections | `repo/data/collections.json` | `repo/.cache/electron-collections-v1.json` | `<userData>/data/collections.json` |
| Quick Memo | `repo/data/quick-memo.md` | `repo/.cache/electron-quick-memo.md` | `<userData>/data/quick-memo.md` |

distributionの保存先はrepoの位置に依存しない。lock取得・Electron ready後、child起動前にDB親ディレクトリ（distributionでは共通の`data`）を再帰作成する。DBはopen時に作成、Settingsはdefaults、Collectionsは空、Quick Memoは空で開始し、後者3ファイルは最初の保存まで作成しない。既存データの移動は行わない。

## env注入

backend childには`ATTCHAT_DB`、`ATTCHAT_SETTINGS`、`ATTCHAT_COLLECTIONS`、`ATTCHAT_QUICK_MEMO`をruntimeの絶対pathで明示注入する。親processの同名envより優先する。

devでは従来の`ATTCHAT_ELECTRON_DB`、`ATTCHAT_ELECTRON_SETTINGS`、`ATTCHAT_ELECTRON_COLLECTIONS`を維持し、`ATTCHAT_ELECTRON_QUICK_MEMO`を追加した。相対指定はrepo基準。`ATTCHAT_QUICK_MEMO`はBrowser/backend直接起動用で、Electron起動時の上書きには使用しない。従来のElectron検証スクリプトで同変数を使用していた場合はElectron専用変数へ変更する。

distributionでは4種類のElectron dev用storage envと汎用storage envをすべて無視し、常にuserData配下へ保存する。portやNode起動指定は従来のまま。

## single instance

`electron/single-instance.mjs`で`app.requestSingleInstanceLock()`をready待機より前に呼ぶ。失敗時は`app.quit()`のみを実行し、runtime生成、userData path参照・ディレクトリ作成、port確認、backend/frontend起動へ進まない。

primaryの`second-instance`で既存Windowをminimizedならrestoreし、show、focusする。Window生成・ロード前の通知は保留し、ロード完了時に適用する。二次起動は新しいWindowやchildを作らない。

devにも同じlockを適用した。同じアプリの既定devファイルへの複数writerを防ぐためであり、既存テストはElectron APIをmockするため影響しない。devで別DB/portを指定しても同じアプリの同時多重起動はできなくなる。別アプリとしてパッケージされたdev/distribution間の排他は今回の保証対象ではない。

## 検証

- focused: `node --experimental-strip-types --test tests/electron-finalization.test.ts tests/electron-skeleton.test.ts tests/electron-lifecycle.test.ts` → 14 PASS。
- `npm test` → 407件中405 PASS、2 SKIP、0 FAIL。最初のsandbox内実行ではlocalhost接続がEACCESとなったため、許可されたsandbox外で再実行した。
- `npm run typecheck` → PASS。
- `npm run build` → PASS（既存のfrontend build）。
- `git diff --check` → PASS。既存ファイルにCRLF→LFの通知あり。

新規テストはdevの4保存先とenv、distributionの4保存先とenv無視、repo移動時の保存先不変、Browser既定path維持、初回ディレクトリ作成・遅延ファイル作成、4 Storeの保存と再open、lock失敗時の起動抑止、primaryの起動一回のみ、minimized/hidden表示とfocus、Window生成前通知の保留、mainの配線を確認する。distribution相当は一時fake userDataで実際のSQLite/Storeを使用し、Conversation/Turnも再open後に確認した。

## 実機確認

Windows上のElectron devをfrontend 5194/backend 5195、4保存先すべて`.cache/electron-phase1-smoke/`へ明示上書きして起動した。通常ユーザーDBは使用していない。

1. 既存HTTP APIでConversation、Settings、Collection、Quick Memoを保存し、隔離先の4ファイル作成を確認。
2. 二次Electronを意図的に不正なfrontend port指定で起動。exit 0となりport validationへ進まず、backend/Vite起動ログも出ず、primary APIは継続応答。実際のlock失敗経路を確認。
3. primaryを停止し同じ保存先で再起動。4種類のデータがAPI経由で復元されることを確認。
4. 検証後、起動したElectronを停止。

Electron dev既定の4path自体はfocused testで確認し、実機は通常データ保護のため上記隔離上書きを使用した。Browser UIの手動再操作は未実施。Browser backend/Storeは変更せず、既定path検査および全体回帰テストで確認した。

## 未確認・対象外

実packageの作成・起動は未実施。distribution相当の保存・復元はfake userDataの自動テストであり、配布可能になったことを意味しない。Windows実画面での最小化・非表示からの復元とfocusは目視・ネイティブ操作では未確認（Electron API mockで呼び出しと順序を確認）。

backend配布build、Vite除去、installer/ZIP、dynamic port、graceful shutdown/child errorの本改修などはPhase 2以降。既存working treeにあったlifecycle処理を維持した。Browser側Store、DB/schema/migration、JSON schema、Quick Memo形式、GenerationRun/request_snapshot、Profile/Provider/Marker/Keepは今回変更していない。commit/push/tagは行っていない。
