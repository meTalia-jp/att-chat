# Context Correction v0.1 Report

2026-09-29実施。Marker Quick Action Experimentの継続実験。**Human review: pending（全16 Run）**。本番採用判断は行わない。

## Purpose / Hypothesis

過去Markerへの短い質問に、Source Turn以前の文脈を追加すると、対象・既知前提・説明開始レベルが変わるかを初回回答だけで比較する。Question Boxの「質問する」へは未接続。

## Fixture / Marker

[固定fixture](../../src/laboratory/context-correction/fixture.ts) `physics-40-v1` は人工会話40 Turn、User/Assistant交互。T1–10はニュートン力学・運動量、T11–20は保存則・対称性、T21–30はLと作用・変分、T31–40は自由粒子・近似へ連続する。人間の実会話ではない。

| Marker | source Turn / 固定引用 | 質問 | 正しい前提・期待話題 |
|---|---|---|---|
| A | T8「これは保存されます。」 | これはどういう意味ですか？ | 外力ゼロの二台の総運動量。ベクトル・F=ma・運動量は既知。速度・運動エネルギーとは区別 |
| B | T18「それが重要です。」 | なぜですか？ | 時間並進は粒子の停止ではなく法則の不変性。空間並進/運動量と時間並進/エネルギーの区別。Noetherの数式は未習 |
| C | T26「この方法では、実際の軌道のまわりで作用の一次の変化がゼロになります。」 | ここがよく分かりません。 | 時刻・位置の両端固定で軌道を比較する停留作用。作用・変分は初学、F=ma再説明不要。常に最小ではない |
| D | T36「この量は小さい」 | これはどういう意味ですか？ | ε=abs(x)/ℓ。絶対エネルギーではなく相対的尺度。高次項の比較も必要。無次元量・Taylor展開・基準値任意は既知 |

曖昧語は他Turnでも使用する。IDとoffsetを固定し、同文検索による別Turnへの付け替えはしない。期待前提metadataはPreviewで閲覧可能だが送信しない。教材は独自作成。力学上の照合資料: [David Tong, Lagrangian Formalism §2.1, §2.4, §2.6](https://davidtong.org/teaching/classical-dynamics/dynhtml/S2)（停留作用・対称性・小振動）。資料本文をモデルへ追加していない。

## 比較条件 / Model

- A: Marker Focusと質問のみ（参照文脈は「なし」）。
- B: 既存Mode B `same_turn_context` の300 UTF-16、前後5:5 window。今回4 Sourceとも短いため**実際にはSource全文が収まる**。
- C: Source全文＋直前2 Turn＋Focus＋質問。
- D: Source全文＋直前6 Turn＋Focus＋質問。
- Sourceより後のTurnは含めない。Source内のMarker後の文章はB/C/Dに含む。会話履歴はラベル付き引用として1 user messageへ入れ、全条件同じsystem messageを使う。
- `unsloth/gemma-4-12b-it-qat`、LM Studio localhost:1234、temperature=0、max_tokens=2048、stream=true。実施前のloaded model情報はQ4_K_XL。既存LMStudioProviderを直接再利用し、SingleTextServiceの固定temperatureとは切り離したLab専用CLI。
- 各Marker内のquestion/Focus/model/system/パラメータは固定。変更は参照文脈の内容・量。A→B→C→D、Marker A→Dの固定順で各1回、独立した最初の回答を取得。返答を次のrequestへ混ぜない。
- seed・LM Studio内部のchat template/推論設定は変更していない。temperature=0でも完全再現保証はしない。モデルファイル自体のhash、サーバーversionは未記録。

## Automatic / factual

[16 Runの投入量表・全回答](context-correction-v01-data/responses.md)、[全送信前Preview](context-correction-v01-data/preview.json)。個別JSONに実送信request、SHA-256、開始/終了UTC、回答、diagnostics、human_reviewを保存した。production Run schemaは使用しない。

16/16がerrorなし・stop終端。Marker一致、後続Turnなし、現在のPreviewと保存request一致を別スクリプトで検証。Context Turn数はA=0/B=1/C=3/D=7（AでもFocus元Turnは存在）。入力/出力文字数はUTF-16でありtokensではない。token usageは全件null。reasoningは文字数診断のみで内容は保存しない。

## Codex first review（主観、採用判定ではない）

各表の「対象」は話題特定と説明の正確さを区別して読む。○=観察できた、△=部分的/不明、×=不成立。前提○は全既知事項の網羅を意味しない。「余計」は無関係な過去話題への牽引。「再説明」は今回の質問への必要な言い換えと過剰な基礎説明を区別する。長さだけで品質判定しない。

### Marker A / T8 — これはどういう意味ですか？

| 条件 | 対象特定 | 前提引継ぎ | 再説明 | 余計な文脈 | Context量 / 回答長 |
|---|---|---|---|---|---|
| A | × データ保存として説明 | × 判断材料なし | 一般語義のみ | なし | 0 / 127 |
| B | ○ 二台の総運動量 | △ 既知状態は明示しない | 過剰な基礎再説なし | なし | 204 / 235 |
| C | ○ 同上 | ○ 衝突とエネルギーを区別 | Bに近い | なし | 350 / 224 |
| D | ○ 同上 | ○ 摩擦無視を補足 | Cに近い | なし | 633 / 235 |

必要前提: Aは参照対象を欠き「不明」とも断るが、導入は情報保存へ逸れる。B以降は外力ゼロを示し、ベクトルの定義を最初から再講義せず開始レベルは自然に見える。Bの「総運動量だけ」はこの衝突の比較量に限定すべきで、全エネルギー保存の否定と読ませない注意が必要。C/Dの追加履歴による大きな改善は認めにくい。

### Marker B / T18 — なぜですか？

| 条件 | 対象特定 | 前提引継ぎ | 再説明 | 余計な文脈 | Context量 / 回答長 |
|---|---|---|---|---|---|
| A | × 特定不能と回答 | × 材料なし | 説明なし | なし | 0 / 40 |
| B | ○ 法則不変と停止の区別 | △ 局所情報中心 | 簡潔 | なし | 228 / 164 |
| C | ○ 同上 | ○ 運動量との対応を整理 | Bより長いが基礎講義なし | なし | 387 / 357 |
| D | ○ 同上 | ○ ユーザーの意図を明示 | 適度 | なし | 731 / 255 |

必要前提: Aは不足を適切に表明する。B/Cはエネルギー対応まで述べる。Dは「対応する量だけ確認したい」という既知の要望を引用する一方、エネルギーという保存量名を回答中で明示していない。前提尊重の表現が増えても回答の網羅性が単調に上がるわけではない。B/C/Dの説明開始レベルはNoether数式へ飛ばず概念段階に留まる。

### Marker C / T26 — ここがよく分かりません。

| 条件 | 対象特定 | 前提引継ぎ | 再説明 | 余計な文脈 | Context量 / 回答長 |
|---|---|---|---|---|---|
| A | ○ 作用原理 / 精度△ | △ 学習状態は不明 | 一般導入が長い | なし | 0 / 889 |
| B | ○ 停留 / 精度△ | △ 初学条件は明示なし | 定義から説明 | なし | 269 / 781 |
| C | ○ 停留 / 精度△ | ○ 候補比較から始める | 比較的短い | なし | 442 / 598 |
| D | ○ 停留 / 精度△ | ○ 作用・変分未習を明示 | Cより長い | なし | 730 / 781 |

必要前提・誤り: Aは固定端を十分に示さず、まとめが「極小」を再強調。B/Cは「常に最小ではない」を保持する。しかし全条件で一次変分ゼロを単に「作用の値が変化しない」と言い換える箇所があり、有限変化や二次以上との区別が曖昧。Bは両端固定を説明から落とし、C/Dも時刻の固定は明示が弱い。A/B/Dの山頂比喩はこの力学系の作用に最大があるように読める。Dの「複雑な計算をせずに特定できる」は保証されない。文脈追加だけで物理的精度は解決しなかった。C/Dは既知のベクトルやF=maを再講義せず、初学の作用・軌道比較から始める点は自然に見える。

### Marker D / T36 — これはどういう意味ですか？

| 条件 | 対象特定 | 前提引継ぎ | 再説明 | 余計な文脈 | Context量 / 回答長 |
|---|---|---|---|---|---|
| A | × 一般語義、対象不明 | × 材料なし | 語義のみ | なし | 0 / 98 |
| B | ○ εの比 | △ 基準値任意を再掲 | 簡潔 | なし | 262 / 291 |
| C | ○ εの比 | ○ Taylorとの関係 | 適度 | なし | 438 / 358 |
| D | ○ εの比 | ○ 相対尺度に集中 | 簡潔 | なし | 742 / 212 |

必要前提: B/Dは高次項の比較・係数条件を省略する。Cは小さい比から高次項を無視できると断定寄りで、Sourceにあった係数等の留保を落としている。比の意味を答える用途には概ね合うが、誤差保証の説明としては不足。Dには直前の自由粒子の運動量も入ったが、その無関係な話題への牽引は観察しなかった。Taylorや無次元量の基礎講義には戻らない。

## 差・限界・次の候補

- 差が大きい: Marker A/B/Dの対象特定は補正なしと局所文脈ありで変わった。曖昧語を選んだfixtureに依存する。
- 差がほぼない: Marker AのB/C/D、Marker Dの比の同定は近い。広い文脈が必須という結果ではない。
- 過剰Context候補: Marker AのDはBより多い入力でも主要説明はほぼ同じ。Marker CのDはCより長く、新たな不正確な主張もある。ただし入力増加が誤りの原因だとは断定できない。
- 不足Context: A/B/Dの補正なしは対象特定に足りない。Marker Cでは引用だけでも話題は同定できる。対象特定と既知レベル継承は別指標。
- BのwindowにSource全文が入るため、長いSourceにおける局所範囲の良否は今回評価できない。Dも最大742 UTF-16であり長大Contextの検証ではない。
- 単一モデル、各セル1回、固定実行順。サンプリングの揺れや順序効果を分離できない。評価者はfixtureと条件を知っている。自動スコアは付けず、一次判断は人間評価で修正可能。
- 次候補: 人間が全回答を読んだ後、長いSourceでの局所window比較、条件順を変えた反復、別モデルでの再実験。今回は実施しない。

## 再実行 / Scope Boundary

UI: Laboratory → Marker Quick Action PrototypeのRun →「Context Correction v0.1 — 送信前Preview」。Marker/条件を選んで送信全文を確認する。UIからモデル送信はしない。

```powershell
# Previewのみ。既存証跡を守るため再実験は新しい出力先を指定する
node --experimental-strip-types src/laboratory/context-correction/run.ts docs/laboratory/context-correction-rerun
# 上記preview.jsonを確認後、固定モデルをLM Studioで利用可能にする
node --experimental-strip-types src/laboratory/context-correction/run.ts docs/laboratory/context-correction-rerun --execute
node --experimental-strip-types src/laboratory/context-correction/report.ts docs/laboratory/context-correction-rerun
```

既存結果が1件でもあれば再送信前に停止。失敗時は部分結果を保存して停止し、自動再試行しない。通常npm testは外部モデルを呼ばない。今回の証跡はdirty working treeの追加資産でありHEADのみでは再現しない。

Allowed: Lab専用fixture/Preview/CLI/評価記録と専用tests。Excluded: 本番Chat/Question Keep、DB/API、Run schema、ContextBuilder改変、後続Turn、会話圧縮、検索、自動採用。モデル呼出しの外部副作用は既存loopback LM Studioへの16生成のみ。生成結果は上記ローカル文書へ保存。

Human review: pending。条件の採用判断なし。

## Technical validation / Browser observations

- `npm test`: 268件、266 PASS、2 SKIP、0 FAIL（既存Lab回帰を含む）。通常suiteはLM Studio生成を実行しない。
- `npm run typecheck` / `npm run build` / `git diff --check`: PASS。既存dirtyファイルのCRLF正規化警告のみ。
- `report.ts`: 保存16 Runを現在のPreviewへ照合しPASS。全回答と投入量表を生成。
- 実ブラウザ: Vite UI-only `http://127.0.0.1:5190/laboratory.html` の既存Experiment RunからPreviewを開き、Marker A/AのFocusのみ表示、Marker Cへの切替、条件Dへの切替を確認。C/DはT20–T26、Context730/Input902 UTF-16、実送信テキストを表示した。Labサーバー未起動の「APIがありません」は既存Run記録APIの案内で、PreviewとCLIの動作とは独立。
- 全A/B/C/D組合せと未来Turn除外は自動テスト・保存request照合で確認。ブラウザで全16組合せを手動巡回したわけではない。
