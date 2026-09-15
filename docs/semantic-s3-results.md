# S3 検証結果

基準commit `4d0312f19e82181c21a61a5051d8e9d4f7aea4e1`。S3合格。コミット/push/tagは行わず、S4以降へ進まない。

## Tests

通常suite: 153 PASS / 2 SKIP / 0 FAIL（155件）。既存138 PASSを維持し、S3の15件を追加。skipは既存S1/S2の実モデル専用test。

Q1/Q2・grapheme、query purpose、same space ready/self除外、different space、pending/failed/stale/missing、Role/current/all、top_k/不正条件、決定的同点順位、cosine/thresholdなし、unresolved/会話所属、Provider失敗/cancel/busy、HTTP DTOのvector非包含、Turn/Run不変、Turn Jumpを検証。生成中/failed/cancelledのready禁止と既存marker navigationはS2/2B回帰が継続PASS。

typecheck / build / git diff --check成功。モデル/runtimeの新規取得・package変更なし。

## 実DBコピーでのcoverage

元DBはreadOnly接続からSQLite backupを取得。コピーだけを007へmigrationし、既存S2 Indexerで索引生成。生成モデルによる新規回答や合成長文は追加していない。

| 元DB | コピー | total | ready | pending | failed | stale | missing | INPUT_TOO_LONG |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| data/attchat.sqlite | .cache/semantic-s3-audit/attchat.sqlite | 9 | 9 | 0 | 0 | 0 | 0 | 0 |
| data/phase3b2-ui.sqlite | .cache/semantic-s3-audit/phase3b2-ui.sqlite | 5 | 5 | 0 | 0 | 0 | 0 | 0 |

合計14件、超過率0%。DB間重複除去なし。小規模な開発・検証データなので利用者一般の長文率を代表しない。現時点でS2Cを追加する実測根拠はない。実利用coverageで無視できない超過が判明した時点で別Phaseを提案する。S2合成長文25%を実利用率として使っていない。

## Performance / Q1-Q2比較

Windows、Node24.19.0、S1と同じlocal CPU E5固定space。S2索引化後のwarm Providerによる1回ずつの簡易測定。モデルロード時間・HTTP時間・UI描画は下表に含まない。初回UI検索には追加モデルロードがある。

| DB / variant | 比較vector数 | load ms | query embedding ms | similarity+sort ms | total ms |
|---|---:|---:|---:|---:|---:|
| attchat Q1 | 8 | 1.388 | 2.422 | 0.326 | 4.688 |
| attchat Q2 | 8 | 0.916 | 2.544 | 0.040 | 3.795 |
| phase3b2 Q1 | 4 | 0.487 | 2.358 | 0.020 | 3.126 |
| phase3b2 Q2 | 4 | 0.497 | 2.340 | 0.019 | 3.146 |

全件scanはこの規模では問題なし。大規模ベンチマーク/ANN選定は未実施。

同じHighlight、space、All Conversations、top_k=5で比較。attchatではtop1は同じでscoreは0.8650→0.8958、top5の重なりは4/5。phase3b2では4候補すべて順位一致、top1は0.92765→0.92776。Q2で周辺情報が加わると順位やscoreが変わることを確認しただけで、score上昇を精度改善とは判定しない。元データは短い検証用引用で、意味検索の品質ベンチマークではない。Q1/Q2とも未採用確定。

測定再現:

```powershell
node --experimental-strip-types scripts/semantic-search-audit.ts .cache/semantic-s1 .cache/semantic-s3-new-audit data/attchat.sqlite data/phase3b2-ui.sqlite
```

出力先は新規ディレクトリ/未存在DBが必要。元DBを変更せずコピーを作る。measurements.jsonはID/順位/score/件数/時間だけ、本文/vectorはログ出力しない。実測JSONとDBコピーはgitignore対象の.cacheに保存。

## 実ブラウザ

コピーattchat.sqliteをポート5186で起動し、In-app Browserで確認。

- 既存マーカー「日本語AB」からRelated Turnsを開く。
- Q1 / Current Conversation / All / top_k5で同会話3件を表示。self Assistant除外。
- 同会話User #0へのJumpで対象Turnがfocus。
- Q2 / All Conversationsで別会話「test」の結果を表示。
- 別会話User #0へJumpし、会話見出しと対象Turn focusが一致。
- 元会話へ戻り既存「このマーカーへジャンプ」が正しいマーカーをfocus。
- Assistant限定・top_k1でAssistantのみ1件表示。
- coverage 9/9、pending/failed/stale/missing/INPUT_TOO_LONG各0を表示。スクリーンショットでもパネル表示を確認。

実APIと同じ経路の自動testで結果の9フィールドを厳密確認し、vectorを返さないことを確認。検索は生成APIへ接続しない。既存Chat/Keep送信の回帰は通常suiteで検証し、実ブラウザから新しいLLM質問は送っていない。

## 変更・保全・制限

追加: src/shared/semantic-search.ts、src/semantic/search.ts、search-query.ts、search-runtime.ts、src/client/RelatedTurns.tsx、turn-navigation.ts、scripts/semantic-search-audit.ts、tests/semantic-search.test.ts、本設計/結果文書。
変更: src/semantic/index-repository.ts（候補取得メソッド追加のみ）、src/server/http.ts/main.ts（検索API/Service接続）、src/client/MarkedTurns.tsx/main.tsx/style.css（検索panel/Turn Jump）。

migration001〜007、embedding schema、S0/S1仕様、S2 worker/indexer/lease/retry、GenerationService、LMStudioProvider、Chat.tsx、Keep送信、quote_question_only、Mode B PoC、RpenProof/selection-poc、packageは無変更。RpenProof72ファイル変更0件。元data配下16ファイルの前後SHA256一致。

制限: full scan/候補保持は大規模未検証、query用モデルの追加RAM、native cancel即時停止不可、coverageと結果は全体DB snapshotとして固定しない。Q2周辺はraw Markdown。検索query自体の上限超過も拒否。検索結果は永続化せず、条件変更/画面移動で消える。scoreは確率でも信頼度でもない。検索結果をLLMへ自動投入する機能はない。
