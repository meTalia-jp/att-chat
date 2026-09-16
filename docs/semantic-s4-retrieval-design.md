# S4 Read-only Retrieval 設計

基準: `cc7ac3b72c31b5f3845ac072504341d2f3c199ea`。S4は、指定Turnと同一Conversation内の前後Turnを読むための共通基盤である。取得結果をLLMへ送らず、GenerationService、通常Chat、Question Keep、Semantic Searchの順位付けには接続しない。

## Architecture

`Related Turn / turn_id → RetrievalService → RetrievalRepository → SQLite → Retrieval DTO → Turn Context UI`。

RepositoryはSQLと行取得だけを担当し、Serviceは入力検証、completed-only規則、Conversation整合性、DTO投影を担当する。BrowserはSQLを扱わない。HTTPは次のGET APIだけを公開する。

- `GET /api/retrieval/turns/:turnId`
- `GET /api/retrieval/turns/:turnId/context?before=1&after=1`

両APIはSELECTだけを実行する。アクセス履歴やRetrieval結果をDBへ保存しない。Embedding vector、内部索引状態、DB管理列は返さない。

## getTurn

`turn_id`を一意に検索し、所属Conversationも確認する。返す情報はconversation_id/title、turn_id、sequence_no、role、completed status、content、created_at、completed_atである。Turn不在は`TURN_NOT_FOUND`、Conversation欠落は`CONVERSATION_INCONSISTENT`、completedでないTurnは`INCOMPLETE_ANCHOR`として区別する。

completed Userとcompleted Assistantを取得できる。generating、failed、cancelledはanchorにできない。completed判定ではstatusとfinalized_atの両方を確認する。

## getTurnContext

before/afterは省略時1、最小0、最大10の安全な整数である。負数、小数、最大超過、文字列、重複query、未知queryを拒否し、暗黙にclampしない。

anchorと同じconversation_idに限定し、completed Turnだけを対象にする。anchorより小さいsequence_noから直前N件、anchorより大きいsequence_noから直後N件を選び、最後にsequence_no昇順で返す。数値の連続性は要求せず、`0, 1, 4, 7`のanchor 4、before/after 1は`1, 4, 7`となる。Conversation先頭・末尾では存在する件数だけを返し、要求数と返却数をmetadataで区別する。

前、anchor、後は1つのCTE文で取得する。これにより両側を別SQLで読む場合より同一SQLite statement snapshotで一貫する。既存の`turns(conversation_id, sequence_no)`一意索引を利用し、新規索引やmigrationは追加しない。同じsequence_noは既存DB契約上発生しないが、決定性の補助としてturn_idも並び順へ含める。

DTOはanchorのturn_id/conversation_id/sequence_no/role、順序済みturns、before/afterのrequested/returned件数を返す。各TurnはgetTurnと同じ明示投影である。

## Read-only保証とエラー

RepositoryにはINSERT、UPDATE、DELETEを実装しない。テストではConversation、Turn、GenerationRun、Highlight、Question Keep、embedding_spaces、turn_embeddingsを取得前後で比較する。実DB性能測定もSQLiteのread-only接続を使う。

APIエラーは`TURN_NOT_FOUND`、`INCOMPLETE_ANCHOR`、`INVALID_WINDOW`、`CONVERSATION_INCONSISTENT`を構造化して返す。SQLite例外は入力エラーへ変換せず既存500処理に渡し、通常Chatの状態やoutcomeを変更しない。

## S3および将来機能との境界

S3 SemanticSearchServiceは「関連するTurnを見つける」責務を維持し、検索応答へ周辺Turnを混ぜない。Related Turns UIの「前後を見る」がS4 APIを別途呼ぶ。current/all scopeや類似度順位はS3のままであり、S4は指定済みturn_idだけを起点にする。

将来のContextAssemblerはRetrievalServiceのDTOを入力候補として利用できるが、S4はPrompt化、token budget、優先度、semantic ranking、LLM tool、GenerationRun保存を行わない。全文を返すため、将来LLM用途に接続する前に明示的な文字量/token量ポリシーが必要になる。黙ったtruncateは採用しない。

Att-Chatの共通循環は「マーカーを付ける → 疑問・メモ・考えを書く → AIへ投げる → 回答からさらに考える」である。将来Mode FrameworkによりStudy Mode等を同じ基盤で試せる可能性があるが、RetrievalServiceは特定Mode専用にせず、S4ではMode Frameworkを実装しない。

## UIと既知の制限

Related Turnsの各結果に「前後を見る」を追加する。anchorを明示し、before/afterを0〜10で変更し、要求数と返却数を表示する。同一Conversationにも別Conversationの検索結果にも使える。Turn切替やDB書込みは行わない。

最大21件のTurn本文を全文返すため、極端に長いTurnでは応答サイズが大きくなる。S4にはtoken/byte budget、ページング、取得履歴、全トランザクションをまたぐ長期snapshotはない。単一SQL文内の一貫性だけを提供する。性能測定は小規模な開発DBであり、大規模Conversationを代表しない。
