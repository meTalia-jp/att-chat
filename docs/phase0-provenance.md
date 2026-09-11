# RpenProof選択的移植の出典

参照元: `D:/att-Chat/sample/RpenProof`。Phase 0では参照専用。

HEAD: `dc5fe7fed394378ada3fd2376b0e611249304069`。未コミット・未追跡ファイルがあるため、HEADだけを移植元とはしない。

開始時点の72ファイルのSHA-256を [source-manifest](./phase0-rpenproof-source-manifest.json) に保存。node_modules、.git、dist、.tmp-testは除外。終了時に同じ72ファイルを再ハッシュし、変更0件を確認した。Gitの既存変更を戻す操作も行っていない。

参照した主要3ファイルは `docs/phase0-reference-snapshot/src/` にも保存した。これは内容確認用にLF・末尾改行を正規化したテキストスナップショットであり、元ファイルのバイトハッシュはmanifestを正とする。

| 元パス | 利用内容 | PoC側のファイル・変更 |
|---|---|---|
| src/components/MarkdownViewer.tsx | sourceOffsets、resolveTextOffsets、elementNode/sourceSpan、ASTへ位置を付与してテキストを分割する構造を選択的に改変移植 | src/Markdown.tsx。短いoffsets/element関数として再構成。校正・置換表示を除去。4色markに限定。fallbackをインラインコード内の一意一致だけに縮小。pre/tableと未マップ領域を除外 |
| src/App.tsx のcaptureDocumentSelection | Selection/Rangeからdata属性を介して原文位置を得る手順を参考に再実装 | src/selection.ts。Turnスコープを必須化。UTF-16とgrapheme検証追加。構文端の自動拡張を削除。中間の未マップ文字も拒否。重複判定はcontracts.mjsに分離 |
| src/types/annotation.ts | TextAnchorの原文範囲・引用の概念を利用 | src/types.ts、contracts.mjs。snake_caseに統一、source_text/target_textを分離。校正者・修正文・replacementText・前後文脈を持たない |

元ファイル丸ごとの実行コードコピーは行っていない。新規作成: 固定Turn fixture、保存・検証契約、PoC UI、単体テスト、ブラウザテスト、CSS。DocumentMapは今回移植していない。

実行時依存はPoC自身のpackage.json/package-lock.jsonとnode_modules。sample/RpenProofの実行時importなし。依存パッケージのバージョン選定には参照元pnpm-lock.yamlも利用し、PoC側で独立インストールした。

MIT著作権・許諾文は [LICENSE-RpenProof.txt](../experiments/selection-poc/LICENSE-RpenProof.txt) に保存した。画像・キャラクター・ロゴはコピーしていない。
