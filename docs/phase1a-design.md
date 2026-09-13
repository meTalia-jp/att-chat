# Phase 1A 保存基盤の設計

実施日: 2026-09-12。基準コミット: `5c9658ed3993a164d5aeee33f362a8714fd46831`。

## 構成

```text
React / TypeScript UI
  → HTTP API（127.0.0.1:5181、ビルドUIも配信）
    → Repository
      → SQLite（data/attchat.sqlite）
```

Phase 0契約、experiments/selection-poc、既存Phase 0文書は変更しない。本体はrootのpackage.jsonとsrcから動作し、sample/やPoCの実行時importを持たない。CSSは最小限の配置だけ。

SQLiteはNode.js標準のnode:sqlite / DatabaseSyncを使用する。[Node.js公式SQLite資料](https://nodejs.org/api/sqlite.html)。外部ネイティブパッケージのビルドを不要にする選択。検証したNode.jsは24.19.0であり、他のメジャー版は保証対象外。同期DB APIなので長時間の大量処理は将来の課題。

## スキーマ

SQL本体: `src/server/storage/migrations/001_initial.sql`。

| テーブル | 主な列・制約 |
|---|---|
| schema_migrations | version主キー、checksum、applied_at |
| conversations | conversation_id主キー、title、created_at、updated_at |
| turns | turn_id主キー、conversation_id外部キー、sequence_no、role、content、status、created_at、finalized_at |
| generation_runs | run_id主キー、conversation_id、user_turn_id、assistant_turn_id、retry_of_run_id、kind、model_id、provider、context_strategy、strategy_version、request_snapshot、started_at、finished_at、outcome、error |

turnsは `(conversation_id, sequence_no)` 一意、sequence_noは0以上。並び順にIDや作成日時を使わない。`(turn_id, conversation_id)` の複合参照により、Runが他会話のTurnを参照することをDBでも拒否する。user_turn_idのroleとcompleted状態、assistant_turn_idのrole、retry元の会話とUserの一致をINSERTトリガーで確認する。assistant_turn_idはRun間で一意。

JSON列はTEXTとして保存し、SQLiteのjson_valid/json_typeでオブジェクトであることを検証。Repositoryから返す際にJSONオブジェクトへ戻す。SQLはバインドパラメータを使用する。

## 不変性

- completedは1発言の確定状態。本文は保存前にCRLF/CRからLFへ変換する。
- DBにもCR禁止制約があり、確定後に文字列正規化しない。UTF-16位置を使う将来のHighlightと整合する。
- 更新API・Repositoryの更新メソッドは提供しない。さらに確定済みTurnへのSQL UPDATEをトリガーで拒否する。
- cancelled/failedも終了後の発言として同じ更新禁止に含める。
- generatingのID、role、conversation、sequence、created_atも変更を禁止する。ただし生成中更新処理そのものは今回は実装していない。
- 再試行は同じUser発言を参照し、新しいAssistant Turn IDとRun IDで追記する。旧本文・旧snapshotは保持。

## 保存トランザクション

Repositoryの書き込みはBEGIN IMMEDIATE→操作→COMMIT。例外はROLLBACKして呼び出し元へ返す。sequence_noは同じトランザクション内でMAX+1を採番する。

仮Assistant追加では、Userの参照を検証し、Assistant Turn、会話の更新日時、GenerationRunを一括保存する。Run INSERTに失敗した場合、Assistantと会話更新も取り消す。成功レスポンスはCOMMIT後だけ返す。

Phase 1Aでは外部生成がないため、mock Runは開始から確定まで同一トランザクションで完了する。`provider=mock`、`model_id=mock-fixed`、`kind=mock`、`context_strategy=mock_single_user`、`strategy_version=1`。request_snapshotには対象User本文と指定した仮回答を保存し、実モデル通信と誤認させない。

Runのoutcomeスキーマはpreparing/running/succeeded/failed/cancelled/interruptedを用意するが、現在の公開保存経路はsucceededの仮Runのみ。DB保存失敗はRun自体もロールバックするため、その失敗を同じDBへ保存できたとは扱わない。エラーはHTTPとUIへ返す。将来の通信エラー記録や進行中Runの状態更新はPhase 1B以降のmigrationで扱う。

## migration・永続化

- 初回起動で001を自動適用。migrationテーブル作成、DDL、適用記録を一つのトランザクションに含める。
- 再起動時は適用済みversionとSHA-256 checksumを検証し、同じmigrationを重複適用しない。
- checksumはLF正規化したSQLから計算し、Windowsの改行変換だけでは不一致にならない。
- 未知版・checksum不一致・適用エラーは起動拒否。既存DBを削除・初期化して回避しない。
- foreign_keys=ON、journal_mode=WAL、synchronous=FULL、busy_timeout=2000ms。
- DB接続失敗は起動失敗。メモリDBへの暗黙fallbackなし。
- 通常起動パスはプロジェクト基準で一定。再起動でConversation一覧をDBから取得し、最新の会話を表示する。最後に選択した会話のUI状態保存は未実装。

## API

| メソッド・パス | 処理 |
|---|---|
| GET /api/conversations | 会話一覧 |
| POST /api/conversations | titleから会話作成 |
| GET /api/conversations/:id | 会話・順序付きTurn・Run取得 |
| GET /api/conversations/:id/turns | Turn一覧 |
| POST /api/conversations/:id/turns | contentからcompleted User Turn追加 |
| POST /api/conversations/:id/mock-runs | user_turn_idとcontentから仮Assistant＋Run保存 |
| POST /api/conversations/:id/runs/:run_id/retry | contentで新Assistant＋Runを保存 |

入力不正は4xx、DB失敗は500、ロックは503。想定外エラーの内部SQLや本文をレスポンスへ出さない。ローカルHost/Originを限定し、API本文は256KiB、本文文字列は100,000 UTF-16単位、会話タイトルは200文字を上限にする。

## UIの成功・失敗

保存処理中は操作を無効化する。POSTが成功してからDBを再取得し、その後に成功メッセージと入力クリアを行う。エラー時は成功メッセージを消して入力を残す。通信失敗やCOMMIT後の読込失敗では保存結果が不明になり得るので、再読込を案内する。自動再送・楽観的な完了表示は行わない。

## 今回の範囲外

LM Studio、streaming、モデル選択、Question Keep、Mode B、miniMAP、Highlight移植、複合出力。Turn編集・削除API、会話削除、認証、複数ユーザー、ネットワーク公開も実装しない。
