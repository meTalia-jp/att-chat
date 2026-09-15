# S1 Built-in Embedding単体PoC

基準: 286df285969e43b3a3c0d6851544493c4e7b83d8。既存送信・索引保存へ統合しない。

## 固定構成・由来

- ONNX変換: Xenova/multilingual-e5-small、revision `761b726dd34fb83930e26aab4e9ac3899aa1fa78`。
- 元モデル: intfloat/multilingual-e5-small。参照時revision `614241f622f53c4eeff9890bdc4f31cfecc418b3`、MIT表記。これは元モデル確認時点のrevisionで、ONNX変換時の元revisionと断定しない。
- 使用成果物: model_quantized.onnx、config.json、tokenizer.json、tokenizer_config.json。各SHA-256をproviderコードに固定しロード時に検証。取得revision＋artifact hashを実行実体の識別に使う。
- [変換元情報](https://huggingface.co/Xenova/multilingual-e5-small/tree/761b726dd34fb83930e26aab4e9ac3899aa1fa78)、[元モデル情報](https://huggingface.co/intfloat/multilingual-e5-small/tree/614241f622f53c4eeff9890bdc4f31cfecc418b3)。変換repoに独立LICENSEファイルはなく、元モデルMITを参照。配布時は元LICENSE/著作権表示と変換出典を添付する。

## runtime

devDependenciesにonnxruntime-node 1.21.0（MIT、native bindingあり）、@huggingface/tokenizers 0.2.0（Apache-2.0、nativeなし・依存なし）を固定追加。lockfile固定。S1専用なので通常アプリからimportしない。

Transformers.js 3.8.1は本体48,306,100 bytesに加えonnxruntime-web 93,349,344 bytes、sharp等も必要。今回はテキスト専用のため直接ONNX＋tokenizerを選ぶ。Python環境追加も不要。npmは30 package追加、監査0 vulnerability。onnxruntime postinstallはnpmのallow-scriptsにより未承認のまま。packageに含まれるWindows CPUバイナリで動作し、追加のinstall script実行は不要だった。依存booleanのdeprecated警告は記録し、配布前に依存更新を再評価する。

## 入力・出力・S0整合

queryはquery:、documentはpassage:を付け、tokenizerのspecial tokens込みで全文encode。token列を切らず512超過はINPUT_TOO_LONG。input_ids、attention_mask、token_type_idsをモデル入力名に合わせて渡す。last_hidden_stateをattention-mask付きmean pooling後L2正規化し、S0 validateEmbeddingを通す。

CPUのみ、intraOp=2、interOp=1、sequential、同時1件。busy時は構造化PROVIDER_ERROR。AbortSignalは開始前・tokenize後・推論後に確認しCANCELLEDを返す。native session.run自体は即時停止しない。disposeは推論終了後のみ。loadのファイル不存在・hash不一致は初期化失敗としてthrowし、embed時の失敗は構造化する。

S0契約ファイルは変更しない。space仕様へmodel revision、tokenizer package/version/2ファイルhash、runtime version/CPU/model hash、384次元、pooling、L2、prefix、入力加工version、reject policy、512上限を反映。性能上のスレッド数は意味仕様を変えない設定として固定記録。fingerprintはS0実装をそのまま利用。

## Privacy

モデル取得はHugging Faceの固定revision URLのみ。本文処理はローカルファイルのみで、Providerにfetch/HTTP/ダウンロード処理はない。ONNXログseverity=3。測定ではglobal fetchを拒否し呼出回数0を確認。ただしOS全通信のpacket captureを行ったという意味ではない。
実DBはDatabaseSync(readOnly:true)でcompleted本文のtoken数だけ測る。DB接続migration関数を使用しない。出力はrole別集計のみ。検索例は公開可能な合成文、vector本文は出力しない。推論vectorはメモリ上のみ。

## 再実行

モデル4ファイルを `.cache/semantic-s1/` へ配置（gitignore対象）。取得URLは `https://huggingface.co/Xenova/multilingual-e5-small/resolve/761b726dd34fb83930e26aab4e9ac3899aa1fa78/` にファイル名を付ける。model_quantized.onnxのみ元URLはonnx/配下。自動取得機能は実装していない。

通常: `npm.cmd test`（モデル依存ケースはskip）。実モデル: PowerShellで `$env:ATTCHAT_S1_MODEL_DIR='D:/att-Chat/.cache/semantic-s1'` 後 `node --experimental-strip-types --test tests/semantic-runtime.test.ts`。終了後はその環境変数を外す。
測定: `node --experimental-strip-types scripts/semantic-benchmark.ts .cache/semantic-s1 data/attchat.sqlite data/phase3b2-ui.sqlite`。

通常unit testにモデル取得を含めず、モデル未配置CIでも既存112件が動く。PoCはCLI測定のみでUI追加なし。Background Indexer、DBテーブル、正式検索、Context/送信統合は対象外。
