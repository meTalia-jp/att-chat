## att-chat: External Data Asset の配置

ejdict.jsonは任意の外部資産で、Repositoryへの必須同梱対象ではありません。本体だけを.gitignoreで除外し、このREADMEとSOURCE.jsonはGit管理候補として保持します。

1. [公式取得元](https://kujirahand.com/web-tools/EJDictFreeDL.php)からJSONを人間が取得します（[保守元](https://github.com/kujirahand/EJDict)）。
2. Repositoryルート基準の `public/dictionaries/ejdict-hand/ejdict.json` に配置します。
3. 基準データのサイズ・SHA-256は[SOURCE.json](SOURCE.json)で照合できます。配布元の最新版は変わり得るため、一致しない場合は別版として確認してください。アプリはハッシュを強制検証しません。
4. Vite開発配信は再検索、build配信は `npm run build` 後に再検索します。

未配置・HTTP取得失敗ではDictionary Panelに配置先と取得元を穏やかに表示します。通信失敗だけでは物理的な未配置とは断定しません。不正JSONは読込失敗として表示します。他のLab機能は利用可能です。自動downloadや外部サイトへのruntime取得はありません。

通常テストは小さなfixtureを使用します。実辞書smoke testのみ本体がある場合に実行し、なければSKIPします。下記は配布元READMEの記録です。

# 英和辞書データ『ejdict-hand』(配布版)

本英和辞書データは、著作権フリー（パブリックドメイン）の英和辞書です。
どなたでも、個人/商用に限らず自由に利用、再配布することができます。

## 著作権表示 / License

パブリックドメイン / Public Domain / CC0

## 配布元 / Web Site

[下記のURL](https://kujirahand.com/web-tools/EJDictFreeDL.php
)にて配布しています。

```
くじらはんど > Web便利ツール > 英和辞書データ
[URL] https://kujirahand.com/web-tools/EJDictFreeDL.php
```

## 英和辞書「ejdict-hand」の来歴

1. `ejdic`は、もともと学校などに無償配布されていた英和辞典ファイルです。作者などは不明とされています。
2. 本データ`ejdict-hand`は、上記1に大々的な誤字脱字とデータの修正を加えたものです。その際、同じ`ejdic`を元にしている[PrepTutorEJDIC](http://www.tagoemura.com/ptdic.html )の修正を参考に訂正しました。
3. 本データはライセンスを明確にパブリックドメインとし、皆様から寄せられる修正加筆を日々反映しています。
4. 2025年に生成AIを利用して大々的な誤字脱字の校正を行いました。校正や修正のために、GitHub Copilot(Claude Sonnet 4.5)とOllama(gemma3n:e4b, qwen3:14b)を利用しました。

## 修正点の指摘

現在、GitHubにてオープンソースの形態でメンテナンスされています。
誤字脱字の指摘は大歓迎です。気軽にご連絡ください。

なお、連絡先は以下をご確認ください。

- [GitHub > kujirahand/EJDict](https://github.com/kujirahand/EJDict)
