# Mode B ContextBuilder 比較PoC設計

基準: `7703b0195af6d2896f75a48a33f08ee599b75e9c`。正式Mode B・送信統合ではなく、同一Highlight・質問・モデルで文脈切出しを比較する読み取り専用実験。

## 実行方法と分離

`D:/att-Chat` で `npm.cmd run build`、`npm.cmd start`。ブラウザで `http://127.0.0.1:5181/mode-b-poc.html` を開く。通常チャットは従来の `/`。
Conversation、保存済みHighlight、質問、比較用モデルID、strategy、前後合計、比率を選びBuildする。結果は追記され、各結果が生成時の質問・モデル・出典・parametersを保持する。再読込すると結果は消える。Conversation切替の読込競合は古い応答を破棄する。

独立entry `mode-b-poc.html` と `src/mode-b-poc/` を追加。既存ファイル変更はViteの複数entryビルド設定だけ。通常アプリから実験モジュールをimportしない。実験側は共有型だけを参照し、PoC/RpenProofからruntime importしない。会話・Highlight取得の既存GET APIのみを使い、Build自体はネットワークを使わない。モデル一覧・モデル通信も行わない。

新テーブル、migration、GenerationRunへの保存はない。Highlight、Keep、Run、v1/v2 snapshot、GenerationService、LMStudioProviderを変更しない。

## ContextBuilder契約

純粋関数 `buildContext(turn, highlight, strategy, parameters, question, model)`。原文入力は `Turn.content`。DOMから抽出しない。

- completed Assistant Turnのみ。Turn ID一致、resolved、整数offset、範囲内の非空半開区間、source_text一致、anchor両端のgrapheme境界を検証。
- 不一致・未解決・user・generating/failed/cancelledは例外。自動修復しない。
- 既存の選択対応範囲を広げない。入力は既存APIで作成されたHighlightを前提とし、このPoCでは新規選択・マーカー作成を提供しない。
- strategyは `quote_only` / `same_turn_context`、strategy_versionは `mode-b-poc-1`。正式Runのstrategy_versionとは別名前空間。
- 出力: strategy/context_strategy、strategy_version、parameters/strategy_parameters、target_text、context_before/after、source_range、lengths、reference_snapshot、request_preview、quote_question_only_baseline。
- source_rangeは context_start_offset、highlight_start_offset、highlight_end_offset、context_end_offset。すべて原文のUTF-16 code unit、半開区間。offsetを永続化しない。

## 予算、比率、再配分

`total_context_utf16 = context_before.length + context_after.length` の最大値。引用本体は別枠。300/600/1000、before:after=5:5/6:4/7:3を全組合せで扱う。

1. before目標を `floor(budget * before_ratio / 10)`、after目標を残りとする。
2. 各側を原文に存在する長さで上限設定する。
3. beforeがTurn端で不足した場合、余りをafterへ回す。afterがTurn端で不足した場合はbeforeへ回す。両側不足なら原文の全前後を使う。
4. Turn全文を `Intl.Segmenter('ja', {granularity:'grapheme'})` で分割し、開始を予算内の次の境界へ、終了を予算内の前の境界へ丸める。

予算超過は0。grapheme丸めによる端数は再配分せず未使用として表示する。大きなgraphemeがあると未使用量も大きくなり得る。引用と文脈を合わせると総長は予算を超えてよい。UTF-16長はtoken数ではない。

句読点・文境界探索は追加しない。機械的で再現可能な方式を採用。同じ入力と同じSegmenter環境では同じ結果となる。

## Markdown原文とbaseline

このPoCのtarget_textは `turn.content.slice(start,end)`、すなわち原文由来。既存Highlight.target_text（画面上の引用）は変更せず、reference_snapshot.display_target_textとして別記する。

`request_preview` はすべて原文引用を使用し、quote_onlyでは `[引用]` + `[質問]`、same_turn_contextでは `[参照文脈]` + `[引用]` + `[続き]` + `[質問]`。system指示、model、stream=true、max_tokens=2048は両者共通。通常履歴・前後Turn・色・メモは含めない。

既存 `quote_question_only` は表示引用を使うため、Markdown強調等を含む場合には原文引用と一致しない。既存フローを正確に再現する `quote_question_only_baseline` を並記し、既存system文・表示引用・質問・body構造を維持する。平文ではquote_onlyのpreviewと完全一致し、Markdownでは差が明示される。原文同士のA/B比較と既存方式の確認を混同しない。

## 既知の制限

- 本文はMarkdown原文であり、文脈の端で構文が閉じない場合がある。構文補完や表示テキストへの変換を行わない。
- grapheme分割は実行環境のUnicode/ICU版に依存する。異なる環境間の完全一致は保証しない。
- 長いTurnは全文分割するため時間・メモリが増える。比較件数の上限なし。大量生成時は比較結果をクリアする。
- 画面は読込時のTurn/Highlightを対象とする。別画面で変更したHighlightは再読込して取得する。
- previewは送信しない。モデルの存在・利用可能性・回答品質は検証しない。比率の優劣を判断しない。
- 前後Turn、RAG、semantic search、複数マーカー、自動評価・自動選択、正式送信統合は対象外。
