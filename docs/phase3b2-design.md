# Phase 3B-2 元Conversationから新Conversationへの分岐

基準コミット: `aa111b51441867d553228611572bd6e9aee80724`。

## 所属と保存

元Highlight / Question Keep / 元Turnはsource Conversationに残る。新しいdestination Conversationにsequence_no=0のcompleted User、sequence_no=1のgenerating Assistant、preparing Runを作成する。元Turnのコピー・移動は行わない。

`Repository.prepareChat`の分岐オプションで、元Keepとresolved Highlightを検証してから新Conversationを作る。Conversation / User / Assistant / Run / run_question_references / chat_requestsの6種の予約は同じBEGIN IMMEDIATEトランザクション内で保存し、どのINSERTが失敗してもすべてrollbackする。予約失敗では空Conversationもasked変更も残さない。

タイトルは「質問: 」＋確定質問の前後空白を除き、連続空白を半角スペース1個にした本文の先頭80 Unicodeコードポイント。LLMは使用しない。タイトルが同じでもConversation IDは別になる。

## API・通信

- `POST /api/conversations/:source_id/question-keeps/:keep_id/ask-new`: user_question / model / request_idを受け取り、新Conversationへ予約して共通NDJSON応答を返す。
- 既存 `/ask` は元Conversationに追加するPhase 3B-1の動作を維持する。
- `GET /api/conversations/:source_id/question-runs`: その会話のTurnを引用元とするRunを、分岐先を含めstarted_at・DB rowid順に取得する。Keep一覧で関連件数と最新結果を表示するために使用する。

ルートのsource_idとKeepの所属会話は一致必須。任意destination IDや任意snapshotを入力として受け付けない。質問の空・不正・長さ、モデル、request_idは既存検証を使用する。unresolved、dismissed、不存在・別会話のKeepでは予約を拒否する。

GenerationService / LMStudioProviderのファイルは変更しない。quote_question_onlyのsystem＋userの2 messagesをそのまま使う。色・メモ・通常履歴・前後Turn・contextBefore/Afterは送信しない。実際のbodyをrequest_snapshotへ固定し、同じオブジェクトをProviderへ渡す。

request_idのグローバル一意制約、destination Conversationのactive Run制約を維持する。さらに同一Keepのpreparing/running Runが別Conversationにあっても、次の予約を拒否する。Repository検査に加えmigration 006のINSERT triggerで検証する。終了後は同じKeepから元会話・新会話・別の新会話へ再質問できる。元Conversationが生成中の場合も従来のassertIdleにより分岐を拒否する。

## snapshotとmigration

`006_branch_questions.sql`は質問参照のINSERT検証triggerだけを差し替える。migration 001〜005、既存テーブルの列、既存Runの本文・snapshotは変更しない。

| 項目 | Phase 3B-1の同会話Run | Phase 3B-2の新会話Run |
|---|---|---|
| context_strategy | quote_question_only | quote_question_only |
| strategy_version | 1 | 2 |
| snapshot_version | 未設定（v1） | 2 |
| destination | Run.conversation_id | Run.conversation_id |
| source Conversation | Run.conversation_idと同一 | reference_snapshot.source_conversation_id |
| source Highlight | highlight_idおよび参照行のsource_highlight_id | 従来値に加えsnapshot.source_highlight_id |

新しい分岐snapshotは以下を保存する。

```json
{
  "snapshot_version": 2,
  "source_conversation_id": "元Conversation ID",
  "source_highlight_id": "元Highlight ID",
  "highlight_id": "元Highlight ID（既存キーを保持）",
  "source_turn_id": "元Assistant Turn ID",
  "start_offset": 0,
  "end_offset": 20,
  "source_text": "原文の範囲",
  "target_text": "画面の選択文字列"
}
```

strategy_version 2はpayloadの文脈追加を意味せず、source/destination分離を含む保存形式の版を表す。同会話で新たに質問するときもv1を維持する。既存v1にversionキーを追加したり、読み込み時に元JSONを書き換えたりしない。

006のtriggerではv1の同会話制約を維持し、v2についてはsource ID、Highlight ID、Turn ID、offset、source_text、target_textが実参照と一致することを検査する。履歴snapshotの更新・削除拒否triggerは005のまま。削除可能なKeep / HighlightへのFKを追加しないので、元マーカー・Keepを消しても分岐Runの出典は残る。Highlight 1:N Keep、Keep 1:N Runを維持する。

## 状態遷移

| 操作・結果 | destination | Run / Assistant | 初回の元Keep |
|---|---|---|---|
| 検証失敗・予約失敗 | 作成しない | 作成しない | pendingのまま |
| 一括予約成功 | 作成済み | preparing / generating | pendingのまま |
| 送信開始処理 | 維持 | running / generating | askedへ変更 |
| 正常確定 | 維持 | succeeded / completed | askedのまま |
| 通信・保存失敗 | 維持 | failed / failed（保存可能時） | askedのまま |
| 停止 | 維持 | cancelled / cancelled、部分本文保持 | askedのまま |
| 開始前の状態保存失敗 | 予約済み会話を維持 | failed / failed（保存可能時） | pendingのまま |
| preparingで再起動 | 維持 | interrupted / failed | pendingのまま |
| runningで再起動 | 維持 | interrupted / failed、checkpoint保持 | askedのまま |

startRunはsnapshotのsource_conversation_id（v1ならRun.conversation_id）で元Keepを再検証し、Run.runningと初回Keep.askedを同一トランザクションに保存する。askedから再質問するときはasked_atも含めKeepを更新しない。askedは送信開始処理であり、受信保証・回答成功の意味ではない。DB commitとHTTP間の停止窓はPhase 3B-1と同じで、自動再送しない。

## UI・既知の制限

元Keepに両方の質問ボタンを表示し、引用・質問・モデルを既存Chatで確認する。preparedイベントからdestination IDを取得して会話一覧・選択を切り替える。ChatのReact keyを会話IDに依存させず、streamの所有コンポーネントを維持する。受信中は自動切替でも本文を消さず、停止APIは記録したdestination IDへ送る。手動会話切替は生成終了後に許可し、表示中の部分本文・未送信入力・エラーは通常の会話切替時にリセットする。

分岐先表示の再取得が失敗しても受信処理を継続し、destination ID付きエラーを表示する。送信予約の返答自体が届かなかった場合は、再読込後の元Keep関連Runで分岐先を確認できる。再送ボタンの連打はUIロックとDB制約で防ぐ。

予約完了後の通信失敗では、新Conversationには質問・失敗Runがあるので削除しない。ブラウザ再読込後の選択は従来どおり更新日時順の先頭であり、直前選択の永続化は追加しない。最新Run集計は再取得時に更新する。モデル応答品質、同一DBの複数サーバー同時利用は本Phaseの評価対象外。正式Mode B・複数マーカー・miniMAP・複合エクスポートは対象外。
