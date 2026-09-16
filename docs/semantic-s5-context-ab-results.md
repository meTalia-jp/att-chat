# S5 検証結果

基準 `30c5dfb26a34ec1a2e31cbdb8d7185d6135adb6f`。S5比較PoCの範囲で合格。コミット/push/tagなし、後続Phase未着手。

## Tests

通常suite: 185件、183 PASS / 2 SKIP / 0 FAIL。既存168件を維持し、S5の17件を追加。skipは既存の実モデル専用test。typecheck / build成功（277 modules）。git diff --check成功。

予算3種×比率3種、Highlight only、Turn端再配分、grapheme丸め/途中拒否、source mismatch/unresolved拒否、前後0/1/3、先頭/末尾、欠番、未完了除外、別会話非混入、anchor1回、順序/role、決定性、総量、20,000文字のneighborによる構造化超過拒否、全文保持、不正条件、HTTPを検証。

read-only testは全アプリtableの全行を比較。破損Highlightの検証もstatusを書き換えないことを確認。破損模擬用trigger解除はin-memory test fixture内のみ。通常Chat、streaming/cancel、Keep、分岐質問、marker navigation、S0〜S4の既存testもPASS。

## 実画面

In-app Browser、port5187、`.cache/semantic-s3-audit/attchat.sqlite`コピーDBを使用。

- 日本語ABマーカーのContext CompareからA表示: local Assistant #1、1 section、38 UTF-16（本文17）。
- A+B、前後1: User #0 → local Assistant #1 → User #2、3 sections、152 UTF-16（本文76）。anchor全文の二重挿入なし。
- 前後3、予算300、7:3: User #0 → local #1 → User #2 → Assistant #3、4 sections、535 UTF-16（本文427）。実在する前1/後2だけを表示。
- 引用強調、source/role/sequence、条件変更反映を確認。実LLM送信は行わない。長文上限エラーは自動testで確認。

## A/A+B比較と性能

各100回の平均。元DBはreadOnly:true接続。local budget600、5:5。totalはHighlight取得・getTurn・検証・Local抜粋・B取得・文字列生成を含む。Retrieval列はgetTurnContextのみ。assembly列は取得済みsectionsから同じrequest_preview文字列を再構築する単独測定であり、totalの厳密な内訳ではない。HTTP/描画は含まない。

| DB | strategy | 前後指定 | sections | UTF-16 | total ms | Retrieval ms | assembly ms |
|---|---|---:|---:|---:|---:|---:|---:|
| attchat | A | 1 | 1 | 38 | 0.1190 | 0 | 0.00085 |
| attchat | A | 3 | 1 | 38 | 0.0434 | 0 | 0.00021 |
| attchat | A+B | 1 | 3 | 152 | 0.2134 | 0.1661 | 0.00061 |
| attchat | A+B | 3 | 4 | 535 | 0.2228 | 0.1745 | 0.00071 |
| phase3b2-ui | A | 1 | 1 | 42 | 0.0469 | 0 | 0.00016 |
| phase3b2-ui | A | 3 | 1 | 42 | 0.0419 | 0 | 0.00011 |
| phase3b2-ui | A+B | 1 | 2 | 109 | 0.2128 | 0.1667 | 0.00023 |
| phase3b2-ui | A+B | 3 | 2 | 109 | 0.2225 | 0.1664 | 0.00022 |

初回Aの平均には初期化コストが含まれる。小規模・短文の各DB1マーカーであり、高精度ベンチマークではない。現規模では十分小さく、索引追加の根拠なし。

再現: `node --experimental-strip-types scripts/context-preview-benchmark.ts data/attchat.sqlite data/phase3b2-ui.sqlite`。ログは集計だけで本文/vectorを出さない。

## 保全と変更ファイル

追加: src/context-preview/service.ts、src/shared/context-preview.ts、src/client/ContextCompare.tsx、tests/context-preview.test.ts、scripts/context-preview-benchmark.ts、本設計/結果文書。
変更: src/client/MarkedTurns.tsx（起点ボタン/パネル）、src/server/http.ts/main.ts（read-only計算API接続）。

S3 ranking/Q1/Q2、S4コード/契約、migration001〜007、DB schema、package、S2 worker/indexer/lease、EmbeddingProvider、GenerationService/LMStudioProvider、通常Chat/Keep送信、quote_question_only v1/v2、Mode B PoC、selection-pocは無変更。RpenProof参照72ファイル変更0件。

## 判断材料と改善案

A+Bは時間順の情報を増やすが、今回の例では日本語文字列の引用の後にMOEという別話題も入る。近接することは関連性を保証せず、A+Bが常に優れるとは判断しない。異なるTurn間の引用繰返し等もそのまま残す。

将来は「当時の文脈再現」と「現在の振返り」を区別してafter Turnを含めるか明示するとよい。総上限はUTF-16であり、モデルtoken予算への変換は別Phaseで扱う。極端な長文の読込前ガードや比較結果の並列表示は必要性を測って検討する。今回のPreviewは保存されず、後日の同じ取得が同じ隣接集合になる保証はない。これらはS5の制限として残す。
