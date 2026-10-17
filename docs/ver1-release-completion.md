# Att-Chat Ver1.0 Release Completion

- Version: `1.0.0`
- Tag: `v1.0.0`
- Release commit: `d1bb567a67ee5b6c7ca44db2a33944ff20c45d1c`
- Public Release: <https://github.com/meTalia-jp/att-chat/releases/tag/v1.0.0>
- Release date: `2026-10-17`
- Repository: <https://github.com/meTalia-jp/att-chat>

## Public assets

| Asset | Size | SHA-256 |
|---|---:|---|
| `Att-Chat-v1.0-win-x64.zip` | 484,238,137 bytes | `81e2fe5172d71c7dcc5c61e9244c1c232b004365944777c5b7c5f9d2bded91b4` |
| `Att-Chat-v1.0-runtime-source.zip` | 1,829,801,983 bytes | `125a6b94c9b01340d193d6863d60ad8531b690a3b273129837102ac855ea34c9` |
| `SHA256SUMS.txt` | 191 bytes | `0843931f342aa29a4d09a795bf807fc575af4b14d1083c6823316bf7df4cce0d` |

Windows binary、対応するruntime source、checksumを同じGitHub Releaseで公開した。公開URLから3 assetを再downloadし、local確定物とのsize・SHA-256一致、公開SHA256SUMSによる両ZIP検証、両ZIPの必須内容を確認した。

## Final validation

| Check | Result |
|---|---|
| `npm test` | 423 total / 421 pass / 2 skip / 0 fail |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |
| Packaged Electron smoke | PASS |
| Public license audit | PASS |
| Public asset re-download | PASS |

Packaged smokeではrepository外起動、bundled Node、SQLite、Settings、Collections、Quick Memo、GenerationRun、EJDict、single instance、restart、正常shutdownを確認した。

## Known non-blocking notes

Packaged smoke終了時にChromium GPU診断ログが2行出力された。process exitは0で、backendとchild processはいずれも正常shutdownしており、公開を妨げる問題ではない。

## Ver1.0.x maintenance policy

`maintenance/v1.0.x` はAtt-Chat 1.0系列の保守専用branchで、公開済み`v1.0.0` commitを基点とする。`master`は今後の通常開発線として継続し、`v1.0.0` tagは不変の公開基準点として保持する。

保守branchで許可する変更:

- blocker bug fix
- crash fix
- data loss fix
- packaging fix
- license / notice fix
- security fix
- 明確な互換性修正
- 小規模な表示崩れ等

原則として含めない変更:

- 新しい大型機能
- DB schemaを大きく変える機能
- UI全面変更
- 実験的LAB機能
- 次期設計変更
- architecture変更

次期機能は`master`側で行う。maintenance側で修正した重要fixは、必要に応じて`master`へcherry-pickまたは同等修正で反映する。`master`の新機能をmaintenanceへ逆流させない。

## Versioning policy

- `v1.0.0`: initial public release
- `v1.0.1`, `v1.0.2`, ...: bug fix、packaging、license等の保守更新
- `v1.1.0`: 後方互換の機能追加
- `v2.0.0`: 大きな互換性変更

Semantic Versioningの基本的な意味として、PATCHは保守、MINORは後方互換の機能追加、MAJORは大きな互換性変更を示す。

## Local verification copy

公開後検証用コピーは `D:\att-chat-release-verify\published-v1.0.0` に保持している。Git管理対象ではなく、GitHub public assetとのhash一致確認済みである。正本はGitHub Release assetであり、ローカル容量が必要になった時点で削除できる。自動削除は行わない。
