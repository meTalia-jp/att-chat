# Att-Chat Model Connection Implementation v1.0-pre.1

## Scope

Settingsの既存「モデル」画面へ、LM Studioの簡単設定と詳細設定を接続した。OpenAI APIは入口だけを表示し、未対応・選択不可とした。BrowserからLM Studioへ直接接続せず、既存の`Client -> Att-Chat Server -> GenerationService -> LMStudioProvider`を維持している。

DB schemaとmigrationは変更していない。接続設定はserver process内とReact session stateだけで保持し、永続化していない。

## LM Studio 簡単設定

- 初期接続先は`http://127.0.0.1:1234/v1`。
- Base URL入力欄は表示しない。
- 既存のモデル一覧更新とモデル選択を使用する。
- 詳細設定から簡単設定へ戻すと、候補Providerで`/models`を確認してから初期接続先を適用する。

## LM Studio 詳細設定

- 詳細設定を選んだ場合だけBase URL入力欄と「接続確認」を表示する。
- `draftBaseUrl`は入力中の候補、`appliedBaseUrl`は実際に使用中の接続先として分離した。
- 接続確認は候補URLで新しい`LMStudioProvider`を作り、既存の`models()`が成功した場合だけGenerationServiceへ適用する。
- validation失敗、HTTP失敗、response schema不正、redirectでは現在のApplied Providerを維持する。
- `/api/models`と`/chat/completions`は同じApplied Providerを使用する。

## OpenAI API

「OpenAI API（未対応）」をdisabled optionとして表示する。API key、token、Authorization header、credential保存、OpenAI用backend routeは追加していない。

## Base URL validation

Server側の`normalizeLMStudioBaseUrl`を正本とした。

許可するもの:

- `http`のみ
- 明示されたport
- localhost、loopback IP、private/link-local IP
- `Z690`のような単一ラベルLAN hostname
- `.local`、`.lan`、`.home.arpa`

拒否するもの:

- `https`、`ftp`、`file`、`data`等
- userinfo
- query、fragment
- portなし
- public IPv4と一般的な公開domain
- redirect追従

この境界はVer1.0のローカル/LAN LM Studio接続用であり、外部OpenAI-compatible providerの一般化ではない。

## Runtime adapter

`LMStudioConnectionRuntime`を薄いsession-only adapterとして追加した。既存`LMStudioProvider`を再利用し、Provider registryや別Provider classは導入していない。

GenerationServiceは各Runの`execute()`開始時にProvider instanceをcaptureする。接続設定を変更しても進行中Runは元のProviderを使い、次のRunから新しいProviderを使う。

## request snapshot

`GenerationRun.request_snapshot`は従来どおり実際のProvider request bodyである。今回の実機Runでも`model`、`messages`、`stream`、`max_tokens`、`stream_options`だけが保存され、Base URLは保存されていない。

## Z690実機確認

2026-10-11に隔離DB `.cache/model-connection-v1-pre1.sqlite` で確認した。

1. hostname `Z690`が解決され、TCP 1234への接続に成功した。
2. Settingsで「LM Studio 詳細設定」を選択した。
3. `http://Z690:1234/v1`を入力して接続確認した。
4. `/v1/models`から14件を取得し、model selectorへ反映した。
5. `qwen/qwen3.5-9b`を選び、通常Chatから1回だけ送信した。
6. streamingが`finish_reason=stop`で完了した。
7. User TurnとAssistant Turn「Z690 接続成功」がcompletedとして隔離DBへ保存された。
8. GenerationRunは`succeeded`、prompt tokens 29、completion tokens 322、Assistant本文9文字だった。
9. DBの`request_snapshot.messages`と送信したUser本文が一致し、Base URLを含まないことを確認した。

通常ユーザーDBは使用していない。

## Tests

追加したfocused coverage:

- 簡単設定の初期表示とBase URL非表示
- 詳細設定の条件表示、draft/applied分離
- `http://Z690:1234/v1`許可
- unsafe URL、HTTP失敗、redirect拒否とApplied保持
- Applied URLでの`/models`と`/chat/completions`
- Run開始時Provider capture
- OpenAI option disabled、credential入力なし
- Start Screenの既存model/status表示
- 共通model controlsを使うNormal Chat、Keep Context、Simple Marker Chatの回帰

最終結果:

- `npm test`: 382 total / 380 pass / 2 skip / 0 fail
- `npm run typecheck`: PASS
- `npm run build`: PASS
- `git diff --check`: PASS

## Session-only behavior

接続方式、Base URL、選択モデルはDBへ保存しない。Browser reloadでは稼働中serverのApplied Providerを再取得できるが、server process再起動後は環境変数または既定の簡単設定へ戻る。

## Not implemented

- OpenAI API実接続
- credential管理
- remote internet provider
- generic Provider factory
- 接続設定の永続化
- model download / start control
- generation parameter UI
