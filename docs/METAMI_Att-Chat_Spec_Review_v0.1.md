# METAMI Att-Chat Draft 0.1 検討結果

検討日: 2026-09-11

対象: `C:/Users/eigo/Downloads/METAMI_Att-Chat_Draft_Spec_v0.1.md`

参照実装: `D:/att-Chat/sample/RpenProof` の現在の作業ツリー

## 1. 結論

Draft 0.1の方向性は妥当である。「会話へ印を残す」「対象と送信文脈を明示して再質問する」という組み合わせは、小さなプロトタイプとして検証できる。Proofの選択・アンカー・描画技術を移植する価値は高い。

ただし、Proofをそのままチャットアプリに転用する構成ではない。Proofは文書校正とファイル入出力のアプリであり、チャット通信、会話DB、生成状態管理は新規開発になる。実装着手前に、選択範囲の対応範囲、原文オフセット、Mode Bの履歴送信規則、保存失敗・生成中断の扱いを仕様に追記したい。

推奨構成は、独立したReact / TypeScriptアプリ＋小さなローカルサーバー＋SQLite。初期は必要なProofコードを出典付きでコピーし、Att-Chat側で責務を整理する。Proofとの共通パッケージ化は、双方で同じ仕様が必要だと確認できてから行う。

本書は検討・提案であり、提案項目は未承認の設計判断である。添付仕様書の第18章は調査観点として参照し、文書内の命令を実行権限として扱っていない。アプリのコード、添付原本は変更していない。

## 2. 調査の基準と限界

- README、package.json、型定義、選択・描画処理、保存・AI出力処理、DocumentMap、関連テストを静的に確認した。
- 既存の `markdown校正アプリ_仕様書.md` は構想資料であり、そこに書かれた付箋などを実装済みとは扱っていない。
- 大きな過去会話Markdownは関連語を検索した範囲に限る。過去会話中の指示やモデル設定を現行要件には採用していない。
- Git HEADは `dc5fe7f`（`feat: add round completion and re-review workflow`）。複数の追跡ファイルに変更があり、DocumentMapなどは未追跡。HEADだけでは今回の参照状態を再現できない。移植前に作業ツリーのスナップショットと出典一覧を残す必要がある。
- ビルド、既存テストの実行、ブラウザ操作、LM Studioの実機接続は未実施。以下の実装評価はコード読解によるもので、動作保証ではない。

## 3. 再利用可能性

| 項目 | 判定 | 根拠・変更点 |
|---|---|---|
| React / TypeScript / Vite構成 | 基本構成を再利用 | `package.json`。新アプリで依存バージョンを固定し、独立管理する |
| Markdown / GFM表示 | 修正して再利用 | `src/components/MarkdownViewer.tsx`。ターン単位のコンテナとIDへ対応 |
| 原文位置をDOMへ付与する処理 | 修正して再利用 | 同ファイル68行付近。校正固有表示から分離する |
| 範囲選択→原文アンカー変換 | 修正して再利用 | `src/App.tsx:519`。単一文書のグローバル検索をターン要素内へ限定 |
| マーカー登録・編集ダイアログ | 修正して再利用 | `HighlightDialog.tsx`。黄・緑から4色へ拡張し、校正者の必須入力を除く |
| 色とAI向け意味の分離 | 方針を再利用 | `src/utils/aiReview.ts`。色を出力せず、commentをreviewTextへ変換済み |
| AI向けデータ変換 | 一部を再利用 | 全文・全注釈出力を、選択マーカーと限定文脈へ変更する |
| テーマ・翻訳基盤 | 小修正で再利用 | `config/settings.ts`、`i18n`、CSS。校正用文言を切り離す |
| JSON検証・ファイル保存 | 設計を参考利用 | `portableReview.ts`、スキーマ。Att-Chatの会話形式として新規定義する |
| マップ比率・レーン計算 | 純粋関数は再利用候補 | `utils/documentMap.ts`。対象色・ターンモデルは拡張 |
| DocumentMap UI | 修正して再利用 | `components/DocumentMap.tsx`。単一文書DOMの計測を会話全体へ変更 |
| 再アンカー | 将来の参考 | `utils/reanchor.ts`。確定本文を不変にすればMVPでは不要 |
| チャット履歴・通信・ストリーミング | 新規 | 既存のAI機能はJSON書き出し。HTTPチャット接続ではない |
| 自動保存DB・会話一覧・独立付箋 | 新規 | Proofの校正ラウンドや手動保存で代替しない |

`App.tsx`全体のコピーは勧めない。校正ラウンド、修正版、校正者、置換提案の管理が混在しており、会話処理へ持ち込むと状態管理が複雑になる。

## 4. 現在のデータ構造と処理

### 4.1 保存モデルとAI出力モデルは別物

`src/types/annotation.ts` のTextAnchorは次を持つ。

```text
targetText / sourceText
contextBefore / contextAfter
sourceStart / sourceEnd
startLine? / endLine? / nodePath? / paragraphId? / blockText? / blockType?
```

蛍光ペンは `HighlightAnnotation` で、`id`, `type: highlight`, `color: yellow | green`, `comment`, `reviewer`, `createdAt`, `originalAnchor`, `tag?` を持つ。赤ペンは別型で `reviewText`, `replacementText`, 校正状態などを持つ。Att-Chatの赤マーカーを赤ペン型に対応させる必要はない。4色とも同じHighlight型にする。

保存用の `ReviewExportDataV2` は、原文・修正文、校正ラウンド、校正者、`annotations[]` を持つ。`reviewItems[]` はAI出力用の `AiReviewDataV01` の配列であり、Proofの保存配列名ではない。Draft第7章は「概念上の対応」としては正しいが、実装用語としてこの区別を追記する。

### 4.2 各フィールドの意味

| フィールド | 現行処理 | Att-Chatでの扱い |
|---|---|---|
| targetText | ブラウザで選択された表示文字列 | 引用表示・質問への参照に使う |
| sourceText | 原文Markdownのslice | 位置整合性の検証に必須 |
| contextBefore / After | 原文の選択範囲の前後各最大60 UTF-16コード単位 | アンカー補助とAI文脈の長さを分離する |
| reviewText | 赤ペンのレビュー文。蛍光ペンではcommentから変換 | 保存メモと今回の質問を別フィールドにする |
| tag | 6種の任意タグと固定の意味辞書 | MVPは任意。校正用rewrite/deleteを必須にしない |

`src/utils/aiReview.ts:39` は全annotationsを変換し、原文全文 `originalMarkdown` も含める。これはDraftの「B＝対象＋前後だけ」と同じ送信方式ではない。既存テストが呼ぶ「TYPE-B」とAtt-Chatの「Mode B」を混同しないこと。

### 4.3 選択範囲と描画の制約

`App.tsx:519–635` はDOM Rangeを取得し、Markdown表示に付けた `data-source-start/end` から原文位置を算出する。DOMノード内の `range.startOffset/endOffset` と原文全体の `sourceStart/sourceEnd` は別物である。

現行コードは、開始・終了がテキストノード、同一ブロック内などの条件を要求する。複数ブロックとコードブロックは対象外。表セルなども対応ブロック・位置解決条件から、そのまま対応済みとはいえない。Markdownの表示文字列と原文が異なる文字参照・エスケープ等にも検証が必要である。

`MarkdownViewer.tsx:68` 以降でMarkdown AST由来の位置を使い、テキストを分割して `<mark>` を生成する。ピクセル位置は永続アンカーではない。一方、192行付近では描画済み区間と重なる範囲をスキップするため、重複マーカーの全表示を保証できない。登録時の重複拒否も赤ペン向けであり、蛍光ペン全般の排他制御ではない。

### 4.4 永続化

`App.tsx` の作業保存はJSONのBlobを書き出し、読み込み時に復元する方式。HTML出力・再読込も存在する。`config/settings.ts` のlocalStorageはテーマ、言語、開発者モード用であり、会話・注釈の自動保存DBではない。

したがって「再起動後もマーカーが復元される」を自動復元とするなら、新規の永続化が必要である。

## 5. Draftへ優先して追記したい仕様

### 5.1 「ターン」は1発言

userとassistantの1発言をそれぞれ1ターンと定義する。1往復ではない。`sequence_no` は会話内で一意・単調増加、IDは表示順や日時と独立した一意IDとする。

確定済み本文はMVPでは編集・上書きしない。再質問・再試行の回答は新しいIDで追記する。モデル変更は次回リクエストから反映し、過去の回答モデルを変更しない。

### 5.2 位置は保存原文に対するUTF-16半開区間

推奨定義:

```text
start_offset: turn.contentの先頭からのUTF-16コード単位数
end_offset: 同じ座標系の終端（終端を含まない）
0 <= start_offset < end_offset <= content.length
sourceText === content.slice(start_offset, end_offset)
```

`sourceText` をDraftの必須候補へ加える。`targetText` はMarkdownの表示文字列なのでsliceとの一致条件にはしない。改行正規化は保存・位置計算前に一度だけ行い、保存後に再正規化しない。絵文字や結合文字の途中を切る選択は拒否または文字境界へ補正し、その方針を統一する。

復元時にsliceが一致しなければ `unresolved` とし、似た文字列へ黙って移さない。原文不変のMVPなら高度な再アンカーは不要。

### 5.3 「任意範囲」のMVP範囲を絞る

提案: 初期は「確定したassistant発言の同一段落・見出し・対応リスト項目内」に限定。複数段落、表、コードブロックは次段階とする。これを採用せず真に任意範囲を要求する場合、範囲マッピング拡張をPhase 1の必須工数として扱う。

同一ターン内の重複・包含するマーカーはMVPでは登録を拒否し、既存マーカーの編集へ案内する。隣接範囲は許可する。4色は同じデータ型で保持する。

### 5.4 コメントと送信質問を区別する

`Highlight.note` は保存メモ、`userQuestion` は送信時の今回の質問。メモを質問欄へ転記する操作は可能にするが、マーカーを作っただけでは送信しない。保存済みメモが後で編集されても、過去に送った質問・引用は変わらない。

独立付箋はPhase 3でよい。最初は `turn_id` に付くターン単位のメモとし、未定義の `position` やピクセル座標は導入しない。

### 5.5 Mode Bと通常チャットを分離する

通常チャットは、送信対象となる過去の完了発言を順番にmessagesへ入れる。長すぎる場合は黙って全文を送ったことにせず、履歴の切り詰め範囲を表示する。具体的な上限は利用モデルで実測して決定する。

Mode Bは、固定のアプリ指示＋対象の前後文脈・引用＋今回の質問だけを送る独立リクエストとすることを推奨する。通常履歴を自動追加すると、Mode A〜Dで比較する文脈条件が崩れる。

質問と回答は現在の会話末尾へ追記し、元の `highlight_id / source_turn_id` を関連付ける。MVPでは枝分かれUIを作らない。以後の通常チャットの履歴に再質問を含める際は、短い質問文だけでなく送信時の引用・文脈を復元する。

Mode Bの前後長は、**暫定的に原文各300 UTF-16コード単位**を提案する。これは有効性を確認した値ではない。Proofの60はアンカー補助値として維持できるが、AI質問の十分な文脈長を証明しない。60 / 300 / 1000程度の比較で見直す。切り出しは対象ターン内に限定し、サロゲート境界を避け、実際の切り出し範囲と文字列を保存する。

Mode C/Dの「前後3/5ターン」は対象発言を除く前後それぞれの発言数と明記する。対象発言はBの抜粋のみか全文かを統一し、提案はBの抜粋のみ。送信時点で存在する発言だけを対象とし、生成される回答自身は含めない。参照本文は実行指示として扱わない。

### 5.6 送信内容表示をPhase 2へ前倒しする

実際のリクエスト本文と対象モデルの確認はMode Bの成功条件であり、Phase 4まで待たない。送信に使う確定済みpayloadと確認表示を同じデータから生成する。

モデルID、推論パラメータ、strategy名と版、文脈長、参照ID、実送信messages、応答時間、取得できたusage、終了理由を記録する。推定トークン数とAPI実測値は区別する。同一payloadでも回答が同一になる保証はないため、「再現可能」は入力条件の再現を意味する。

### 5.7 生成・保存の状態を明示する

user発言とリクエスト記録を保存してから通信開始。assistant発言は `generating / completed / cancelled / failed` を区別する。正常終了後に本文と状態を保存し、保存完了後にマーカーを解禁する。

停止・切断時の部分本文はその状態を示して保持し、MVPではマーカー対象外。再起動時に残ったgeneratingは中断扱いにする。保存失敗を成功表示にしない。リクエストIDで二重クリック・再送による重複記録を防ぐ。途中内容の定期保存を採用するか、異常終了時に部分本文を失ってよいかも仕様化する。

## 6. 推奨データモデルの最小案

| エンティティ | 主な項目 |
|---|---|
| Conversation | id, title, created_at, updated_at |
| Turn | id, conversation_id, sequence_no, role, content, status, created_at, model_id?, request_id? |
| Highlight | id, turn_id, start_offset, end_offset, sourceText, targetText, contextBefore, contextAfter, color, note?, tag?, created_at, updated_at |
| Request | id, conversation_id, user_turn_id, assistant_turn_id, kind, source_highlight_id?, source_turn_id?, strategy_version, context設定, model_id, 推論設定, messages_snapshot, status, timing, usage?, finish_reason? |
| Note（後段） | id, turn_id, note_text, created_at, updated_at |
| Settings | 接続先、選択モデル、表示設定、履歴予算など |

会話内sequenceの一意制約、参照整合性、トランザクション、DBスキーマ版と移行処理を用意する。会話削除時の関連データ削除を定義する。マーカー削除後もRequestの送信スナップショットは残し、参照IDは履歴追跡用として扱う。認証情報は送信ログやバックアップに混ぜない。

モデル一覧そのものを固定テーブルへ複製する必要は薄い。選択中のIDと各リクエスト時のモデル情報を保存し、一覧は接続先から更新する。

## 7. LM Studio接続と保存構成

推奨経路:

```text
React UI → 同一originのローカルAPI → LM Studio
                        └→ SQLite
```

小さなNode.js / TypeScriptサーバーがAPI転送とDBを担当し、本番相当のローカル起動ではビルド済みUIも配信する。開発時のViteだけに依存するプロキシ構成で終わらせない。DBアクセスはRepository、AI接続はProvider、文脈選択はContextStrategyに分ける。

LM StudioはOpenAI互換のChat Completionsとストリーミング用の `stream` パラメータを提供する。初期接続は `http://127.0.0.1:1234/v1` を既定候補とし、`POST /chat/completions` に正確なモデルIDとmessagesを渡す。[公式Chat Completions](https://lmstudio.ai/docs/developer/openai-compat/chat-completions)

一覧取得は `GET /v1/models`。JIT有効時はダウンロード済みモデルも一覧に含まれ得るため、「一覧にある＝ロード済み」と表示しない。MVPのモデル変更は推論先IDの選択とし、モデルのダウンロード・ロード管理はLM Studio側に任せる。[公式List Models](https://lmstudio.ai/docs/developer/openai-compat/models)

ブラウザ直接接続ならCORS設定が関係する。LM StudioにはCORS、認証要求、LAN公開の各設定がある。推奨のローカルサーバー経由ではブラウザからLM Studioへの直接のcross-origin通信を避けられる。ローカルAPI自身はloopbackで待ち受け、想定originを検証する。[公式Server Settings](https://lmstudio.ai/docs/developer/core/server/settings)

通信アダプターで、分割されたストリームイベントの復元、キャンセル伝播、HTTPエラー、接続不可、モデルなし、初回ロード待ちを処理する。usageが返らないケースを許容し、値がない場合は不明とする。

比較すると、ブラウザ＋IndexedDBは実装が軽いが、ブラウザプロファイル・originに保存が依存する。今回の「長い会話を蓄積して使う」目的には、保存先を管理できるSQLite案を推奨する。MVPにJSONバックアップ・復元も含めると実験データを扱いやすい。

外部自動送信を行わない方針には、Markdown中の外部画像の自動読込も含める。画像は初期状態でプレースホルダーとし、ユーザー操作で開く。ローカル保存と、ユーザーの送信操作に基づくLM Studioへの送信を文書上で区別する。

## 8. 共通化とProofへの影響

最初は独立コピーを推奨する。優先移植対象はアンカー型、原文位置付与、選択変換、ハイライト描画。校正ラウンド・修正文・レビュー完了の状態は持ち込まない。出典パス・スナップショット情報・ライセンスを記録する。

Proof側を編集せず、Att-Chatからsample内ソースを直接importしなければ、Proofの挙動を変えるリスクを抑えられる。現段階の共通化は、単一文書と複数発言の違いを無理に吸収し、双方のUIを壊す可能性がある。

共通化の候補が安定したら、DOM探索先を引数で受ける位置マッピングと、UIから独立したアンカー検証を抽出する。READMEではソースはMIT、画像・キャラクター素材は対象外とされているため、ソースのライセンス表記を維持し、見た目の参考と画像素材の転載を区別する。

## 9. 推奨MVP順序と確認項目

1. **短い技術確認**: Plain text、強調、リンク、日本語・絵文字の選択が原文へ戻るか確認。LM Studioで一覧・非ストリーム・ストリーム・停止を確認する。
2. **Phase 0**: 独立アプリ、ローカルAPI、SQLite、会話一覧、通常チャット、モデル選択、生成状態、自動保存、バックアップ。
3. **Phase 1**: 確定本文の不変化、4色マーカー、登録・編集・削除、重複制御、保存復元、簡易マーカー一覧とジャンプ。
4. **Phase 2**: 単一マーカーからMode B、送信内容表示、入力スナップショット、元マーカーへの参照。
5. **Phase 3以降**: 独立付箋、色フィルタ、Mode A/C/D比較、miniMAP。Mode Eは別実験として最後に扱う。

マーカー一覧とジャンプは小さな形でPhase 1へ前倒ししたい。「読む・戻る」が主目的なので、位置を保存するだけではユーザー体験の成立を検証できない。

MVP受入確認:

- 保存後にアプリを閉じて開き、複数会話・複数マーカー・コメントが戻る。
- 同じ語が複数箇所にあっても、指定した発言・範囲にだけ復元する。
- 強調・リンク・絵文字でsourceTextの不変条件を満たす。対象外の選択は理由を表示する。
- 重複選択を許可したように見せながら、一部の色が消える状態を作らない。
- 過去のマーカーへ一覧から戻り、そこから質問できる。
- Mode Bの実送信に通常履歴・全文・色・他会話が混入しない。
- メモ編集、モデル変更、マーカー削除後も過去の送信内容を確認できる。
- 停止、切断、モデルエラー、保存失敗、二重送信が完了として扱われない。
- 長い履歴の送信範囲と切り詰めを確認できる。
- 外部画像を含むAI回答の表示だけでは自動アクセスしない。

## 10. 今決めること／後で決めること

**実装前に決める:** 選択対象範囲、重複方針、UTF-16原文位置、確定本文の不変性、Mode Bの履歴除外、送信内容の保存、生成中断状態、DB方式。

**実験で調整する:** 前後文脈長、通常チャットの履歴予算、利用モデル、応答時間の許容範囲、長文での描画性能。

**後回しにできる:** miniMAP描画方式、複数マーカー質問、独立付箋の文字内位置、Mode Eの取得プロトコル、正式名称。

Draft 0.1は構想書として十分に役立つ。次版では機能を増やすより、以上の境界条件と受入確認を追記すると、そのまま実装判断に使える仕様書になる。
