# Core Status

確認日: 2026-09-17（JST）。基準HEAD: `6d52c1f015246f3c0665ef19478fdf3eb71118e1`。
現行コードと実画面を確認した設計レポート。Study P0等の既存未追跡ファイルも調査対象に含めたが変更していない。以下ではコード上の実装有無と今回の実機確認を区別する。

## Current Architecture

- `src/client/main.tsx` → Reactの会話選択、Chat、MarkedTurns、Run表示。
- `src/server/main.ts` → loopback HTTPサーバー、SQLite、Repository、GenerationService、Retrieval、ContextPreview、条件付きSemantic worker。
- `src/server/http.ts` → Conversation/Turn/Highlight/Keep/質問送信/検索/読み取りAPIと`dist`の配信。
- `src/server/storage/database.ts` → SQLite WAL、外部キー、migrationのchecksum検査。現在の既存migrationは001〜007。007がSemantic Index。
- `src/server/generation.ts` → LMStudioProviderによる通信、500ms checkpoint、streaming、cancel、terminal保存。DB保存失敗を成功扱いしない。
- `src/study-poc/serve.ts` → Coreとは別サーバー・別画面。LMStudioProviderを再利用するが、DB/GenerationServiceには接続しない。

通常の起動は`npm.cmd start`（既存buildを配信、既定5181）。開発frontendは`npm.cmd run dev`（5180）。production bundleの更新は`npm.cmd run build`。DB既定は`data/attchat.sqlite`、上書きは`ATTCHAT_DB`。今回通常DBは開かず一時DBを指定した。

## Implemented

| 分類 | 実装と根拠 | 境界・条件 |
|---|---|---|
| Chat / Storage | `repository.ts`のConversation作成・Turn追加・sequence_no順・Run予約、`Chat.tsx`、`generation.ts`の実モデル送信/streaming/cancel | completed本文不変。通常Chatはcompleted履歴を送信。既存実装は汎用モード切替ではない |
| Recovery | `repository.ts: recoverInterrupted`、`main.ts`の起動時呼び出し | preparing/runningをinterrupted、対応Turnはfailed。自動再送なし。今回強制クラッシュ試験はしていない |
| GenerationRun | 通信前予約、request_snapshot、成功/失敗/停止、保存失敗処理 | 既存Runを上書きして再質問する仕組みではない |
| Highlight | `MarkedTurns.tsx`、`repository.ts`、マーカー選択/描画処理 | completed Assistantのみ。4色、任意メモ、編集/削除、永続化、unresolved。UTF-16半開区間、grapheme境界、source一致を維持 |
| Marker navigation | `marker-list.ts`、`MarkedTurns.tsx` | 会話内一覧・色filter・既存DOMへjump・約1.8秒強調。座標永続化なし |
| Keep | `question-keeps.ts`、`QuestionKeeps.tsx` | pending/asked/dismissed、下書き/メモ、同一Highlightに複数Keep。askedの編集は禁止。Highlight削除でKeepも削除 |
| Keep送信 | `repository.ts: prepareChat/startRun`、`Chat.tsx` | このチャット/新チャット。quote_question_only、Keep 1:N Run、source/destination分離。askedは送信開始処理への遷移、回答成功ではない。過去reference snapshotは独立保持 |
| Embedding | `semantic/builtin-provider.ts` | ローカルCPU ONNX、固定e5-small artifact、384次元、query/document用prefix（実値は`query: ` / `passage: `）、512token超過拒否。利用にはモデル配置が必要 |
| BackgroundIndexer | `semantic/indexer.ts`、`index-repository.ts`、`launch.ts` | lease/ready/failed/stale、単一推論、派生データ。`ATTCHAT_EMBEDDING_MODEL_DIR`指定時に別プロセス起動 |
| Related Turns | `RelatedTurns.tsx`、`semantic/search-runtime.ts`等 | 明示検索、Q1/Q2、role/scope/top_k、coverage、jump。モデル未設定ならエラー、AI送信へ自動追加しない |
| Retrieval | `retrieval/service.ts`、`TurnContextPanel.tsx` | getTurn / getTurnContext。確定Turnのread-only取得、同一会話の前後。before/after 0〜10 |
| UI | `main.tsx`、`style.css` | 左会話一覧＋右メインの2列。狭い画面は縦配置。右メイン内に入力、Marker一覧、Keep、発言、Run情報。独立した右補助サイドバーはない |

## PoC / Experimental

- `mode-b-poc/context-builder.ts`: 同一Turnの前後文脈比較PoC。正式送信のcontext strategyではない。
- `ContextCompare.tsx` / `context-preview/service.ts`: S5のA（local）/ A+B（temporal）比較。budget 300/600/1000、比率5:5/6:4/7:3、前後0〜3Turn。20,000 UTF-16上限。request_preview表示のみでモデルへ送信しない。
- Study P0: `StudyCoordinator`のMap内セッション、固定教材、task/tutor呼び出し、schema/漏洩検査後の公開。独立ページ・debug分離。モデル比較/問いの具体性比較の文書は実験成果であり、Core統合済みを意味しない。
- UIにはPhase1A保存確認操作とRun snapshot表示が残り、画面タイトル/起動ログはPhase3B-2のまま。実装範囲を示す正確なバージョン表示ではない。

## Not Implemented

- miniMAP、Marker引用の40〜80文字省略表示、Marker用の独立右サイドバー。
- User Turnへのマーカー登録（現契約ではAssistant限定）。表示改善と同時に勝手に対象を広げない。
- 正式Mode Bの文脈送信、Semantic結果を組み立てて通常/Advanced送信へ接続する機能、複数マーカー質問、複合エクスポート。
- CoreのNormal/Study選択、永続StudySession、内部callと公開Turnの関連付け、Study専用公開境界・再起動復旧。
- 汎用Mode Frameworkは今回設計しない。

## Runtime Verification

既存ユーザーDBを保護するため、`.cache/core-status-audit/audit.sqlite`を使用。ポート5192で実際の`npm.cmd start`を実行し、既存`dist`をin-app browserで表示した。Vite devサーバーを別途起動した試験ではない。既存ユーザーDBの内容・移行結果の検証ではない。

| 確認 | 結果 |
|---|---|
| server / frontend / DB open | 成功。新規一時DBで起動しReact画面を表示 |
| Conversation | 実画面で「Core確認・一時会話」を作成し一覧・選択を確認 |
| LM Studio | 既存ローカル`ministral-3-8b-instruct-2512`を使用。モデルのダウンロードなし |
| 通常Chat | 実画面から送信。User/Assistant保存、Run succeeded。Assistant本文252 UTF-16単位 |
| streaming | 生成途中の本文と生成中/停止可能状態を実画面で確認 |
| cancel | 2回目の長文要求を本文生成中に停止。Run cancelled、Assistant cancelled、部分本文340 UTF-16単位を保存 |
| reload | ブラウザreload後、同一会話・4Turn・2Runの表示を確認 |
| Marker | 実回答の連続117文字範囲をAPIで登録。yellow/メモ/全文引用を実画面確認。ドラッグ登録自体は今回再試験していない |
| jump | 一覧のボタンで移動メッセージと当該引用へのfocusを確認 |
| server restart | サーバー停止→同じ一時DBで再起動→browser reload。会話・成功/停止履歴・Markerが保持 |
| Semantic | 今回はworker環境変数を外し、実Embedding検索は再実行していない。実装確認と通常テストのみ |

`npm.cmd test`: 213件、211 PASS、2 skip、0 fail。実モデルopt-inテストのskipを含む。`npm.cmd run typecheck`: 成功。今回はsource変更なしの調査のためbuild再生成はしていない。実モデル応答の品質評価は対象外で、3文指定に厳密に従うことなどを保証する結果ではない。

テスト専用サーバー・タブを終了し、一時DBを削除済み。終了時のunload要求では既にモデルが存在せず、`lms ps`でロード済みモデル0件を確認した。既存通常DBは未変更。開始時に取得した既存156ファイルのSHA256照合は変更0件、新規追加は本レポートだけ。`git diff --check`と本レポートのwhitespace検査に指摘なし。

## Marker List Current State

根拠: `src/client/MarkedTurns.tsx`、`marker-list.ts`、`style.css`。

- 一覧は現在会話のものだけ。`highlight_id → turn_id → sequence_no`で発言と関連する。
- 色swatch＋色名、`Assistant #sequence_no`、**target_text全文**、メモ（空なら「なし」）、操作ボタンを表示。source_textは原文検証用で、一覧の直接表示ではない。
- roleはAssistant表記。現時点ではUserの登録自体が禁止されているため、User/Assistant双方に対応した一覧ではない。
- sequence_no昇順→start_offset昇順→highlight_id順。IDを会話順に使わない。
- 4色checkbox、全表示/全非表示、件数。filterは人間向けでAI意味付けなし。現画面状態であり永続設定ではない。
- 専用jumpボタンが存在し、行全体clickではない。本文側マーカーclickは編集入口。
- unresolvedも一覧に残し理由表示。jump/Related/Keep作成/Context Compareは不可、編集/削除は到達可能。
- 長文は全文、折り畳み・抜粋・省略記号なし。複数の長文と操作ボタンが並ぶと、保存発言より前の管理UIが長くなる。

## Marker List Improvement Proposal

既存一覧を読み返し用の目次へ改善する。新一覧や保存フィールドは作らない。

1. `target_text`の冒頭60 grapheme程度を表示し、超過時だけ「…」。表示用の改行/空白整理は可。保存文字列とoffsetには触れない。
2. 全文表示/閉じるを用意し、引用全文に到達可能にする。省略した文字列で再アンカーしない。
3. 色、メモ、AssistantとTurn番号を維持。roleは関連Turnから表示する設計に整理できるが、User登録解禁は別課題。
4. 引用をキーボード操作可能なjumpボタンにし、編集/削除/Keep等は独立した操作領域に維持。入れ子buttonと編集時の誤jumpを避ける。
5. 既存の色filter、並び順、unresolved理由・jump不可を維持。全文展開操作はunresolvedでも可能。

受入確認: 60境界/短文/長文/絵文字/結合文字、同文別Turn、複数色、メモありなし、unresolved、キーボードjump、編集/削除後反映、reload/幅変更後のjump。ellipsisや展開でanchor・元本文が変わらないことを確認する。

## miniMAP Current State

CoreのUI・sourceにminiMAPの実装なし。現在の左会話一覧、Marker一覧、Related TurnsはminiMAPではない。右側に専用領域もない。

## miniMAP Minimal Proposal

役割は「どこにあるか」。Marker一覧の「何をマークしたか」と分ける。

- 折り畳める細い縦領域。現在の会話本文コンテナを対象にTurn位置、既存Highlightの4色点、現在viewport範囲を描く。
- 現在DOMのTurn/marker位置を本文高さに対して正規化する。scroll/resize/本文確定後に更新し、DOM座標はDBに保存しない。
- marker clickは既存ID/Turn/offset解決とjumpを再利用。unresolvedは位置推測せずjump不可。重なる点は誤選択しない選択方法が必要。
- 狭い画面では折り畳み、ラベルとキーボード操作を用意。縮小本文、ズーム、animation、Study/Semantic/Keep状態の統合は対象外。
- 現時点では全Turn描画だが、将来仮想化するなら未描画Turnへの移動が別途必要。初版から仮想化基盤を作らない。

## Study Integration Points

現時点の共有はLMStudioProviderとローカルLM Studio。`study-poc/serve.ts`が直接Providerを作成し、`coordinator.ts`はMapに保存する。Core Conversation ID、Turn ID、GenerationRun、SQLiteとの対応はない。P0公開履歴のroleはuser/assistantであり、Tutorは役割名として将来表示できる。

将来一つのStudyを載せるときの不足:

- ConversationにNormal/Studyを識別する最小属性またはStudySession関連が必要。現在のConversation契約にはmodeなし。
- Conversationと結び付くStudySessionにtask/state/support/challenge/strategyとversionを保存する境界が必要。内部call、attempt/step、失敗・停止・復旧状態を公開Turnと分離する。
- `main.tsx`の会話選択/送信入口と`http.ts`にStudy専用経路が必要。通常Chat送信の履歴構築をそのままStudy内部呼び出しへ流用しない。
- 現GenerationServiceはdeltaを即公開し、予約Assistant Turnへcheckpointする。Solver/Evaluator/Router/Harness Decisionをここへ通常発言として渡すと内部内容が露出する。Providerを再利用し、Study coordinatorの内部処理→検証→公開確定の境界を設ける必要がある。
- 公開するTutorだけassistant Turnとして末尾に保存する案なら、既存Turn roleとcompleted不変を保ちやすい。内部callは別記録として関連付け、通常会話履歴/Marker/Embedding対象に混入させない。
- P0のstale結果破棄と公開直前cancel検査は参考になるが、永続化・再起動・一意性/排他・公開の原子性はCore統合時の新課題。P0の固定教材一往復を完成した対話Studyと扱わない。

今回はこれらのDB/通信/UIを追加せず、汎用Mode Frameworkも定義しない。

## Recommended Next Core Phase

**A. Marker一覧実用化**を一つだけ推奨する。

実装規模は既存一覧の表示と操作の整理に限定でき、MarkedTurns・orderHighlights・filterHighlights・既存jumpを再利用できる。長い引用の連続を短い目次へ変えることで、保存した注意点や後で聞きたい箇所を再発見しやすくなる。将来Studyが公開Tutorを通常assistant Turnに保存する場合にも、この表示改善を使える。Studyの状態モデルを先に決める必要はない。

regression riskは表示短縮時のgrapheme破壊、全文への到達性、jumpと編集の誤操作。表示専用excerpt、既存anchorの維持、独立した操作ボタンと前述の受入確認で範囲を抑えられる。miniMAPはレイアウト/scroll追跡、StudySessionは新保存境界を伴うため、今回の一つの小Phaseにはまとめない。

変更範囲は新規本レポートのみ。source、既存ドキュメント、migration、package、Study P0は変更しない。commit / push / tagは実施しない。
