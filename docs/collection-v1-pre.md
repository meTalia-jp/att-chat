# Collection Implementation v1.0-pre

実装・検証日: 2026-10-12。commit / push / tagは実施していない。

## 範囲

Conversation一覧を整理する仮想Collectionを追加した。Conversation DB schema、migration、Repositoryのデータ操作は変更していない。作成・名前変更・所属設定（別Collectionへの移動を含む）・所属解除・Collection削除の5操作を提供する。

Conversationは未所属または1つのCollectionに所属する。Collection操作はConversation、Turn、Marker、Keep、GenerationRunを変更しない。Conversationのupdated_atも変更しない。Collection削除は定義と該当membershipだけを削除する。

## Schema・責務

```json
{
  "version": 1,
  "collections": [{ "id": "server-generated-uuid", "name": "Att-Chat開発" }],
  "membership": { "conversation-id": "server-generated-uuid" }
}
```

Collection IDはserver側のrandomUUID。定義配列は作成順。membershipはConversation IDからCollection IDへのmap。タイトルは保存せず、全Conversation一覧の現在値を表示する。所属先変更はmapの値を置換する。Conversation順は既存一覧のupdated_at DESC / conversation_idを維持する。

- `src/shared/collections.ts`: 型とSidebar分類関数。
- `src/server/collections.ts`: 独立CollectionStore。load/get/create/rename/assign/unassign/deleteCollection。
- `src/server/atomic-file.ts`: SettingsStoreから小さく抽出したatomic write。Settings側の既存exportは互換性のため維持。
- `src/client/CollectionSidebar.tsx`: Sidebar表示と操作。
- `src/server/http.ts`: 共通API。

settings.jsonにはCollectionデータを入れない。名前はtrim、1〜200文字、制御文字を拒否。同名はtrim後の完全一致で拒否する。ファイルの上限はUTF-8で4MiB。version、構造、重複ID・名前、membership型を検証する。

## 保存先・Browser / Electron差

| 起動 | 既定保存先 | 上書き環境変数 |
|---|---|---|
| Browser向けserver | `data/collections.json` | `ATTCHAT_COLLECTIONS` |
| Electron dev | `.cache/electron-collections-v1.json` | `ATTCHAT_ELECTRON_COLLECTIONS` |

Electron runtimeが専用pathを生成し、backendへATTCHAT_COLLECTIONSとして注入する。Store/APIは共通。ブラウザー側localStorageへの保存はしない。

将来の配布版ではuserData/collections.jsonを起動側で指定する想定だが、今回userDataへの移行は実装していない。

DBとCollectionファイルは対で運用する。DB pathを変更するときは対応するCollection pathも指定する。同一ファイルを複数プロセスで書き込む運用は非対応。既定pathはBrowser/Electronで分離しているが、明示的な環境変数上書きで同じpathを指定しないこと。

## 保存・破損・孤立参照

- Store内queueで変更を直列化。最新状態から変更内容を作る。
- 同一ディレクトリへUUID付き一時ファイルをwxで作成、write、sync、close、renameで置換。
- 保存成功後にのみメモリの正本を更新。置換失敗時は旧状態を保持し、一時ファイルを片付ける。
- missingは空の編集可能なStore。
- corrupt、未知version、読込不能は空の表示用状態と非致命的警告を返し、writable=falseで編集を停止。元ファイルは上書きしない。
- DBにないConversation、定義のないCollectionへのmembershipはGETの有効表示から除外し警告する。
- 孤立membershipは起動時も、無関係な通常書込み時も自動削除しない。別DBへ一時切替した場合の情報損失を避ける。
- Collection削除はそのCollectionへのmembershipを明示的に削除する。将来のConversation物理削除や孤立参照の管理機能は対象外。

## API

| Method | Path | 入力・応答 |
|---|---|---|
| GET | `/api/collections` | 200: `{data,warnings,writable}` |
| POST | `/api/collections` | `{name}`、201: 同上 |
| PATCH | `/api/collections/:id` | `{name}`、200: 同上 |
| DELETE | `/api/collections/:id` | JSON `{}`、200: 同上 |
| PUT | `/api/collections/:id/conversations/:conversationId` | JSON `{}`、200: 同上 |
| DELETE | `/api/collections/:id/conversations/:conversationId` | JSON `{}`、200: 同上 |

全変更APIで既存のJSON body検証を使用し、未知フィールドを拒否する。既存Host/Origin制約を維持。assignはCollectionとConversationの存在をサーバーで確認する。不明IDは404、同名は409、破損による編集停止は503。解除時に所属先がすでに別Collectionなら変更しない。

## UI

- 会話タブ内に「未分類」「コレクション」を表示する。新規チャットボタンは既存どおり。
- Appは全Conversation一覧を保持する。Sidebarだけ分類関数による派生表示。
- Collection見出しの＋からinline作成。Collection行の⋯から名前変更・削除。
- inline編集はEnter保存、Escape取消、空文字保存不可、trim。保存失敗時は入力を保持して警告する。
- 会話行の⋯ → コレクションへ移動 → selectで所属先を指定。
- 所属会話の⋯ → コレクションから外す、で未分類へ戻る。
- 削除確認文は「コレクションを削除します。会話は削除されず、未分類に戻ります。」。削除する／取消を表示。
- 展開状態はcomponentのsession stateだけで管理し、ファイル保存しない。選択会話の所属先は自動展開する。画面の再mount時は展開状態を作り直す。
- 分類操作で現在選択中のConversationを変えない。
- Start Screenの最近の会話、startup last、Handoffには全Conversation一覧を渡す。lastは従来どおり最新updated_atの会話。
- 破損警告はStart ScreenとSidebarに表示。会話の閲覧は継続できる。

## 自動テスト結果

最終確認:

| コマンド | 結果 |
|---|---|
| focused: collections / start-screen / settings-hydration / settings / electron-skeleton | 25 PASS、0 FAIL |
| `npm test` | 398件、396 PASS、0 FAIL、2 SKIP |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS（既存ファイルのCRLF→LF予告のみ） |

skipは既存のS1実モデル契約、S2実worker別プロセスのopt-inテスト。全体テスト初回はsandboxのlocalhost接続EACCESで失敗したため、許可を得て同一コマンドを制限外で再実行した。

新規`tests/collections.test.ts`で5操作、単一所属と移動、古い解除要求、再load、不明ID、欠落・破損・未知version、孤立参照の保全、atomic置換失敗、旧メモリ保持、queue回復、API安全策、会話・Turnの保持、schema不変、updated_at不変を検証した。

既存UIテストへSidebar分類、Conversation rename反映、inline取消・空文字拒否、破損時編集停止を追加。settings-hydrationでは分類済み最新会話をstartup lastで開くこと、Start Screenへ含めることを検証。Electronテストへ既定／上書きpathとbackend注入を追加。

100件／1000件の分類処理を簡易計測。focused実行ではそれぞれ約0.036ms／0.141ms。件数・重複なし・全一覧保持も検証した。これは分類関数だけの単発計測で、1000行の実Browser描画や長文会話読込の性能保証ではない。

全体ログ: `.cache/collection-v1-tests.log`。

## Browser実機確認

通常データを使わず、`.cache/collection-v1-browser/`配下にDB・settings・collections・Quick Memoを分離し、実serverとbuild済みUIをport 5193で起動した。サンドボックス内serverにはBrowserから接続できず、許可を得て隔離pathのまま制限外で再起動した。

確認済み:

1. 新規会話を作成。
2. 空白付きCollection名をinline入力、Enterで作成。trimされた名前を確認。
3. 会話を移動。未分類から消え、所属先に表示され、選択会話を維持。
4. Collectionをinline rename。
5. 会話タイトルを変更し、Collection内の表示も更新。
6. reload後、Start Screenの最近の会話に所属会話が表示されることを確認。
7. 一般設定でstartup lastを選び、reload後に所属会話が開くことを確認。
8. backendを停止・同じpathで再起動し、reloadで所属と名前を復元。
9. コレクションから外し、未分類へ戻ることを確認。
10. 再所属させてCollectionを削除。確認文、会話保持、未分類への復帰を確認。

復元時の画面記録: `.cache/collection-v1-browser/restored.png`。

## Electron実機確認と未確認事項

Computer Useスキルを使用。`.cache/collection-v1-electron/`配下のDB・settings・collections・Quick Memo、frontend 5194／backend 5195で実Electronを起動。backend起動ログとElectronのStart Screenを確認した。

Windows入力のclickが`GetCursorPos failed: アクセスが拒否されました。 (0x80070005)`で失敗。ウィンドウを再取得して再試行しても同じだったため、Electron UIでの5操作・保存・アプリ再起動後の復元は未確認。Browserと同一API/Storeおよびpath分離は自動テストで確認済みだが、Electron実機の操作完了とは扱わない。

その他の未確認事項: 複数プロセス同一ファイル書込み、OSクラッシュ／電源断時の実機耐久性、1000会話のBrowser描画性能。これらに対する追加機能は今回実装していない。

## 対象外

DB schema変更、migration、Conversation物理削除、Archive、複数所属、drag&drop、入れ子、手動並べ替え、Collection検索、Embedding連携、Report、Cloud syncは追加していない。
