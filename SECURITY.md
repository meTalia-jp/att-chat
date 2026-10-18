# Security Policy

## Supported Versions

| Version | Supported |
| --- | --- |
| 1.0.x | Yes |
| Older development snapshots | No |

Att-Chatは現在、1.0.x系列を保守対象としています。

## Reporting a Vulnerability

セキュリティ上の問題を発見した場合は、脆弱性の詳細をPublic IssueやDiscussionへ投稿せず、GitHubの[Private Vulnerability Reporting](https://github.com/meTalia-jp/att-chat/security/advisories/new)を使用して非公開で報告してください。

報告には、可能な範囲で次の情報を含めてください。

- 問題の概要
- 再現手順
- 想定される影響範囲
- 使用したAtt-Chatのversionと実行環境
- 調査に役立つlogやscreenshot（必要な場合）

password、API key、tokenなどの秘密情報そのものは送信しないでください。logやscreenshotに秘密情報が含まれる場合は、報告前に削除またはマスクしてください。

## Response

Att-Chatは個人開発projectであるため、固定のSLAや応答時間は保証していません。報告内容を確認し、必要に応じて修正、Release、GitHub Security Advisoryの公開を行います。

## Scope

報告対象には、次の領域を含みます。

- Att-Chat application
- Electron packaging
- local backend
- data handling
- model connection handling
- bundled third-party integration

第三者component自体に起因する問題は、影響を確認したうえで、必要に応じてupstream projectへ報告する場合があります。
