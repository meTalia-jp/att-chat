# Att-Chat Quick Copy / Quick Dictionary Finalization v0.1

## Behavior correction

- Right Sidebarが全ての`selectionchange`を監視して共通inputへ暗黙転記する処理を削除した。文字を選択しただけ、またはQuickコピーを実行しただけでは、Quick辞書 / Quickメモinputを変更しない。
- Quickコピーは`target_text`のclipboard書込みだけを行う。
- Quick辞書は`RightSidebarController.openDictionary(text)`から、手動の`検索`buttonと同じ`searchText` handlerを呼ぶ。Sidebar open、辞書tab選択、input設定、既存service検索、結果表示までを1回のQuick操作で完了する。
- 実ブラウザで、selection後のSidebar inputが空のままであること、コピー後も空のままであること、ASCII英単語`bit`の辞書操作1回でEJDict-hand結果まで表示されることを確認した。

## Quickコピー

- Quick Actionは未保存selectionでは`draft.target_text`、保存済みMarkerでは`highlight.target_text`を受け取る既存Production経路を維持した。
- コピー処理は`navigator.clipboard.writeText(text)`を使用する。
- 成功表示を小さい一時feedbackの`コピーしました`へ統一し、成功後はSignalを閉じる。
- clipboard書込み失敗時は`コピーできませんでした`をSignal内に表示し、Signalを閉じず再試行できる。
- 実ブラウザで、未保存selection「量子化と」と保存済みMarker「写す考え方です。モ」のclipboard内容が、それぞれ画面上の`target_text`と一致することを確認した。

## Quick辞書

- Quick Actionからは文字列だけを`RightSidebarController.openDictionary(text)`へ渡す。
- Controllerが右Sidebarをopenし、Quick辞書tabを選び、inputへ元文字列を設定して、既存Quick Dictionary serviceで検索する。
- 辞書データ、検索、Source表示は既存EJDict-hand経路を再利用し、Quick Action側に辞書処理を追加していない。
- 実ブラウザでASCII英単語`bit`を選択し、Sidebar入力とEJDict-handの検索結果が表示されることを確認した。
- 右Sidebarを閉じた状態からの実行でも、Sidebarが開きQuick辞書tabと検索結果が表示された。

## validation

- 既存validation `/^[A-Za-z]+$/`を維持した。
- 日本語selection「量子化と」で`英単語を1語選択してください`が表示されることを実ブラウザで確認した。
- 自動token抽出、fuzzy検索、lemmatization、履歴は追加していない。
- 自動テストでは日本語と複数語`two words`の両方をinvalidとして固定した。

## Signal close

- コピー成功、辞書への受渡し成功後は既存どおりSignalを閉じる。
- コピー失敗時はSignalとQuick Menuを保持する。
- Quick Menuは右方向を第一候補とし、viewport右端では左方向へfallbackする既存pure helperとfocused testを維持した。

## Browser確認

- 保存前selectionからQuickコピー: PASS
- 保存済みMarkerからQuickコピー: PASS
- ASCII英単語1語からQuick辞書: PASS
- 日本語selectionのvalidation: PASS
- 閉じた右Sidebarのopen、Quick辞書tab選択、入力設定、検索: PASS
- Quick Action成功後のSignal close: PASS

確認にはProduction Browser UI (`http://127.0.0.1:5180/`) と既存の隔離Conversation fixtureを使用した。DB schema、Marker、Question Keep、miniMAPの契約は変更していない。

## Electron確認

- Electron Skeletonのfrontend/backend (`127.0.0.1:5186` / `127.0.0.1:5187`) が既に稼働している状態で、renderer URLから同じProduction React UIとStart Screenの読込を確認した。
- 追加のElectron起動はport collisionにより既存processへattachせず停止した。これはSkeletonの既存安全契約どおりである。
- Electron固有コード、security設定、CSSは変更していない。Quick Actionの実操作はBrowser版で確認し、共通Production React UIとbuildで回帰を確認した。

## 自動テスト

- 保存前selection / 保存済みMarkerの`target_text`コピー
- copy success / failure
- dictionary callback
- Sidebar open / Quick辞書tab / input / result
- valid ASCII word
- invalid Japanese / multiword
- Quick Menu right / left fallback

をfocused testへ固定した。

最終回帰結果:

- `npm test`: 342 total / 340 pass / 2 skip / 0 fail
- `npm run typecheck`: PASS
- `npm run build`: PASS
- `git diff --check`: PASS

## 残課題

- OSやブラウザ権限がclipboard書込みを拒否した場合は現在の短いerror表示で再試行する。権限取得UIは追加していない。
- Quick辞書はASCII英単語1語の選択を前提とし、複数語や日本語からのtoken抽出は行わない。
