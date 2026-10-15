# Settings Persistence v1.0-pre.2

実装・検証日: 2026-10-12。着手時の多数の未commit変更を保持して追加実装した。commit / push / tagは行っていない。

## 構成と保存先

Client → Att-Chat Server settings API → SettingsStore → 単一JSON。
Conversation DBのtable / schema / migrationは追加していない。localStorage / sessionStorage / renderer filesystem / settings専用IPCも追加していない。

- Browser: `ATTCHAT_SETTINGS`、未指定ならrepo配下`data/settings.json`。
- Electron dev: `ATTCHAT_ELECTRON_SETTINGS`、未指定ならrepo配下`.cache/electron-settings-v1.json`。
- Electron launcherが`runtime.settingsPath`をbackend childの`ATTCHAT_SETTINGS`へ渡す。
- 将来の配布版はlauncherで`app.getPath('userData')`配下を選択できる。本格移設は今回未実施。
- Browser/Electronの既定ファイルは別。異なるServerによる同一fileへの同時書込みは非対応。
- Production起動時の接続先はsettingsが正本。未作成時はschemaの簡単接続defaultを使用し、環境変数の接続先への暗黙fallbackはしない。

## schema v1

```json
{
  "version": 1,
  "general": {"startup_screen": "start", "reuse_model": true},
  "model": {
    "connection_mode": "lm_studio_simple",
    "lm_studio_base_url": "http://127.0.0.1:1234/v1",
    "selected_model": null
  },
  "ui": {"send_key_mode": "safe", "right_sidebar_open": true, "minimap_mode": "detail"},
  "profiles": {"system": {"preset": "off"}, "user": {"preset": "off"}}
}
```

Customのみ`{"preset":"custom","custom_text":"..."}`。fixed presetにcustom_textは不可。
miniMAPは現行コードとの互換を保ち`detail / overview`を使用する（依頼文中のfullは既存のoverview相当）。

## 保存・非保存対象

保存: Applied System/User preset、Custom本文、接続確認成功済mode/URL、明示選択model ID、send key、起動方針、reuse model、明示Sidebar開閉、miniMAP表示形式。

非保存: Profile/URL/接続modeのdraft、models一覧、接続状態、error、in-flight、Developer 3 toggle、scroll/popup/展開状態、Quick Memo、辞書結果、Conversation/Turn/Highlight/Question Keep/GenerationRun/request_snapshot/Marker reference、credential関連項目。

## Store / API / validation

`src/shared/settings.ts`: versioned型、defaults、Profile再構築、selected model照合。
`src/server/settings.ts`: load/get/update/validate、部分更新の直列化、既知fieldによる再構築。

- GET `/api/settings`: `{settings,warnings}`。
- PATCH `/api/settings`: general/ui/profiles、model.selected_modelの部分更新。
- model接続mode/URLはPATCHで変更不可。既存POST `/api/model-connection/apply`のみ使用。
- Host / Origin / JSON content type / request size制約を維持。
- 書込みのunknown fieldは拒否。読込みのunknown fieldは破棄。
- version/enum/booleanを厳密検証。Custom最大20,000、model ID最大300、URL最大2,048文字。NUL拒否。
- URLは既存normalizeLMStudioBaseUrlを再利用。簡単modeでは既定URLのみ。
- file/API object最大262,144 bytes。
- 同一Server内のpatchはqueueで直列化。接続適用も別queueで順序を保持。
- 同一directoryのunique temp fileをwxで作成、write、sync、close、renameで置換。失敗時にtempを掃除し、メモリ値も更新しない。

## Profile / UI / hydration

settingsの読込み完了前には保存しない。SettingsShellはhydration後にmountし、復元Appliedとdraft初期値を揃える。
Applyは非同期保存成功後にAppのAppliedを更新。失敗時は未保存表示、Applied維持、draft保持。
固定本文はshared preset定義から再構築し、settingsへ複製しない。自由記述は既存の改行・trim正規化と整合させる。

send key/Generalは明示変更時、Sidebarは開閉ボタン時のみ保存。Quick辞書/メモの自動openは表示だけ変更する。
miniMAP modeをAppまで引き上げ、会話切替・reload後も保持する。測定値/openは保存しない。
Developer設定は従来どおりセッション限定、初期値OFF。

`startup_screen=last`は最新updated_atのConversationを開く。最後に閲覧したIDの追跡は追加していない。会話なしならStart Screen。

## Model復元・適用

新接続は候補Providerでmodels取得成功 → 正規化mode/URLをsettings保存 → Runtime Provider交換。
接続または書込み失敗時は保存値/Providerを維持する。空の正常models応答は接続成功・未選択として扱う。

Server起動時に保存URLのProviderを構成し、Client hydration後に現在の接続設定取得とmodels再取得を行う。保存されていても接続済み扱いしない。
Profile/UIの復元はLM Studio応答待ちから独立。

- reuse_model=trueかつ保存IDが一覧内: 復元。
- 保存ID不在: 未選択＋警告。先頭への自動切替なし。
- reuse_model=false: 自動復元しない。
- 通信失敗: 未選択・接続不可。保存IDを削除せず、既定接続先へ暗黙fallbackしない。
- 保存IDをモデル確認前の送信可能な選択として使わない。ChatにもgenerationReady guardを追加。

## 破損と将来version

- missing: default、警告なし。起動だけではfile作成しない。
- corrupt JSON / oversized file / unknown version / 読込み失敗: default＋警告、元file維持。
- この場合はそのServerの保存を拒否し、利用者がfileを退避/修復して再起動するまで自動上書き・downgradeしない。
- invalid値: その設定単位のみdefault。接続mode/URL、Profile preset/本文はそれぞれ一組。
- unknown field: 読込み時は無視、次の正常書込みでは既知項目だけ保存。
- 書込み失敗: 元fileとAppliedを維持し未保存通知。

version判定をload境界に集約。v2以降が必要になった時に変換関数を追加できる。汎用migration frameworkとDB migration連動は作らない。

## Secret / Generation / Quick Memo境界

OpenAI APIはdisabled。api_key / token / Authorization / credential / secretのfieldは追加せず、未知keyも保持しない。
Custom自由記述へ人が秘密を書いた場合まで自動検出する保証はしない。

GenerationRun identity、canonical system、request_snapshot構造、Run開始時Provider capture、streaming、model request body、Conversation DB schemaは変更しない。
Base URLやcredentialをsnapshotに追加しない。Quick Memoは既存Markdown storeのまま。
新規Conversation時Profile確認、Custom履歴、cloud同期は未実装。

## 自動テスト

新規`tests/settings.test.ts`:
missing/default、save/load、fixed/custom復元、atomic overwrite、置換失敗後の旧file/temp掃除、破損/unknown version保全、unknown key除去、invalid値の単位fallback、NUL/enum/boolean/size/credential拒否、並行patch直列化、保存失敗、model照合、接続失敗/保存失敗のProvider保持、APIによる接続確認迂回拒否、Origin拒否。

新規`tests/settings-hydration.test.ts`:
App実体をJSDOMへmountし、GETを遅延。hydration前writeゼロ、Applied/draft一致、送信キー/Sidebar/startup復元、モデル取得前未選択、simple/advanced/Z690（mock）/不在/reuse OFF/offline、再mount時再確認、draft未保存、Apply保存失敗時Applied維持を確認。

既存UIテストで手動Sidebar保存値と辞書/メモ自動openの分離を検証。Electronテストで独立pathとchild注入を確認。session-only表記の期待値のみ新仕様へ更新。

最終実行結果:

- Settings/Model/UI/Start Screen/Electron focused: 27 PASS / 0 FAIL。
- `npm test`: 391件中389 PASS / 2 SKIP / 0 FAIL。SKIPは既存のS1実モデル/S2実workerの明示opt-inテスト。
- `npm run typecheck`: PASS。
- `npm run build`: PASS。
- `git diff --check`: PASS（既存CRLFに関するGit警告はあり、whitespace errorなし）。
- full testログ: `.cache/settings-pre2-test.log`。
- 初回sandbox内ではlocalhost EACCES / rename EPERMが出たため、該当テストと全体回帰は承認済み制限外実行で検証した。

## 実ブラウザ・実プロセス検証

通常ユーザーDBを使わず以下で実施。

- Browser backend: 5199、`.cache/settings-pre2-browser.sqlite` / `.cache/settings-pre2-browser.json` / 隔離Memo。
- Electron: frontend 5196 / backend 5197、`.cache/settings-pre2-electron.sqlite` / `.cache/settings-pre2-electron.json` / 隔離Memo。
- Z690 `/v1/models`は10秒timeout。Z690実ネットワーク成功は未確認。正規化・保存・復元はmockで検証。
- ローカルLM Studio `http://127.0.0.1:1234/v1`が利用可能だったため、詳細modeで接続確認・保存。
- 実UIで`qwen3.5-0.8b`選択、System=簡潔、User=Custom本文、Enter送信、startup=last、Sidebar閉、miniMAP=overviewを保存。
- renderer reload後、会話画面/Sidebar閉/model ID/Profile編集欄が復元。
- backend停止・同じpathで再起動後も復元。Enter送信で実モデル生成1回成功、応答「確認OK」。
- 隔離Run APIでoutcome=succeeded、canonical system 1件、Custom Profile本文反映、snapshotへのbase_url非混入を確認。
- 証跡画像: `.cache/settings-pre2-browser-proof.png`。
- 実生成Run: `4fb8d627-097a-4ec3-8920-b0ed7704f665`、finish_reason=stop、生成時間4,623ms、completion_tokens=3。
- Electron launcherを実起動し、起動した共通Web UIをIABから開いてSystem=思考支援/User=実務を保存。reloadおよびElectron/childプロセス停止・再起動後の復元を確認。Browser側の設定と分離されている。

### 実機確認の制限

Electronネイティブ画面はComputer Useで黒画面、前面化APIは`GetCursorPos failed: アクセスが拒否されました (0x80070005)`。
そのためElectronウィンドウ自身へのクリック/reload操作の証拠はない。上記Electron確認は実launcher/child再起動と、同じVite UI/APIをIAB経由で検証したもの。ネイティブ画面の目視操作を完全PASSとは扱わない。

検証用Server/Electronプロセスは停止済み。隔離DB/settings/Memoと画像は`.cache`に残し、通常ユーザーのDB/settingsには書き込んでいない。
