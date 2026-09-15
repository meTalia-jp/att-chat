# S3 Related Turns / Semantic Search 設計

基準: `4d0312f19e82181c21a61a5051d8e9d4f7aea4e1`。人間が見るための検索まで。検索結果をGenerationRunへ保存せず、通常Chat/Keep/LLM Contextへの接続はない。

## Architecture

Highlight ID → SemanticSearchService → query用EmbeddingProvider → SemanticIndexRepository.searchCandidates → server-side cosine ranking → DTO → Related Turns UI。

`POST /api/conversations/:conversation_id/highlights/:highlight_id/related-turns`。bodyはvariant/role/scope/top_kのみ。既存Host/Origin/JSONサイズ制限を適用する。元Highlightをサーバーで取得し、会話所属・resolved・completed Assistant・source_text・UTF-16半開区間・graphemeを検証する。query全文はクライアントから受け取らない。

active Provider/specは1検索につき1度取得し、specをclone、S0 identifySpaceで固定する。Providerのspace/fingerprint/次元/入力上限を照合する。検索中にactive設定を取り直さない。同時検索は1件、後続は503で明示拒否。queryはpurpose=query、E5のquery prefixはProviderが付ける。保存済みdocument側はpassage prefixのまま。semantic specification/fingerprintは変更しない。

本体起動時はSearchServiceだけ作成し、検索用モデルは最初の検索時に遅延ロードする。`ATTCHAT_EMBEDDING_MODEL_DIR`をS2と共用する。未設定/モデルロード不可/索引space未作成は検索のエラーとして表示し、通常Chatは利用可能。S2別プロセスworkerのProviderと検索側Providerは別インスタンス。worker/lease/retry/state machineには変更なし。

## Query variants

- Q1: Highlight.target_textのみ。
- Q2: 同じTurnの直前最大150 UTF-16 code units + target_text + 直後最大150 UTF-16 code units。予算は周辺合計300、引用自体は予算外。grapheme境界へ内側に丸める。Turn端の余剰を反対側へ再配分しない。前後の別Turnは取得しない。

Q2の周辺はMarkdown原文であり、レンダリング後の本文ではない。引用部分はQ1との比較のためtarget_textを維持する。色/メモ/Keepの下書きはqueryへ含めない。2方式ともqueryが512tokenを超えればINPUT_TOO_LONGで拒否し、truncateしない。正式採用は決めない。

`search-query.ts`のsliceはMode B PoC（基準commitのsrc/mode-b-poc/context-builder.ts）にある内側grapheme境界丸めの考え方を選択移植した独立関数。パラメータと出力は検索用に限定。PoCからのruntime importはない。

## Candidates / ranking / DTO

Repositoryは同一space・ready・completedのUser/Assistantだけを取得。self Turnは常に除外。scope=current（既定）は元Conversationのみ、allは全Conversation。role=all（既定）/assistant/user。top_kは既定5、1〜10の整数。これ以外の値を拒否する。検索対象の時刻上限は設定せず、現在保存済みの条件を満たすTurnを対象とする。

vectorはS2 readVectorを通し原文/input hash、dimensions、finite/nonzeroを検証する。不一致時は既存S2のstale処理を使う。NaN等の不正vectorは除外数として返す。未ready/別spaceは読み出さない。rankはService側でcosineを計算（L2済みの場合dot相当、fake等にも対応するためnormを計算）。score降順、同点はconversation_id辞書順→sequence_no→turn_id辞書順。thresholdなし。scoreは確率ではない。

結果DTOはconversation_id/title、turn_id、sequence_no、role、excerpt（先頭240 Unicode code points）、score、space_id、source_hashを明示投影。vectorはAPIへ渡さない。query_text、実際のoptions、coverage、計測値も返すが検索結果はDBへ保存しない。Browserには文書全文やvector検索候補集合を配布しない。

full scanを採用。候補とvectorは検索ごとに読み込み、N件×dimensionsの計算。将来の規模では再測定が必要。ANN/vector DB/SQLite extensionは追加しない。本文hash再確認による追加読込もvector_load_msに含む。

## Coverage / timing

coverageは**全会話・active space全体**のS2 countsであり、role/current filter適用後の候補数とは別。total_completed/ready/pending/failed/stale/missing/input_too_longを表示する。readyの中にもself/filter除外がある。invalid_vectorsは今回読み出し時に除外された不正vector数。未索引・失敗・長文は検索されない旨を常時説明する。

timingsはready_vector_count（self/filter適用後）、vector_load_ms、query_embedding_ms、similarity_ms（rank sort/DTO組立込み）、total_ms、invalid_vectors。totalには初回active Providerロード時間も含む。background進行と同時利用できるが、検索結果・coverageの全DBトランザクションsnapshotは固定しないため、その間に件数が変わる場合がある。

## UI / Jump

マーカーのクリック/編集/Related Turnsボタンからパネルを開く。Q1/Q2・Role・scope・top_kを変更しSearchする。条件変更時は古い結果を消す。元Highlight変更やConversation移動でパネルを再作成し、未完了fetchをabortする。検索以外の操作でマーカーやKeepを書き換えない。

同一Conversationなら既存articleのdata-turnで特定、別Conversationなら既存取得フローで開いてからTurn単位でscroll/focusする。DOM座標は保存しない。1.8秒の視覚強調。生成中の会話移動は既存sending境界に従い無効化する。既存Highlight offsetジャンプは変更なし。

## 運用・境界・制限

S2と同様、モデルディレクトリを設定してnpm.cmd start。対象DBをATTCHAT_DBで指定できる。検索モデルは本体プロセスに常駐し、S2 workerとは別のメモリを使う（S1測定ではモデル約0.5GB級）。native推論を即時停止できない制限は継続し、30秒でabortを要求、戻った結果は破棄する。大規模full scanは同期処理なのでserver応答性を含め別途評価が必要。

APIの取得エラー/検索エラーは通常チャットのoutcomeとは無関係。GenerationService、LMStudioProvider、normal context、Keep送信、quote_question_only v1/v2、migration001〜007、packageは変更しない。

将来は検索ServiceをContext RetrievalやStudy Mode等から再利用できるが、今回のServiceは人間向け検索でありContext選択/Prompt構築の責務は持たない。「マーカー→疑問/メモ/考え→AIへ質問→回答からさらに考える」という循環を共通基盤とする将来構想はあるが、Mode Frameworkは今回着手しない。
