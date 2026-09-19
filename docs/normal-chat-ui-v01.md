# Att-Chat 通常Chat UI v0.1

## 変更
- 通常入口のみ normal-chat.css を適用。左会話一覧、中央本文、下部固定入力。
- ページ全体スクロールを維持。MarkerCore/miniMAP/jump/Provider/GenerationServiceは既存実装を利用。
- Chatに任意normalLayoutを追加（既定false）。通常画面だけ送信中本文を表示し、保存済み本文取得成功後に一時表示を消す。
- Context Compare/Related Turns等は追加操作へ、Keep/Run詳細は折りたたみ。保存確認操作は通常画面では非表示。
- 空タイトルの新規会話は「新しいチャット」。設定は未実装を示す無効ボタン。
- Laboratory/Studyソース、DB schema、migration、依存packageは変更なし。

## 検証
- npm test: 243件、241 PASS、0 FAIL、任意Embedding 2 SKIP。
- npm run typecheck / npm run build / git diff --check: PASS。
- 既存Marker/miniMAP/Keep/Related/Context、Simple/Single/Laboratory/Study回帰テストを含む。
- 実ブラウザ: 1131px相当および390px幅。新規作成、切替、過去Turn、再読込を確認。
- 実LM Studio ministral-3-8b-instruct-2512: モデル取得・選択、通常生成succeeded、Streaming delta表示、Stop→cancelledと部分本文保存を確認。
- 実画面でAssistantを選択しyellow Markerとmemoを登録。miniMAPでjump/focus/強調。再読込後の会話再選択でMarker復元確認。
- エラー/他3色/重複拒否等の詳細回帰は既存自動テストで確認。全機能を実LMで再試験したわけではない。
- 検証は専用port 5198 / .cache/normal-chat-ui.sqlite。実利用DBを変更しない。

## 治具
- 作業専用: tests/normal-chat.test.ts。既存jsdom/Viteテスト方式を再利用し、NDJSONを制御するfake通信で通常Chatの送信・停止・部分本文保持・重複表示解消を1シナリオで検証。
- 作業専用: 上記隔離DBと既存サーバー。ブラウザ確認一式に使用。新しいサーバー実装なし。
- 汎用候補: jsdom環境設定とNDJSON制御のテストヘルパー。今回共通Equipmentへ昇格させていない。

## 制限・次Phase
- 設定画面、モデル選択永続化、会話タイトル自動生成は未実装。
- Marker操作は従来どおり本文選択後に編集欄で行う。本文下のMarker領域は長くなり得る。
- 通常画面の表示順はCSSで構成しており、DOM読み上げ/Tab順の完全な視覚順同期は今後の改善候補。
- 次Phaseの選択直後Marker UIはMarkerCoreのselect/draft/editorと通常画面CSSが主な対象。anchor/保存/Providerの変更は不要。
- commit / push / tagなし。
