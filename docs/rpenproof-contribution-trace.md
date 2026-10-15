# RpenProof Contribution Trace — Reference Investigation

調査日: 2026-10-14。対象: Att-Chat HEAD `ec9e855` と調査時点のworking tree。
本書は技術史・設計史の調査であり、ライセンス義務の判定とは分離する。作成したのは本書だけで、コード・README・license・参照元は変更していない。

## 1. 結論

**RpenProofは「Att-Chat全体の母体」というより、「Marker機能の技術的祖先」と評価するのが適切である。**

特に、Markdown ASTの原文offsetをDOMへ渡し、ブラウザのSelection/Rangeを原文上の範囲へ戻し、その範囲を再描画する仕組みに、具体的なコード・処理構造の継承がある。「着想を得ただけ」では貢献を過小評価する。一方、RpenProofアプリ全体を複製してチャット化したことを示す証拠はない。Conversation/Turn/GenerationRun、モデル通信、SQLite/API、質問ワークフローなどは、Att-Chatの責務として段階的に構築されている。

Markerについても、原文位置対応の核への影響は大きいが、現在のMarkerCore全体がRpenProofコードということではない。安全な選択条件、Turn単位の不変anchor、永続化と検証、一覧・会話内移動・Quick Action等はAtt-Chatで追加または再構成されている。

## 2. 調査方法と証拠の限界

- Git履歴、導入コミットと現在のdiff、Phase 0/2A文書、参照元・保存snapshot・現コードを照合した。
- RpenProofの参照HEADは `dc5fe7fed394378ada3fd2376b0e611249304069`。当時の未コミット・未追跡内容も対象だったため、このHEAD単独を原本と扱わない。
- `docs/phase0-rpenproof-source-manifest.json` の72ファイルを現在の `sample/RpenProof` とSHA-256照合した。欠落0、相違0。
- 保存snapshotの主要3ファイル（App.tsx、MarkdownViewer.tsx、annotation.ts）は、現在の参照元と改行・末尾改行を正規化して一致した。
- 現在の `TurnMarkdown.tsx` と `marker.ts` は、Phase 2A導入コミット `48440e5` と改行正規化後に全文一致する。`git diff 48440e5 --` でも両ファイルの差分はない。
- `MarkerCore.tsx` 等にはHEAD後の未コミット変更がある。現在の評価はそのworking treeを含む。未コミット部分の導入日・個別コミットは確定できない。
- 実行時importがないことは、コードの系譜がないことを意味しない。逆に、一般的なDOM API・型名・短い式の一致だけを移植の証拠にはしない。
- テスト・build・実ブラウザ再検証は今回実行していない。過去文書の検証結果は当時の記録としてのみ参照する。

## 3. 時系列

| 段階 | 証拠 | 技術的変化 |
|---|---|---|
| RpenProof参照版 | 上記HEAD＋72ファイルmanifest＋3ファイルsnapshot | 校正アプリのMarkdown原文位置対応、選択取得、TextAnchor、注釈描画を参照 |
| Phase 0 PoC、2026-09-11 | `5c9658e`、phase0-provenance.md | Markdown描画を選択的に改変移植。選択処理を再実装。固定Turn・UTF-16/grapheme・JSON保存復元契約を追加 |
| Phase 1A | `27d8a40` | Conversation/Turn等のSQLite保存基盤を新設。Marker統合とは別工程 |
| Phase 1B | `f5a0597` | 実モデル通信・生成Run・streaming等を構築。Phase 2Aの統合先となる |
| Phase 2A、2026-09-13 | `48440e5`、phase2a-design.md | PoCを本体型/APIへ再構成し、TurnMarkdown/marker/MarkedTurnsとHighlight DB保存へ統合 |
| Phase 2B | `cdad567` | マーカー一覧・色フィルタ・ジャンプ等を追加 |
| Phase 3A/3B | `89752fc`、`aa111b5`、`7703b01` | Question Keep、既存会話への質問、新規会話への分岐を追加 |
| minimap | `d19fdec` | 会話とMarkerの位置を表示するminimapを追加 |
| Laboratory共通化、2026-09-18 | `4ee35eb` | MarkedTurnsからMarkerCoreを分離し、描画/選択/編集等を共通化 |
| 製品質問workflow、2026-10-03 | `d2e54a5` | MarkerCoreの拡張口と質問UI等を発展 |
| 現在 | HEAD `ec9e855`＋working tree | 原文対応の核を維持し、Quick Action・詳細UI・周辺導線を追加/変更 |

```text
RpenProof MarkdownViewer / captureDocumentSelection / TextAnchor
    ↓ 選択的改変・選択処理の再実装・データ概念の縮約
Phase 0 Markdown.tsx / selection.ts / types.ts / contracts.mjs
    ↓ Att-Chatの型・API・Turn状態・DBへ再構成
Phase 2A TurnMarkdown.tsx / marker.ts / MarkedTurns.tsx
    ↓ 一覧・ジャンプ・質問・minimap等の拡張、責務分離
現在 TurnMarkdown + marker + MarkerCore + 各機能のAdapter/周辺モジュール
```

## 4. 元処理と移植先の対応

元ファイルは `sample/RpenProof/`、当時の固定参照は `docs/phase0-reference-snapshot/` にある。下表の「新規」はこの系譜でRpenProofからの継承を確認しないという意味であり、一般的なアルゴリズムの発明者を主張するものではない。

| 元ファイル・関数/処理 | Phase 0 | Phase 2A → 現在 | 分類 | 残存・変更点 |
|---|---|---|---|---|
| `src/components/MarkdownViewer.tsx:37` `sourceOffsets` | `src/Markdown.tsx` の `offsets` | `src/client/TurnMarkdown.tsx` の `offsets` | 改変・再構成継承 | HAST position.start/end.offsetを数値検査して取り出す処理を短縮。現在も残る |
| 同:43 `resolveTextOffsets` | text nodeの原文slice一致、親範囲内の一意一致fallback | `positionPlugin`内の `own`/`range` とcode fallback | 改変・再構成継承 | 原文と表示文字の照合順序を継承。fallbackはインラインcodeに限定 |
| 同:56–65 `textNode`/`elementNode`/`sourceSpan` | `element` とspan/mark生成 | `element`、`data-s`/`data-e` | 改変・再構成継承 | HAST要素を作り原文位置をDOMへ渡す。専用sourceSpan関数は統合され、属性名も変更 |
| 同:68 `createSourcePositionPlugin` | `positionPlugin` | 同名の本体plugin | 改変・再構成継承 | textを原文範囲に分割する核を保持。元のrecords/Map収集と校正表示を、再帰walk/flatMap/cutsへ再構成 |
| 同pluginの注釈・highlight範囲描画 | resolved highlightのみの4色mark | resolved highlightをoffsetの切れ目で描画 | 再構成継承＋新規制約 | 校正置換・draftモード・赤ペン提案を除外。非重複anchorを前提とする単純化 |
| `src/App.tsx:519` `captureDocumentSelection` | `src/selection.ts` `captureSelection` | `src/client/marker.ts` `captureSelection` | 主にアルゴリズム/設計継承、実装は再構成 | Selection→Range→同一block→DOM原文offsetの経路を継承。Turn制約・TreeWalker検査等を追加 |
| 同関数の `resolveBoundary` | `boundary` | `boundary` | アルゴリズム継承 | DOMの基準offset＋text内offset。元のinline構文端への自動拡張は廃止 |
| `src/types/annotation.ts` `TextAnchor` | `src/types.ts` Highlight、contracts | `src/shared/contracts.ts` Highlight | データ設計継承＋再設計 | sourceText/targetText/範囲という区別を保持。snake_case化、turn_id導入。前後文脈・行番号等は引き継がない |
| 元のresolved/unresolved・原文/draft anchor | PoCの原文一致検査・unresolved | Repositoryの読込検査・unresolved固定 | 概念継承＋新規契約 | 状態語は元にもあるが、原文不変・自動再アンカーなし・復帰なしの具体的規則はAtt-Chat契約 |
| 対応する直接移植を確認せず | `contracts.mjs` `isBoundary`/`anchorProblem`/`overlaps` | `marker.ts`検証＋Repository/DB | Att-Chat新規 → 内部継承 | Intl.Segmenter、completed Assistant限定、重複拒否、UTF-16照合を追加 |
| 対応する直接移植を確認せず | `serialize`/`deserialize`、固定fixture、jump | DB/API、一覧/ジャンプ等 | Att-Chat新規 → 再構成 | PoC JSONの保存方式を製品へそのまま持ち込まず、DBへ置き換え |
| RpenProof DocumentMap | Phase 0では移植していない | `minimap.ts`等を後段で追加 | 直接コード継承の証拠なし | 「位置を俯瞰する」という類似だけでDocumentMap移植とは判定しない |

`TextAnchor`には元からsourceTextとtargetTextの両方がある。両者の区別そのものをAtt-Chatの新発明とするのは不正確である。一方、turn_id付きの不変anchorと保存時検証はAtt-Chat向けの契約化である。

## 5. 四分類による評価

### 5.1 直接コード継承

RpenProofのファイル/関数を無変更で丸ごと製品へ移した例は、今回追った中心経路では確認しない。短い構造・式の対応はあるが、多くは改名・縮約・責務変更を伴うため次項に分類する。

一方、主要3ファイルは `docs/phase0-reference-snapshot/` に記録用コピーとして存在する。**文書中の直接コピーと、製品で動くコードの継承量は分ける。**

また、Phase 2Aから現在へはTurnMarkdown/markerの全文がそのまま維持されている。この「Att-Chat内部での直接継続」と「RpenProofからの無改変コピー」を混同しない。

### 5.2 改変・再構成して継承

最も強い継承はMarkdownの原文対応rendererにある。offset取得、原文slice照合、一意一致fallback、原文位置付きspan、範囲分割という具体的対応と、明示された出典記録が揃う。選択処理も、同一blockを確認して原文位置へ変換する骨格を引き継ぎ、Turn単位の安全条件へ再構成している。

### 5.3 アルゴリズム/設計思想だけの継承

- 表示された単語を全文検索して場所を推測するのでなく、描画時に原文位置を埋め込む。
- 見た目の選択文字と原文文字列を区別する。
- 注釈を表示DOMだけに結び付けず、原文の範囲へ結び付ける。
- Markdown表示と原文が一致しない場面を扱う必要があるという問題設定。

これらはMarkerの基礎設計への大きな影響である。ただし、ASTやRangeの一般的利用自体をRpenProof固有の発明とは扱わない。

### 5.4 Att-Chat側で新規に作られた部分

- Conversation/Turn/GenerationRunと実モデル通信、streaming、cancel、request snapshot。
- completed Assistantだけを対象にする制約、確定本文とanchorの不変性。
- UTF-16/grapheme境界、同一Turnの重複/包含拒否、未対応textを横断する選択の拒否。
- HighlightのSQLite schema、migration、Repository、HTTP CRUD、source再検証。
- PoC固有の固定fixture・JSON保存復元・検証suite。
- Marker一覧・フィルタ・会話内ジャンプの製品実装、MarkerCore分離と拡張口。
- Question Keep、Immediate Ask、Question Box、Handoff等のチャット操作。
- 現在のQuick Action、詳細UI、Settings/Collections、Electronの保存先・配布・終了処理。

後半の周辺機能は対象Markerコードのimport/利用関係とプロジェクトの責務境界から独立性を評価したものであり、全ファイルの創作起源を証明する全コード監査ではない。

## 6. 途中で除去・置換されたもの

| 元/中間の仕組み | Att-Chatでの扱い |
|---|---|
| 赤ペン校正、replacementText、draftAnchor、original/draft比較、reviewer等 | Markerの核には移植せず、会話本文上のmarkへ縮約 |
| 親node内の一般的な一意文字列fallback | インラインcode内の一意一致だけへ限定 |
| inline構文端を含めるための選択offset拡張 | 削除。選択から確実に対応する範囲を採用 |
| 文書のcontextBefore/After、行番号、paragraphId等を持つTextAnchor | turn_id＋UTF-16半開区間＋source/targetへ再設計 |
| PoCのclient生成ID/日時を含むHighlight候補 | 本体captureSelectionはHighlightDraftを返し、保存責務をAPI/Repositoryへ分離 |
| PoC JSON保存・復元 | 製品のSQLite/API・起動時状態管理へ置換 |
| Phase 2AのMarkedTurns内のMarker UI | 後段でMarkerCoreへ分離。原文対応の2モジュールは維持 |
| RpenProof DocumentMap | Phase 0移植なし。後段minimapへの直接移植も今回の証拠からは認定しない |

現在のminimapは `viewportRange`、`markerLanes`、`measureMinimap` により会話DOMの実測位置を扱う。類似UIの存在だけを系譜の証拠にしない。

## 7. コード量・影響の定性的評価

物理行数の割合は出さない。現在のTurnMarkdown/markerには複数処理を一行へまとめた箇所があり、改行数の比較は寄与を歪める。変数名・型・契約も変更されているため、文字列一致率を貢献率として扱わない。

| 観点 | 評価 | 根拠 |
|---|---|---|
| RpenProof → 現製品の無改変・直接継承行 | 小／限定的 | 丸ごとの実行ファイル移植なし。短い式だけで由来を断定しない |
| 強く類似する処理・再構成継承 | Markerの原文対応核では中〜大、アプリ全体では限定的 | rendererとSelection変換に具体的対応が集中 |
| 設計影響 | Marker基礎では大 | 原文offsetを介した描画・選択・再描画の方式を継承 |
| Att-Chatによる再実装・新規実装 | アプリ全体では大 | chat/backend/persistenceとMarkerの安全契約・操作workflowを追加 |
| Phase 2A → 現在の原文対応核 | 継続性が非常に高い | TurnMarkdown/markerの全文一致を確認 |

「完全再実装」は外形が似ていれば確定できる区分ではない。captureSelectionは本体用に書き直されていても、設計経路を継承しているため「RpenProofの影響なし」には分類しない。

## 8. 最終評価

1. **Att-Chat全体への影響**: 文書校正由来の原文位置付き注釈技術が、会話の一部を指し示すMarkerの出発点になった。アプリ全体のデータモデル・生成基盤を提供したわけではない。
2. **Markerへの影響**: 大きい。特に原文位置を保持するMarkdown描画と選択変換は、明示的な選択的移植と再構成の系譜を持つ。現在もそのPhase 2A実装が残る。
3. **現在独立している部分**: 実行時には参照元/PoCを必要とせず、型・API・永続化・生成・操作UIはAtt-Chatのモジュールとして成立している。ただし実行時独立性は歴史的貢献を消さない。

推奨する説明は、**「Att-Chatは独立したチャットアプリとして構築され、そのMarker基盤にはRpenProofのMarkdown原文位置対応・選択技術を選択的に改変継承した」**である。

## 9. 主な根拠

- [Phase 0移植記録](phase0-provenance.md)、[元ファイルhash一覧](phase0-rpenproof-source-manifest.json)
- [保存したMarkdownViewer](phase0-reference-snapshot/src/components/MarkdownViewer.tsx)、[App](phase0-reference-snapshot/src/App.tsx)、[annotation型](phase0-reference-snapshot/src/types/annotation.ts)
- [PoC renderer](../experiments/selection-poc/src/Markdown.tsx)、[選択変換](../experiments/selection-poc/src/selection.ts)、[契約](../experiments/selection-poc/src/contracts.mjs)
- [Phase 2A設計](phase2a-design.md)、[対応範囲](phase2a-markdown-support.md)、[当時の検証記録](phase2a-results.md)
- [TurnMarkdown](../src/client/TurnMarkdown.tsx)、[marker](../src/client/marker.ts)、[MarkerCore](../src/client/MarkerCore.tsx)、[minimap](../src/client/minimap.ts)
- [Repository](../src/server/storage/repository.ts)、[Highlight migration](../src/server/storage/migrations/003_highlights.sql)

再確認に使用した代表コマンド: `git log --reverse --format='%h %s' -- <対象ファイル>`、`git show <commit>:<path>`、`git diff 48440e5 -- src/client/TurnMarkdown.tsx src/client/marker.ts`、manifest記載72ファイルのSHA-256照合。参照元への書込み、Git操作による履歴変更は行っていない。
