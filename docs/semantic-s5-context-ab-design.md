# S5 Temporal Context / A+B Comparison PoC

基準commit: `30c5dfb26a34ec1a2e31cbdb8d7185d6135adb6f`。

## 責務と読取経路

S3は関連Turn検索、S4は指定Turnと前後Turnの取得、S5はA/BのPreview組立てを担当する。S5はSemanticSearchServiceを呼ばない。Temporal Turn取得は既存RetrievalService.getTurnContextだけを使い、anchor確認にはgetTurnを使う。S4の契約・コードを変更しない。

ContextPreviewServiceはHighlightを会話IDで限定してSELECTする。既存Repository.listHighlights/getHighlightは不一致時にunresolvedを書き込むため利用しない。不一致はINVALID_ANCHORとして返すだけで、statusの自動修復も変更もしない。DB操作はSELECTのみ。生成・索引・Keep・ExperimentLogへ接続しない。

`POST /api/conversations/:conversationId/highlights/:highlightId/context-preview`は比較条件だけを受け取るread-only計算API。POSTは生成送信を意味しない。既存Host/Origin/JSONサイズ制限を適用し、本文/offsetをクライアントから信頼しない。

## A Local Context

resolved Highlightかつcompleted Assistantを対象とし、整数UTF-16半開区間、範囲、source_text一致、grapheme境界を検証する。引用はTurn.contentの原文と一致するsource_textを使う。画面選択target_textはdisplay_target_textへ別保持する。Markdown原文と表示文字列を混同しない。

local_budgetは300/600/1000、local_ratioは5:5/6:4/7:3。予算は引用を除いた前後原文のUTF-16単位である。Turn端の不足だけ反対側へ再配分し、grapheme内側丸めによる余りは再配分しない。local sectionに実start_offset/end_offsetを記録する。長い原文からの抜粋は明示的なLocal Context仕様であり、Temporal全文の切捨てとは区別する。

出典: 基準commitの`src/mode-b-poc/context-builder.ts`から、grapheme境界列挙・前後予算配分・Turn端再配分・内側丸めの部分だけを`src/context-preview/service.ts`へ選択移植。変更点は質問/model/payload生成の除外、S4 DTO利用、構造化エラー、A/B section出力。既存PoCからruntime importしない。S3 Q2は端の再配分を行わないため、そのutilityは流用しない。

## B Temporal Contextと順序

before_turns/after_turnsは各0〜3、既定1。S4上限10以内にPoCを限定する。completed User/Assistantだけを同一Conversationからsequence順に取得し、欠番は件数で数える。A+BはS4が返すanchor全文をlocal sectionに置換し、anchorは必ず1回だけ含める。順序はtemporal_before → local → temporal_after。role、sequence_no、turn_idを保持する。

AではTemporal取得しない。指定before/afterは比較条件として残すが、実返却数は0。Bの各Turnは全文で入れ、任意除外・優先順位・途中切断を行わない。異なるTurn間で似た文章がある場合の意味的重複は除去しない。

## 上限と出力

実DBのread-only調査: `data/attchat.sqlite` 9件/最大351/合計541 UTF-16、`data/phase3b2-ui.sqlite` 6件/最大1516/合計2243 UTF-16（全status）。開発DBは小さいため一般利用の代表値ではない。最大7 sectionの試行に余裕を持たせ、PoC総上限を20,000 UTF-16に固定した。token上限でもモデル入力上限でもない。

request_previewは`[source role #sequence_no]`と本文を改行で連結した比較用文字列。モデル、質問、messages、送信関数は持たない。total_utf16はラベル/区切りを含むこの文字列長、content_utf16は本文合計。max_utf16、parameters、返却前後数も返す。JSON表現の重複やキーの通信サイズは総予算対象外。

上限超過はPREVIEW_TOO_LARGE/413でPreview全体を拒否する。Turnを切らず、予算内Turnだけ選ぶこともしない。INVALID_PARAMETERS、HIGHLIGHT_NOT_FOUND、INVALID_ANCHORを区別し、S4エラーと既存DBエラー処理も維持する。経過時間は決定的なPreview DTOに入れず別測定する。

## UIと将来境界

マーカー一覧のContext CompareからStrategy・予算・比率・前後件数を変更する。source/role/順序/引用強調/総量/JSONを確認できる。条件変更時は古い取得をabortして結果を破棄する。比較は同一パネルで切り替える方式。

将来ContextAssemblerでは明示的なtoken予算、未来側Turnを含める目的、選択優先順位を別途設計する。S5では全文取得後に上限判定するため、極端に長いTurnの一時メモリ/応答前処理量は制限しない。永続snapshot、Context Source C、通常Chat・Keep・LLM送信統合は行わない。

共通循環は「読む → マーカー → 疑問・メモ・考え → AIへ質問 → 回答 → さらに思考」。将来のMode Framework（Study Mode等）がContext Source / Retrievalを共用できる可能性はあるが、S5では実装しない。
