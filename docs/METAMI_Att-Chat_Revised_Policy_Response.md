# METAMI Att-Chat 仕様変更方針への回答

検討日: 2026-09-11

対象: `C:/Users/eigo/Downloads/METAMI Att-Chat 再検討結果・仕様変更まとめ.md`

関連: [前回の検討結果](./METAMI_Att-Chat_Spec_Review_v0.1.md)

## 1. 全体評価と調整が必要な点

今回の変更方針は技術的に成立する。特に、参照メモを第一の用途にしたこと、Highlightと質問を分けたこと、不変のTurnから質問時に文脈を生成すること、GenerationRunを最初から記録することに賛成する。前回提案したHighlightへのcontextBefore/contextAfterの常時保存は撤回し、今回の責務分離を採用するのがよい。

次の点は矛盾というより、実装前に境界を定める必要がある。

| 論点 | 推奨する整理 |
|---|---|
| TurnまたはRevision | 最初は新しいTurn IDに統一。Revisionを同時導入しない。将来Revisionを導入するならマーカーは特定Revisionを参照する |
| 1マーカー＝1Turn | 妥当。ただし同一Turn内の複数段落・表・コードの対応を保証する規則ではない。PoCで別途確定する |
| Phase 4で「このチャットで聞く」、Phase 5でMode B | Phase 4は保存・一覧・質問欄への読込まで。参照付き質問の実送信と新チャット開始はPhase 5で実装する |
| 完全データJSONとMD＋JSON復元 | JSONにTurn本文も含める自己完結形式を推奨。MDは可搬な閲覧用表現で、組合せ読込時に一致を検証する |
| 基本機能の出力がPhase 8 | 最小プロトタイプと全体完成範囲を分ければ成立する。Phase 0で出力契約を決め、Phase 3までにJSONバックアップ、Phase 8で三点セットを完成させる |
| GenerationRunの再現性 | アプリから送った入力条件の再現を保証範囲にする。同じ出力や、サーバー側チャットテンプレートまでの完全再現は別問題 |

「参照メモ」はマーカーの通常用途を表すUI概念とし、Highlightへ質問状態を追加しない。QuestionKeepやRunの有無から必要な表示を導く。

最初の到達点は新ロードマップのPhase 3終了、すなわち「会話・マーカー・メモ・自動復元・一覧ジャンプ」とするのが明快である。本回答では設計検討のみを行い、PoCや本実装は開始していない。

## 2. データモデルの修正案

以下は論理モデルであり、この段階で全テーブルを作る必要はない。命名はsnake_caseへ統一する案を示す。

| エンティティ | 最小項目・関係 |
|---|---|
| Conversation | conversation_id, title, created_at, updated_at。将来origin情報を任意追加 |
| Turn | turn_id, conversation_id, sequence_no, role, content, status, created_at, finalized_at?, retry_of_turn_id? |
| Highlight | highlight_id, turn_id, start_offset, end_offset, source_text, target_text, color, note?, created_at, updated_at |
| QuestionKeep（Phase 4） | keep_id, highlight_id, question_draft, memo?, status, created_at, updated_at, asked_at? |
| GenerationRun | 下記第4節。user_turn_idを通じた質問とassistant_turn_idを通じた回答の対応を持つ |
| Note（後期） | note_id, turn_id, note_text, created_at, updated_at。最初はTurn単位 |

重要な契約:

- Turnは1往復ではなく1発言。sequence_noは会話内で一意。IDを順序として使わない。
- completedになったTurn.contentは不変。生成中だけ部分本文を更新できる。cancelled/failedの部分本文も終了後は凍結する。
- マーカー対象は最初はcompletedのassistant発言。User発言へのマーカーはモデル上は可能だが、初期UIの必須要件にはしない。
- `source_text === content.slice(start_offset, end_offset)` を必須とする。offsetは原文UTF-16コード単位の半開区間を第一候補とする。
- `target_text` はユーザーが選んだ表示文字列の記録。Markdown記号を含むsource_textと異なるため、追加保存を推奨する。前後文脈の固定保存とは目的が異なる。
- 改行はTurn確定前にLFへ統一する案とし、確定後には正規化しない。受信文字列との完全なバイト一致を必要とする実験では、生レスポンスを別に保存する。
- noteは任意。無記入のマーカーも作成できる。質問意図タグはHighlightではなく質問・Run側に置く。
- MVPの重複範囲は拒否、隣接は許可。同じTurnでも複数の離れたマーカーは許可する。
- 復元時にアンカーが一致しない場合は不整合として示し、同じ語の別位置へ自動で移さない。

再試行は新しいRunと新しいassistant Turnを作り、元のuser Turnを再利用する。`retry_of_run_id` を記録する。通常チャットへ送る履歴は失敗・中断回答を除き、同じ質問への複数回答がある場合は採用した回答だけを選ぶ。この選択規則もrequest_snapshotに反映する。

## 3. HighlightとQuestionKeepの分離

関係は `Highlight 1 : N QuestionKeep` を推奨する。同じ箇所に「意味を聞く」「自分の環境に適用できるか聞く」という異なる疑問を残せる。単純なUIでは、まず1件だけを見せてもよい。

- Highlight.note: 対象箇所について長く残すメモ。
- QuestionKeep.question_draft: 将来聞きたい質問。空でもキープ可能とし、実行時には質問を必須にする。
- QuestionKeep.memo: 質問を保留する理由など。初期UIでは省略してもよい。
- GenerationRun.user_question: 実際の送信時に確定した質問。後からquestion_draftを編集しても変更しない。

statusは `pending / asked / dismissed` を採用できる。ただしaskedは「有効な回答が得られた」ではなく、**送信処理を開始した履歴がある**という意味にする。

pendingからaskedへの変更は、Runを作っただけでは行わない。通信アダプターが送信を開始した時点をアプリの基準にし、Runへdispatched_atを記録する。これは相手側受信の証明ではない。送信前の検証失敗はpendingのまま、送信開始後の切断はasked＋Run失敗表示とする。ユーザーがpendingへ戻す操作も許可する。

質問キープには送信中・失敗などの状態を重ねず、関連Runのoutcomeを表示する。再質問は新しいRunとして追加する。KeepとRunも1対多とする。

参照整合性の提案:

- pendingのKeepがあるHighlightを削除する場合、そのKeepも一緒に削除されることをUIに示す。孤立したpending質問を残さない。
- 過去RunはマーカーやKeepを削除しても維持する。Runには引用・参照元情報のスナップショットがあり、実体へのリンクはnullableとしてよい。
- 会話全体を削除すると、その会話が所有するRunも削除対象。他の会話へ既に派生したRunや引用までは連鎖削除しない。

新チャットへの派生は、会話のorigin情報と起点Runの両方で追跡する。`source_conversation_id / source_turn_id / source_highlight_id` に加え、送信時の引用と文脈を保存する。元会話が削除されても派生先の起点は読めるようにする。

## 4. GenerationRunのMVP最小構造

通常チャットのPhase 1から、1送信試行につき1Runを記録する。別のExperimentLogテーブルへ同じ情報を二重保存する必要はない。比較UIはRunを集計すればよい。

```text
run_id
conversation_id                 # 回答が所属する会話
user_turn_id
assistant_turn_id               # 予約した新規assistant発言
retry_of_run_id? / keep_id?
kind                            # chat | highlight_question
user_question                   # 送信時の質問文
intent_tag?                     # 自由入力質問なら不要
model_id
provider                        # lm_studio
context_strategy                # chat_history | mode_b ...
strategy_version
strategy_parameters             # 設定値。通常チャットなら履歴予算等
reference_snapshot              # 初期chatでは空配列
request_snapshot                # 実送信payload。認証ヘッダーは含めない
started_at / dispatched_at? / finished_at?
duration_ms?
outcome                         # preparing | running | succeeded | failed | cancelled | interrupted
error?                          # code, message。認証情報は除く
finish_reason?
input_tokens? / output_tokens?
usage_source                    # api | estimated | unavailable
```

request_snapshotにmodel、messages、temperature、出力上限など実送信payloadを含める。アプリ独自の設定・参照IDは併記するメタデータであり、モデルへ不要に送らない。接続先の識別も保存するが認証情報は除く。指定しなかった推論パラメータはサーバー既定値依存と記録し、実値を推測しない。

Run作成・user発言保存・assistant予約をDBトランザクションで確定し、通信開始前にrequest_snapshotを凍結する。終了時は回答本文、Turn状態、Run結果をまとめて保存する。通信完了後にDB保存が失敗した場合、成功表示にせず保存再試行の対象にする。

アプリ再起動時のpreparing/runningはinterruptedへ整理する。自動再送はせず、新Runで再試行する。トークン数が取得できない場合はnullであり、0にしない。duration_msはアプリの開始から終了までの経過時間と定義し、純粋な推論速度と混同しない。

Mode B導入時にstrategy_parametersへ比率・予算、reference_snapshotへ実際の抜粋範囲と文字列を追加する。初期から未実装Modeの専用カラムを大量に設ける必要はない。

## 5. 質問時のContextBuilder

Highlightに文脈を保存しない変更は問題ない。不変Turnと位置から生成でき、異なる比率の比較もしやすくなる。再現のための保存場所は、マーカーではなくRunとする。

提案する定義:

```text
context_total = 対象引用を除く、前後文脈の合計予算
unit = utf16_code_unit
before_ratio = 0〜1
after_ratio = 1 - before_ratio
before_budget = floor(context_total * before_ratio)
after_budget = context_total - before_budget
```

比率を独立した2値として編集させず、片方から補数を求める。最初の比較基準は600・5:5でよい。6:4、7:3は同じ合計予算で比較する。前側が常に有利という前提は置かない。

対象Turnの先頭・末尾に届いたときは、初期版では余りを反対側へ再配分しない。たとえば600・7:3で前文が100しかなければ、前100・後最大180とする。設定比率と実際の比率は異なるため、次をRunへ残す。

- 要求したtotal、比率、単位、端での切り詰め方針。
- 実際のbefore_size / after_sizeと原文範囲。
- context_before / target_text / context_after、およびsource_text。
- 境界補正後の実際の文字列を含むrequest_snapshot。

サロゲートや結合文字を分断しないよう、文脈側の外端を内側の文字境界へ寄せる。質問・引用・アプリ指示にも長さがあるため、context_totalはモデル入力全体のトークン上限ではない。全payloadが上限を超える場合の縮小・拒否は別規則にする。

Markdown原文の前後文脈と表示上のtarget_textを組み合わせる方式は可能。ただし太字やリンクの記号が抜粋境界に残る場合がある。初期は構造化した引用データとして扱い、完全なMarkdown文書だと仮定させない。表示プレーンテキストから切り出す方式は、将来別strategy_versionとして比較できる。

Mode Bには通常会話履歴を暗黙追加しない。現チャットで聞くか新チャットで聞くかは保存先の違いであり、同じMode Bなら入力規則は同じにする。後続の通常チャットでは、参照付きuser発言から当時の引用文脈を復元して履歴を組む。

## 6. MD＋JSONによる復元案

最も明確なのは、**attchat.jsonが完全復元の正本、chat.mdが同じ会話を読むための表現**という方式である。JSON単独出力を開発者向けに用意する構想とも整合する。

「chat.mdは原文そのまま」は、次のように定義すると実装できる。

- 各Turn.contentを一字も変更せず出力する。
- 話者を区別するため、本文の外に通常のMarkdown見出しと区切りを追加する。
- マーカー、メモ、内部IDなどはMDへ挿入しない。
- 追加見出しも禁止する場合は本文の連結だけになるが、話者の識別と可読性が弱まる。

Turn本文自身に同じ見出し・区切りが登場し得るため、MDを見出しで分割して完全復元する設計にはしない。JSONのTurn配列に本文・role・順序を保存し、それを復元する。必要ならMD上の本文位置をUTF-8バイト区間としてJSONに記録できるが、JSONに本文があれば必須ではない。

もし「本文をJSONに重複保存したくない」が必須なら、代替はJSONへ各TurnのMD内UTF-8バイト範囲・role・ID・本文hashを保存する方式。ただしJSON単独では完全復元できず、バイト位置とHighlightのUTF-16位置を別管理する必要がある。現方針には自己完結JSONの方が適している。

完全復元とは会話単位の保存データと関連履歴を指し、実行中の通信、API認証情報、LM Studioのモデルファイル、サーバー設定は含まない。派生元の別会話を同梱しない場合、そのリンクは外部参照として保持し、引用スナップショットを表示する。

chat.htmlは同じエクスポートスナップショットから作る閲覧専用成果物。復元元にはしない。本文やメモを安全にエスケープし、外部画像・スクリプトを自動読込しない。★や色はCSS・テキストで再現する。

## 7. export_idとSHA-256

JSONのルートへ以下を追加する。

```text
format: metami-attchat
schema_version
export_id
conversation_id
generated_at
chat_file: chat.md
chat_encoding: utf-8
chat_bom: false
chat_newline: lf
chat_sha256
markdown_serializer_version
```

出力手順:

1. DBから一貫した会話スナップショットを取得する。
2. そのスナップショットからMDを一度生成し、UTF-8・BOMなしのバイト列へ変換する。
3. **実際にファイルへ書くそのバイト列**のSHA-256を求める。
4. 同じexport_idのJSONとHTMLを生成する。途中で最新DBを読み直さない。
5. 通常出力は3ファイルを一つのZIPにまとめると、取り違えを減らせる。ZIP化は提案であり必須ではない。

読込手順:

1. JSONの形式・版・必須項目を検証する。
2. MDの生バイト列をハッシュ化してchat_sha256と比較する。比較前に改行やBOMを正規化しない。
3. 対応するserializer_versionでJSONからMDを再生成し、読み込んだMDと一致することも検証する。ハッシュ照合だけではJSON内Turn本文との一致は確認できない。
4. ID一意性、Turn順序、参照関係、offset境界、source_text一致を検証する。
5. 検証完了後にトランザクションで取り込む。失敗時は既存DBを変更しない。

ハッシュ不一致は「正しいペアとして復元できない」とする。編集済みMDを取り込むなら新規会話扱いとし、既存マーカーの位置をそのまま当てない。JSON単独復元は明示的に選択できる別経路にする。

export_idは出力一回の識別子であり、MD内にない以上、MDとJSONの対応をそれだけで判定できない。対応判定はhash、同じ出力の識別はexport_idで行う。内容が同じMDならhashが同じでも正常。SHA-256は整合性確認であって、作成者証明や改ざん者に対する署名ではない。

既存会話とIDが衝突した場合は黙って上書きしない。初期は新規コピーとして取り込み、所有データのIDを一括再割当し内部参照を更新する方式を推奨する。元IDとimport元export_idは来歴として残す。外部会話への参照は所有IDと区別する。

## 8. 選択PoCの最低限のケース

モデル通信なしの固定Markdownで検証できる。PoCは対応範囲を決めるためのものなので、全ケースを選択可能にすることは合格条件ではない。

| ケース | 確認内容・期待 |
|---|---|
| 日本語と英数字の通常段落 | 正しいsource_textとUTF-16範囲。先頭・末尾を含む |
| 同じ語が同一Turn内に複数出現 | 選択した出現位置にのみ描画・復元 |
| 別Turnに同じ文章 | turn_idによって混同しない |
| 絵文字、家族絵文字、結合文字 | サロゲートや見た目の1文字を分断しない。境界補正を検証 |
| 太字全体・一部・前後をまたぐ選択 | source_textとtarget_textを区別し、原文記号込みの範囲を確認 |
| リンクラベル全体・一部 | URLまで選んだ扱いにするかを明記。描画のずれを起こさない |
| インラインコード | バッククォート、連続空白などを含む位置対応を確認 |
| コードブロック・複数段落・表 | 対応か明示拒否かを固定。誤った範囲を登録しない |
| 重複・包含・同一・隣接 | 重複3種を拒否し隣接を許可、既存表示を壊さない |
| `&amp;`やMarkdownエスケープ | 原文と表示の長さの差を検証。未対応は明示拒否 |
| 逆向きドラッグ・要素境界選択 | 通常選択と同じ範囲、または安全な明示拒否 |
| Turnをまたぐ選択 | 必ず拒否 |
| 生成中Turn | 登録不可。確定・保存後だけ許可 |
| 保存・再読込・画面幅変更 | DOMや改行表示が変わっても同じ位置へ戻る |

純粋関数テストではアンカー検証とUnicode境界を確認し、実ブラウザのPoCではDOM Rangeからの位置変換・描画・ジャンプを確認する。JSON値だけのテストで選択処理の成功とはしない。

## 9. 推奨ディレクトリ構成

現在の `D:/att-Chat` を新アプリのルートとして使う。別の開発フォルダをさらに作る必要はない。以下は将来作成する構成案で、今回は作成していない。

```text
D:/att-Chat/
  docs/                         仕様・決定事項・PoC結果・移植出典
  experiments/
    selection-poc/              固定文書による選択検証
  sample/
    RpenProof/                  参照専用
  src/
    shared/
      contracts/                Turn・Highlight・Run・出力スキーマ
      anchor/                   UTF-16範囲検証
      context/                  ContextBuilder・Strategy
    client/
      components/
      features/
        chat/
        markers/
        navigation/
        question-keep/          Phase 4以降
      styles/
    server/
      routes/
      providers/                LM Studio通信
      generation/               Run状態・ストリーム・再試行
      storage/
        migrations/
        repositories/
      export/                   serializer・検証・import
  tests/
    unit/
    integration/
    browser/
    fixtures/
  data/                         ローカルDB等。Git管理外
```

前回のReact / TypeScript＋ローカルサーバー＋SQLite案を維持する。現段階で複数パッケージのmonorepoにする必要はない。具体的な依存ライブラリとバージョンは実装開始時に決める。

sharedからclient/serverを参照せず、sampleからの実行時importも行わない。移植したファイルの元パス・参照スナップショット・変更点をdocsに記録する。

F5Aの実行可能モデル・同時実行数はCPU名だけでは判断しない。Phase 1では実機の利用可能メモリと小さなモデルによる応答を確認し、まず同時生成を1件に制限する案とする。性能測定時は他のLLM処理の有無を記録する。

## 10. Phase 0からPhase 1への合格条件

必須条件は次の6点。

1. **データ契約が確定**: UTF-16半開区間、Turn不変性、source_textとtarget_textの区別、改行方針、ID・順序、生成状態が文章化されている。
2. **通常段落の選択が安定**: 日本語、繰り返し文字列、別Turnの同文、基本的な絵文字で誤った位置に登録されない。
3. **対応範囲が明示**: 太字・リンク・コード・複数段落等について「対応／制限付き／拒否」の表と再現手順がある。未対応を成功扱いしない。
4. **保存復元が成立**: PoCでJSONへ保存し、再読込・再描画後に同じ範囲とジャンプ位置が戻る。SQLiteの完成はPhase 1でよい。
5. **不正操作で破損しない**: Turn横断・重複・範囲外・source_text不一致を拒否できる。
6. **後続の契約がある**: 通常チャット用Runの最小スキーマ、JSON正本とMDの関係、再試行時のID規則を決める。通信・複合出力そのものはまだ不要。

これを満たしたらPhase 1で実際のチャット・自動保存・生成停止を実装できる。通常段落でも選択位置が不安定なら、Phase 1と並行して見切り発車するより先に位置マッピングを修正する。

新方針に合わせた到達点は、Phase 0＝選択とデータ契約の成立、Phase 1〜3＝第一の柱、Phase 4〜5＝質問の保留と再利用、Phase 6以降＝比較と可視化の拡張、と整理できる。Mode EはA〜Dの比較が成立してから独立に着手する。
