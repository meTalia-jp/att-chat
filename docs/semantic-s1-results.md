# S1 実測・合否

## 判定

S1単体PoC合格。HX370 / RAM64GBの指定用途でCPU内蔵候補として条件付き採用可能。実用製品としての全環境対応・長期間安定性を保証する試験ではない。S2の保存・再生成基盤へ進むことを推奨するが、今回は進まない。

## モデル・実行

Node24.19.0、Windows、AMD Ryzen AI 9 HX370（24論理CPU）。onnxruntime-node1.21.0、tokenizers0.2.0、CPU2スレッド。
Xenova/multilingual-e5-small / revision `761b726dd34fb83930e26aab4e9ac3899aa1fa78`、model_quantized.onnx。384次元、512token（prefix・特殊token込み）。詳細hashと契約はproviderコードと設計文書参照。

## 性能

独立Nodeプロセス3回で起動確認。OSファイルcacheを消していないため冷たいディスクからの起動時間ではない。短文20回、245token文書30回を逐次測定。

| 指標 | 測定値 |
|---|---:|
| runtime import | 23〜31ms |
| モデルロード（hash検証/tokenizer/session含む） | 624〜724ms |
| 初回短文推論 | 20.7〜22.5ms |
| import開始→初回終了 | 667〜778ms |
| 繰返し短文median / p95 | 約2.1 / 3.9ms |
| 245token median / p95 | 約24.5 / 25.3ms |
| プロセスidle基準RSS | 約57MB |
| runtime import後RSS | 約63MB |
| load後RSS | 約543MB |
| 推論中5msサンプル最大RSS | 約548MB（load後から約5MB増） |
| プロセス全体最大RSS | 約614MB（ロード等の瞬間ピーク含む） |

245token30件: wall約739ms / process CPU約1515ms。CPU使用率換算は1core基準約205%、24論理CPU基準約8.5%。短文21回区間は約77〜84msと短くGC等を含み、マシン換算17〜19%と振れる。Task Manager瞬間値ではなくprocess.cpuUsage / wall / logical CPUsによる換算。nativeスレッド数以外にJS/GC等も含む。計測用プロセスの値であり、アプリ総RAMではない。

## 検索品質

合成文書8件（日本語4・英語4）。全例で期待関連文書がtop1。精度ベンチマークでなく最低限の動作確認。scoreを正答確率として扱わない。

| query | top1内容 | score |
|---|---|---:|
| 過去のチャット内容 | 会話履歴＝過去の質問と回答 | .8601 |
| 過去チャットを意味で検索する仕組み | Embeddingによる関連会話検索 | .8579 |
| How can I change the artistic style of generated pictures? | LoRAによる画風調整 | .8352 |
| Keep my data after restarting the app | SQLiteによる保存復元 | .8796 |

英語文書だけに限定した英語queryでも画像/保存の期待top1（.8341 / .8452）。日本語query→英語文書のみの3例もtop1: 「以前にやり取りした質問と回答」→Conversation history (.8678)、「文章の意味から関連するチャットを探したい」→Embeddings (.7987)、「再起動しても保存内容を消さない」→SQLite (.8195)。原文・候補は測定スクリプトに固定。4混合＋3cross＋2英語限定の計9確認が成功。

## 実Turn token分布

document purpose、passage prefixと特殊token込み。nearest-rankでmedian/p90/p95算出。DB間の重複除去はしていない。completedのみ、failed/cancelled部分本文は対象外。

| DB | role | 件数 | median | p90 | p95 | max | 超過件数/率 |
|---|---|---:|---:|---:|---:|---:|---|
| data/attchat.sqlite (migration004) | user | 3 | 12 | 29 | 29 | 29 | 0 / 0% |
| 同上 | assistant | 6 | 15 | 193 | 193 | 193 | 0 / 0% |
| data/phase3b2-ui.sqlite (migration006) | user | 3 | 22 | 23 | 23 | 23 | 0 / 0% |
| 同上 | assistant | 2 | 14 | 295 | 295 | 295 | 0 / 0% |

Case Aを暫定採用: 現サンプルではS2へ進める。14件の開発データで全利用傾向を代表しないため「chunk不要」とは結論しない。S2で対象外数を可視化し、S3前に実利用データで再判定。無視できない超過が判明したらS2Cを追加。長い合成文と512/513境界でINPUT_TOO_LONG拒否を確認し、silent truncationなし。

## サイズ・配布

10進MB。model_quantized.onnx=118,308,185 bytes、tokenizer.json=17,082,730、tokenizer_config.json=443、config.json=658。必要4ファイル計135,392,016 bytes。tokenizer.jsonを使うためsentencepiece.bpe.modelは不要。
onnxruntime-node展開217,912,684 bytes（複数OS用バイナリを含む）。Windows x64 bin一式34,829,912 bytes（DirectML DLLを含むがCPUで実行）。tokenizer package360,962 bytes。node_modulesは94,068,219→316,505,851 bytes、増分222,437,632 bytes。モデル込み増分約357.8MB。ここでのサイズはディスク上ファイル長合計で、圧縮配布物やクラスタ消費量ではない。

Aモデル同梱: 初回オフライン・無設定に最も合う。Windows専用runtime梱包を別途検証すれば全OSバイナリを配布する必要はない。B初回自動取得: 小容量だが初回ネット依存と失敗表示が必要。C別配布: offlineモデルpackを併設する方法は可能だが標準無設定用途では補助とする。
推奨はAを標準、Bを小容量配布として検討。S1では配布機能未実装。依存サイズは無視できないが、約0.55GB RAM・短時間CPU推論は指定64GB環境で明らかな過負荷とは判断しない。より小さい配布/RAMが必須なら、採用確定前に別モデル/runtime比較が必要。

## space・privacy・制限

space_id=`embedding-space-v1:31929068c80e20d1a5beac7e6adc985c7690f5a634f9b2177a4b8aeffdb6cf9a`。独立プロセスで一致。異仕様space差はS0テストが継続検証。S0ファイル変更なし。
モデル取得通信と本文処理を分離。処理中fetch拒否・試行0、Providerはローカルファイルのみ。実DB本文/vectorのログなし。DB/WAL/SHM等既存16ファイルは前後hash一致。
cancelは開始前拒否/実行後結果破棄に対応するがnative処理即時停止ではない。小規模逐次PoCであり、常駐worker・並列運用は未検証。tokenizerは実モデルのJSONを使用するが、別Python実装との全Unicode等価性試験は未実施。変換artifactの固定hashを採用基準とし、upstream変換時revisionの証明まではしていない。

## 最終検証・変更

通常テスト: 既存112 PASS、実モデル1件skip。明示実モデルテスト: 1 PASS。typecheck / build / git diff --check成功。
追加: src/semantic/poc/builtin-provider.ts、tests/semantic-runtime.test.ts、scripts/semantic-benchmark.ts、本設計/結果文書。変更: package.json/package-lock.json（S1 dev dependenciesのみ）。
既存migration/保存処理/GenerationService/LMStudioProvider/Mode B/S0契約無変更。RpenProof参照元72ファイル変更0件。実モデルは.cacheのみでコミット対象外。合格後指定メッセージの1コミットで停止。push/tag/S2は実施しない。
