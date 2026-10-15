# Turn miniMAP + Important Turn Prototype

## Current State

- Catalog ID: `turn-minimap-important`
- Catalog status: `TESTING`
- Current phase: Right Sidebar Hybrid Prototype v0.2（継続Phase）
- Implemented through: 16/50/100 Turn fixture、binary★、詳細/全体MAP、viewport 60%に最も近いTurn中心によるcurrent判定、Turn/★/●の中心を同じ60%ラインへ合わせるjump（上下端clamp）。
- Technical validation: 下記検証記録を参照。
- User evaluation: pending。
- Adopted outputs: なし。
- Production impact: なし。Vivid A表示tokenのみ再利用。
- Pending decision: 操作方向・識別性・幅の人間評価。
- Allowed change scope: Lab専用UI/fixture/CSS、Catalog登録、専用テストと記録。既存Quick Memo Panel・Dictionary Panel/serviceのLab内合成。
- Excluded scope: 本番Chat/miniMAP/MarkerCore/DB/API/Study、Quick Memo/Dictionaryの保存・検索仕様変更、Sidebar framework。
- Primary code: [UI](../../src/laboratory/TurnMapPrototype.tsx)、[fixture](../../src/laboratory/turn-map-fixture.ts)
- Primary tests: [専用テスト](../../tests/turn-map.test.ts)

## Purpose / Hypothesis

会話全高の縮尺ではなく、1 Turnを1単位にすると長文の長さに左右されず重要な発言へ戻れるかを検証する。

## Interaction model / Marker vs Important Turn semantics

本文の☆/★はTurn全体の重要さをbinary切替する。地図のTurn番号・★・●は対応Turnの先頭へjumpし、focusと一時pulseを表示する。●の厳密なrange jumpは行わない。Marker断片は本文末尾で表示する実験用データで、本番anchorではない。
スクロールで上端付近のTurnを「表示位置」として地図に示す。地図の★は切替ではなくjump。reload/再mountで初期fixtureへ戻る。

## Fixture / reuse decision

16 Turn、User/Assistant交互。T2にMarker 1件、T4/T13は★のみ、T8は長文・★・3色Marker、T15はMarker 1件。目印のないTurnとviewport外Turnを含む。
既存Marker stackは永続API・原文anchor・ページ縮尺計測を持つため接続しない。Vivid A CSS tokenだけを共有し、★はLab限定orange。専用fixtureでありEquipmentへ昇格しない。
右240px、狭幅164pxのsidebar。下側は将来共存位置の案内のみ。汎用panel管理はない。

## Browser observations / Observed issues

2026-09-26、Codex内ブラウザで約1265×712と520×760を確認。★からT8へjumpしてfocus/pulse、本文で★解除・再付与して3色Marker保持、●からT15へjump、resize後T8番号からjumpを確認した。右列は通常240px/狭幅164px。狭幅の3個目の●は折返し、★を隠さない。
長文の占有量は地図から分からないという、等間隔表示固有の制限がある。520pxでは本文が細くなり読みやすさとのトレードオフが大きい。orange★とyellow●は色が近く、形・固定列で識別する必要がある。ページ縮尺との同条件A/B比較は未実施で、優位性は未確定。
末尾付近へのjumpはブラウザのscroll上限で先頭配置できない場合があり、「表示位置」はjump先ではなく上端の可視Turnを示す。T15 focus時に表示位置T14となるケースを確認した。
Vite単独では既存Lab記録APIエラーが上部に出るが、専用Prototypeの操作は成立。既存API周りは変更していない。

## User evaluation pending

ページ縮尺方式より読みやすいか、番号による現在地認識、orangeと4色の競合、★/●の意味、複数Markerの密度、jumpの自然さ、sidebar幅はユーザー評価待ち。自動採用しない。

## Validation

- npm test: 265件、263 PASS、0 FAIL、2 SKIP（既存任意Embedding）。
- typecheck / build / git diff --check: PASS。
- 専用testでfixture条件、★切替と複数Marker独立、Turn/★/●のfocus/jump、scroll/resize回帰を確認。既存LaboratoryテストもPASS。
- 実ブラウザで通常幅へ戻した後、本文scrollで表示位置T14、T8の●からT8へ戻ることを確認。

## 長文対応 Phase（2026-09-27）

### Purpose / Current-position rule

長い会話で全体分布と読書位置を把握できるかを検証する。上記v0.1初期実装の上端基準を置き換え、`abs(turnCenterY - viewportHeight * 0.60)` が最小のTurnをcurrentとする。DOMRectはviewport座標なのでviewportTopは0。中心はTurn全体の矩形中心（可視部分だけの中心ではない）。scroll / resize / fixture変更時とjump時に再計算する。同距離は先のTurnを選ぶ。

### Detail mode / Overview mode

詳細は既存の行間・★・Marker寸法・色・内部スクロールを維持。50 Turnでは全行を同時に読めず、従来どおりスクロールが必要になる。今回、内部スクロールを新設せずに全件を見渡す用途は「全体」が担う。

全体はTurn数によらない高さ（viewportに応じ200〜500px）へ等間隔配置する。内部スクロールなし。先頭・末尾・10刻み・currentの番号だけを表示し、全Turnのクリック位置・全★・全Markerを残す。★とMarkerは別列、複数Markerは横方向に分離する。両モードともTurn/★/●はTurn先頭へのjump。モード切替では★を保持する。

### 50-turn fixture

16 Turn fixtureを残し、50 Turnを選択できるようにした。User/Assistant混在、長文T8/T24/T40、目印なし・1件・複数Marker・★のみ・同居を含む。T24〜T28は連続して★と3個のMarkerを持つ密集ケース。Marker断片は実験用の表示データで、本文range anchorではない。fixture変更時は★を各fixtureの初期状態へ戻す。Experiment-localのままとする。

### Browser observations / Density issues

Codex実ブラウザの通常幅（約1265×720）と520×760で確認。

- 16 Turn詳細の既存行間と大きな★/●を維持。50 Turn詳細は同じ寸法で縦に続く。
- 50 Turn全体は通常幅で約455px、狭幅で495px。本文へscrollしてsidebarがstickyになった状態では全50件が一画面に収まり、内部scroll操作は不要。ページ冒頭ではLabヘッダーの下に始まるため、sidebar全体を見るには本文のscrollが必要。
- T25の★、Marker、Turn位置からjumpを確認。T25先頭へのjump後currentはT27、狭幅ではT26となり、矩形中心と60%ラインの距離による算出結果と一致。T1付近ではT3、末尾T50へのjumpではT49を確認。jump先のpulseと読書位置は別概念。
- resize後もcurrentを再計算。★と複数Markerの密集5行は別列で識別でき、狭幅でも横方向のページoverflowなし。
- 全体MAPの1行hit areaは約9〜10pxと小さく、密集部の精密クリックには注意が必要。色は既存のVivid Aとorangeを維持したが、詳細よりglyphが小さい。非常に低いviewportや50件を大幅に超える密度は未評価。
- Turn全体中心を使うため、非常に長いTurnの冒頭・末尾では隣のTurnがcurrentになる可能性が残る。指定ルールの特性として記録し、別heuristicへは変更していない。
- Vite単独起動では既存のLab記録APIエラーが上部に出る。Prototype操作への影響はないが、完全LabのAPI動作確認とは区別する。

### Validation / User evaluation pending

- npm test: 266件、264 PASS、0 FAIL、2 SKIP（既存任意Embedding）。
- npm run typecheck / npm run build / git diff --check: PASS。
- 専用test: 60%中心判定・scroll座標変換・resize・50件・密集同居・mode切替・各jump・★独立性。既存Laboratory回帰もPASS。
- 詳細の読みやすさ維持、全体MAPの密度・hit area、60%基準の自然さはuser evaluation pending。採用判断・本番反映は行わない。

## 100 Turn dummy fixture（2026-09-27）

100 Turnのダミー会話を追加し、16 / 50 / 100 Turnを選択可能にした。User / Assistantを交互に配置し、長文Turn、★のみ、Marker 1〜2件、T48〜T53の★＋3 Marker密集区間を含む。実データ・保存・本番契約には接続しないExperiment-local fixtureである。全体MAPでは全100件の位置・★・Markerを固定高に表示し、番号は10 Turn刻み、先頭・末尾・currentに限定する。

## jump/current整合修正（2026-09-27）

従来のTurn先頭へのjumpを置き換え、全入口で `scrollY + targetRectCenterY - viewportHeight * 0.60` へ即時scrollする。範囲は0〜document scrollHeight−viewportHeightにclampし、その後に既存current判定を再計算する。focusはpreventScrollを指定する。current判定、詳細/全体の表示、fixture、★/Markerの仕様は変更しない。

100 Turn fixture、実ブラウザ1265×720（60%ライン432px）で詳細・全体の両モードを確認した。

| 操作対象 | jump後の中心Y | current（両モード） |
| --- | --- | --- |
| T10番号 | 432.23px | T10 |
| T25番号（長文） | 432.15px | T25 |
| T52番号 / ★ / red Marker | 431.56px | T52 |
| T1番号 | 432.46px | T1 |
| T100番号 | 561.54px | T99 |

T1はLabヘッダーの高さがあるためscrollY=143pxで一致できた。T100はscrollY=17923pxの下限側終端（最大scroll）に達し、中心を432pxまで引き上げるには約130px分の余白が不足する。そのためcurrentはT99となる。余白追加やcurrent強制固定は行わず、指定どおりclamp結果を採用した。

検証：npm test 267件（265 PASS / 0 FAIL / 2 SKIP）、typecheck / build / git diff --check PASS。計算の上下端clamp・通常位置一致をunit test、各入口をUI testで確認。Vite単独の既存記録APIエラーは前Phaseと同様。ユーザー評価待ち。

## Right Sidebar Collapsible Prototype v0.1

### Purpose / Sidebar role

右側で「会話を移動する / 断片を拾う / その場で単語を確認する」を共存させられるかを検証する。Catalogを増やさず、このExperimentのRunにある「Sidebar統合試験（50 Turnで開始）」から利用する。既存Quick ActionのSignal導線自体は移植せず、本文をドラッグすると試験入力欄へ選択文字列とTurn IDを渡す小さな統合治具を用意した。入力欄を直接編集しても検証可能。試験入力の初期値はexperiment。

### Initial open state / Panel independence

統合試験を開始した時はminiMAP=open、Memo=open、Dictionary=closed。各34px以上の開閉ボタンを独立操作でき、同時openを許可する。React stateのみでreload保存はない。統合試験を解除して再開始するとMemo・Dictionaryは初期化される（通常のPanel collapseとは異なる）。

### miniMAP state preservation

折りたたみはhiddenで行い、子Panelをアンマウントしない。mode・current・★はTurnMapPrototype側で保持し、閉じている間もcurrentは60%判定で更新する。jumpも60%基準、端部clampを維持。統合画面だけMAP表示枠を300pxに制限した。詳細は元の行間で内部scroll、全体は全50 Turnを圧縮し内部scrollなし。単体表示の寸法は維持。

### Memo behavior / Dictionary auto-open

[QuickMemoPanel](../../src/laboratory/QuickMemoPanel.tsx)を再利用。memory-only・bullet・重複可・追加順・選択元Turn IDを維持。追加はMarkerに影響しない。Memoが閉じていても追加時に開閉状態を変えない。Panel内部scrollの高さは160px、内容追加時の末尾追従は既存挙動。手動位置はcollapse前に記録しreopen後に復元する。

[DictionaryPanel](../../src/laboratory/DictionaryPanel.tsx)と既存service/searchを再利用し、英字1語・latest result・lazy load・External Data Asset未配置案内・Source表示・古い非同期結果抑止を維持。検索操作でDictionaryのみ自動openする。未検索時は説明を表示し、collapseでも結果を保持する。外部JSONの取得・保存方法は変更しない。

### Scroll behavior

Sidebar全体に1本の縦scroll（viewport高さ−24px）を設定。Memoと長い辞書結果、および詳細MAPの既存内部scrollを維持する。CSS scroll anchoringを外し、辞書表示でMemo内部位置が勝手に補正されないようにした。汎用高さ配分やPanel並替はない。

### Browser observations / Observed issues

通常約1265×720、狭幅520×760で確認。Sidebarは320px / 210px。横overflowなし、狭幅は本文が細くなり読みやすさに制約がある。

- 初期3状態、全体モード、50件、★/Marker密集表示を確認。T25へjumpしてcurrentもT25。
- experimentを25件追加し重複・bullet・内部scrollを確認。手動scrollTop=140pxでcollapse/reopen後も140px。Dictionary検索でもMemoの手動位置保持を確認。
- 実EJDict-handのexperimentがhitしDictionaryが自動open。未配置状態は実serviceに404を返すfixture testで案内表示を確認（今回のブラウザ環境は辞書配置済み）。
- MAPを開いたままMemoを参照可能。ただし3つを同時openすると全内容は一画面に収まらず、DictionaryへはSidebar全体をscrollする必要がある。検索はPanelを開くが、Sidebarの位置を強制移動しない。
- 内部scroll上ではホイールがそのPanelに留まるため、棚全体を動かすには余白や外側scrollbarを使う必要がある。特に詳細MAPでは多重scrollの学習負担が残る。
- state保持、Dictionary結果置換・開閉、閉じたMemoへの追加、欠落辞書案内は統合UI testで確認。Vite単独のLab記録APIエラーは既知の別制限。

### Tabs as alternative candidate / User evaluation pending

タブ方式は縦の圧迫を減らす比較候補だが、同時参照を失う可能性がある。今回は未実装。折りたたみ方式の採否、300px MAP枠、幅、多重scrollの使い勝手はユーザー評価待ち。

### Validation / Code

- [統合治具](../../src/laboratory/CollapsibleTools.tsx)、[専用CSS](../../src/laboratory/collapsible-tools.css)、[専用test](../../tests/turn-map.test.ts)。Equipmentへ昇格しない。
- npm test: 267件、265 PASS / 0 FAIL / 2 SKIP。typecheck / build / git diff --check: PASS。

## Right Sidebar Hybrid Prototype v0.2

### Purpose / Priority model / Hybrid layout

移動用miniMAPを常時確保し、その場で確認するDictionaryを検索時に優先、拾うQuick Memoは確認Toastのみで読書を続けられるかを検証する。v0.1の3つの独立折りたたみ表示を、このPhaseで上部Dictionary / Memoの2タブ＋下部常設miniMAPへ置き換えた。過去のv0.1記録は履歴として残す。入口は同じSidebar統合試験。初期タブはDictionary（未検索）。

### Dictionary auto-select / Memo no-auto-select

検索時はDictionaryタブへ切り替え、loadingから最新結果へ更新する。External Data Asset、未配置案内、Source、英単語1語、非同期の古い結果抑止は既存serviceのまま。Memo追加ではタブを変更しない。両Panelはhidden切替でmountを維持し、内容・辞書結果を保持する。Memo手動scroll位置はタブ往復で復元。miniMAPのmode/current/★は従来どおり親stateに保持し、常設する。

### Quick Memo toast / Toast duration / position

成功時に「✓ Quick Memoに追加しました」を1つ表示。1.1秒で除去し、最後の約220msでfade-outする。連続追加は同じ表示を再開始しtimerをリセット。unmountでtimerを解除。Undo・編集・履歴・queueなし。

位置はviewport下24px、横58%（中央よりやや右）のfixed overlay。520pxでは中央・下16px。pointer-events:noneで操作を遮らず、DOMの通常レイアウトに参加しない。内容全文は出さない。

### miniMAP reserved area / Scroll behavior

Quick Tool領域はタブを含み200px固定。miniMAPへ残りを優先配分し、領域の最低高さ200pxを確保。Sidebarはviewport−24pxで全体scrollなし。Memo/Dictionary本文と詳細MAPだけ内部scroll。全体MAPは残り高さに全件配置しscrollなし。50 Turnの★/Marker・60%判定/jumpの意味は変更しない。

Lab試験入力はSidebar外へportalで配置し、折りたためる。本番想定では存在せず、Sidebar面積評価から除外する。画面上方の入力を使う際の本文移動は治具の制限であり、本番Quick Action導線の検証ではない。

### Browser observations / Observed issues

- 約1265×720でQuick Tool 200px、miniMAP領域約457px、Sidebar clientHeight / scrollHeightはいずれも694px。全体scrollなしで辞書結果とMAPが共存。
- 520×760ではQuick Tool 200px、miniMAP領域約510px。横overflowなし。本文が細い制約は残る。
- Memo 0件から20件の連続追加を確認。Dictionaryタブを維持し、単一Toast表示→自動消去。Memoを手動選択して内容を確認し、Dictionaryへ戻って実EJDict-handのexperiment結果を保持。
- 全体MAP・密集★/Marker・T25のcurrent/jumpを確認。詳細の内部scrollとmode保持もtestで検証。
- 未配置案内は404 fixtureを使う実service/UI testで確認。ブラウザは辞書配置済みなのでhit状態を確認した。
- 50 Turn全体MAPの密集箇所は小さく、精密クリックは引き続き評価課題。高さ464px未満の画面は最低高さ確保によりSidebarが画面から出る可能性があり、今回の2サイズ検証には含まない。
- Vite単独の記録APIエラーは既知の別制限。上部overlay案とのA/B比較は未実施。

### Validation / User evaluation pending

npm test 267件（265 PASS / 0 FAIL / 2 SKIP）、typecheck / build / git diff --check PASS。testではtab往復・検索auto-select・Memo no-auto-select・内容保持・未配置・timer reset（再追加650ms後も表示）・自動消去・miniMAP mode/★保持を検証。Hybridの優先順位・Toast位置・200px配分の採否はユーザー評価待ち。本番反映なし。

### UIラベル・配分調整（2026-09-27）

ユーザー評価を受け、Hybrid構造と挙動を維持したままタブ表示を `Quick辞書` / `Quickメモ`、miniMAP凡例を `★ Turn目印　● Marker` へ変更した。Quick Tool領域は200pxから220pxへ拡大し、辞書本文とMemoを少し多く読める配分にした。miniMAPはflexの残り領域と最低200pxを維持する。Lab試験入力は引き続きSidebar外にあり、本番想定およびSidebar面積評価には含めない。Dictionary検索時auto-select、Memo追加時のtab維持とToast、常設miniMAP、詳細/全体、★/Marker/current/jumpは変更していない。

実ブラウザでは1280px指定（内部viewport 1280×712）でQuick Tool 220px、miniMAP 419px、Sidebar 320pxを確認した。520×760ではQuick Tool 220px、miniMAP 479px、Sidebar 210pxで、どちらもminiMAP最低200pxを上回りページ全体の横overflowは発生しなかった。狭幅でも新しいタブ名・凡例・詳細MAPの★/Marker/currentが判別できる。今回のユーザー評価は「意味が分かる日本語ラベル」と「Quick領域を少し広げる」方向を支持する調整要求として記録し、220px配分の最終採用判断は引き続き保留する。
