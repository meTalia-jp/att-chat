# Att-Chat Quick Memo / Quick Dictionary Finalization v0.2

## Quick Action変更前後

Production Marker Quick Actionを、展開操作を挟む `▽ ● ● ● ● ▷` から `▽ ● ● ● ● メモ 辞書` へ変更した。`▽`、4色Marker、interaction anchor、Marker Detailの既存契約は維持している。

`▷`、横展開Quick Menu、`コピー`表示はProduction Quick Actionから外した。Laboratory componentはProductionからimportしていない。

## `コピー`から`メモ`への整理

選択中または保存済みMarkerのuser-facing `target_text`を、QuickメモまたはQuick辞書のtyped controllerへ渡す。`メモ`と`辞書`はSignal上に常時表示し、追加の展開clickを必要としない。

成功時は右Sidebarへ結果を表示してSignalを閉じる。保存失敗、辞書データ利用不能、入力validation失敗では簡潔なerrorをSignalへ表示し、再操作できるようSignalを維持する。

## Quickメモ追加処理

`メモ`は次を1 clickで実行する。

1. 右Sidebarを開く
2. Quickメモtabを選ぶ
3. `target_text`をMarkdown箇条書きとして先頭へ追加する
4. 保存済みDocumentを再表示する
5. Signalを閉じる

同一文字列の重複を許可し、最新項目を先頭に表示する。手動入力の`追加`も同じprepend保存serviceを使う。

## Markdown保存形式と保存場所

正本はUTF-8 Markdownファイルで、既定保存場所は次のとおり。

```text
D:\att-Chat\data\quick-memo.md
```

各項目は `- text` としてファイル先頭へ追加する。複数行項目の継続行はMarkdown list item内へ2空白でindentする。保存場所は `ATTCHAT_QUICK_MEMO` 環境変数で上書きできる。

`data/`は既存 `.gitignore` 対象であり、開発cacheやReact session stateを正本にしない。HTTP APIは `GET /api/quick-memo` と `POST /api/quick-memo` を提供し、server-side `QuickMemoStore`が直列化したappendを行う。

## 再起動復元確認

Production browserで `Advanced`、`Micro`を順に選択して`メモ`を押し、次のファイル内容を確認した。

```markdown
- Advanced
- Micro
```

Production backendを終了して別processとして再起動し、page reload後のQuickメモに2件が復元された。Electron Skeletonも終了・再起動し、Electron rendererと隔離backend経路から同じ2件が復元された。

自動testでは新しい`QuickMemoStore` instanceで同一Markdownを再読込し、重複、追加順、複数行項目の復元も確認した。

追加順をnewest-firstへ変更後、実ブラウザでQuick Actionから`Devices`、Sidebar手動入力から`手動順序確認`を追加した。表示とMarkdown先頭は `手動順序確認`、`Devices`、既存項目の順となり、backend再起動後も同じ順序で復元された。

## Quick辞書自動検索

`辞書`は右Sidebarを開いてQuick辞書tabを選び、入力へ`target_text`を設定した後、手動`検索`buttonと同じ`searchText` handlerをawaitする。新しい辞書serviceは追加していない。

実ブラウザで`Advanced`を選択し、1 clickでEJDict-handの`advanced`検索結果が表示された。人間による追加の検索button操作は行っていない。

## Validation

ASCII英単語1語という既存契約を維持する。実ブラウザで`正式名称`を選択した場合、`英単語を1語選択してください`を右Sidebarへ表示し、Signalも維持した。複数語と日本語は同じ既存validation経路を使う。自動token抽出は行わない。

## Responsive確認

interaction anchor v0.2.1を変更せず、Signal幅を直接操作2件に合わせて276pxとした。実ブラウザで同一selectionから取得したSignal boundsは次のとおりで、全条件でviewport内に収まった。

| Viewport | Signal left/right | Signal top/bottom | 横overflow |
|---|---:|---:|---|
| 1024 x 768 | 324.95 / 600.95 | 404.11 / 448.11 | なし |
| 1280 x 800 | 354.95 / 630.95 | 420.28 / 464.28 | なし |
| 1920 x 1080 | 565.45 / 841.45 | 560.53 / 604.53 | なし |

確認後、browser viewport overrideは解除した。

## Validation結果

- `npm test`: 344 total / 342 pass / 2 skip / 0 fail
- `npm run typecheck`: PASS
- `npm run build`: PASS
- `git diff --check`: PASS
- Marker Quick Action / MarkerCore / RightSidebar / QuickMemo focused tests: PASS
- Browser: Quickメモ追加、append、辞書自動検索、validation、Signal close/保持を確認
- Electron renderer: Electron process終了・再起動後のQuickメモ復元を確認

## 残課題

正式packaging時の保存先はAppData移行Phaseで決める。現段階では既存Production root配下の`data/quick-memo.md`を使用する。並べ替え、重複除去、タグ、日時、RAG、Quickメモ編集・exportは今回の対象外である。
