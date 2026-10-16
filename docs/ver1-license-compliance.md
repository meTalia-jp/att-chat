# Att-Chat Ver1.0 License Compliance Packaging

実施日: 2026-10-15
対象: Att-Chat 1.0.0 Windows x64 / Electron 44.5.1

## 結論

Ver1.0の公開前packagingとして、Att-Chat本体のMIT明示、RpenProof由来コードの表示、第三者notice、LGPL/MPL source案内、固定runtime source kit、Windows配布staging、2つのRelease asset候補を作成した。

ローカルの配布内容・hash・manifestを照合する `npm run audit:license-package` はPASSした。`Att-Chat-v1.0-runtime-source.zip` にはElectron、Chromium、Chromium FFmpeg forkの固定source archiveそのものが入り、Electron patch、DEPS、GN設定、FFmpeg生成config、代表的なBlink/MPL pathも検査用に抽出している。

repositoryは <https://github.com/meTalia-jp/att-chat> に確定し、初期RC commit `d3fda957e90fa79919c88602045c3df84fe87098` の `master` 初回pushと `v1.0.0` tag作成を完了した。その後、Release公開前の整合性修正として `SOURCE_AVAILABILITY.md` にv1.0.0の最終予定URLを記録し、この文書修正commitを正式な `v1.0.0` tag対象とする。GitHub Release、Draft Release、assetはまだ作成していないため、予定URLを「現在download可能」とは記載していない。公開完了の判定は、同じGitHub Releaseへbinary/source/checksum assetを添付し、公開後に再downloadしてhashを確認した時点で行う。

## Att-Chat MIT

- rootへ `LICENSE` を追加した。
- copyrightは `Copyright (c) 2026 meTalia-jp`。
- `package.json` とroot packageの `package-lock.json` entryへ `license: MIT` を追加した。
- Electron配布物rootの `LICENSE` はElectron自身のMIT文書として保持した。
- Att-Chat本体のlicenseは配布物rootへ `ATTCHAT-LICENSE.txt` として別名で配置した。
- staging内 `resources/app/package.json` にも `license: MIT` を記録した。

## RpenProof対応

`experiments/selection-poc/LICENSE-RpenProof.txt` とbyte-for-byte同じMIT本文を `licenses/RpenProof-MIT.txt` に追加し、配布物rootへ `RpenProof-MIT.txt` として同梱した。

`THIRD_PARTY_NOTICES.md` では、Att-Chat全体をRpenProof由来とはせず、次の説明へ統一した。

> Marker基盤の一部に、RpenProofのMarkdown原文位置対応・選択技術を選択的に改変継承している。

技術的な対応関係は既存の `docs/rpenproof-contribution-trace.md` を根拠とする。

## Third-party notices

rootの `THIRD_PARTY_NOTICES.md` に次を記録した。

- Electron 44.5.1と固定commit
- Chromium 152.0.7977.130と固定commit
- standalone backend Node.js 24.19.0
- Chromium FFmpeg forkとLGPL-2.1-or-later構成
- Blink/WebKit由来LGPL code
- NSPR、Mozilla URL parser、Mozilla Windows Cert、ISimpleDOM、Hunspell、Symphonia
- inclusion未確定のEigen、gRPC、axe-coreを保守的なsource提供として区別
- React、React DOM、react-markdown、remark-gfmとtransitive npm noticeの配置
- EJDict-handのPublic Domain / CC0表示、取得元、bundle hash
- RpenProof由来コードとlicense/trace

配布stagingには198個のnpm license/noticeファイルが `resources/licenses/` 以下へコピーされた。これは最終bundleへの含有証明ではなく、package-lockで使用した依存のnoticeを欠落させないための保守的な同梱である。

## FFmpeg対応

### 固定sourceと構成

- Chromium FFmpeg fork: `2b68d2babae73714846961fb0ee47e3b3d2e39a9`
- source archive SHA-256: `35b0c8096e0c21f2de24e1eb14ec5243b76bbd88c44676289cc484f97f152749`
- Electron release GN: `is_component_ffmpeg=true`
- branding: `Chrome`
- target: Win x64
- fixed config: `chromium/config/Chrome/win/x64/config.h`
- config flags: `CONFIG_GPL=0`, `CONFIG_GPLV3=0`, `CONFIG_NONFREE=0`
- Electron patch: `patches/ffmpeg/link_with_loader_path.patch`

source kitはFFmpeg tree全体を含み、`BUILD.gn`、`ffmpeg_generated.gni`、生成config、`README.chromium`、`LICENSE.md`、`COPYING.LGPLv2.1`を抽出している。選択した数ファイルだけを完全な対応sourceとは呼んでいない。

### DLL差し替え

配布物は `AttChat.exe` と同じdirectoryに `ffmpeg.dll` を置く。Electron配布元のDLLを無改変でコピーしており、SHA-256は `7728490eb079c19b17baeff2b6590c976f6a928b3c17923aeb4fcf1f1f31d299`。

`SOURCE_AVAILABILITY.md` とsource kitの `FFMPEG-REPLACEMENT.md` に、interface-compatible DLLへ差し替える位置と手順を記載した。改変・debug目的のreverse engineeringを一律禁止する条件は追加していない。

互換DLLをこの工程で新規buildしていないため、改変DLLでの起動試験は未実施。この点を文書でも未検証と明記した。

FFmpeg公式は、LGPL configurationではGPL/nonfreeを無効にし、WindowsではDLLによるdynamic linking、配布binaryと正確に対応するsource、build変更・構成説明、同じ配布場所でのsource提供等をchecklistとして示している。今回のsource asset構成はこの実務案に合わせた。[FFmpeg License and Legal Considerations](https://ffmpeg.org/legal.html)

## Blink / WebKit由来LGPL対応

固定Chromium archiveで次のsource/build entryが実在することを検査した。

```text
third_party/blink/renderer/platform/wtf/text/string_impl.cc
third_party/blink/renderer/platform/wtf/text/string_impl.h
third_party/blink/renderer/platform/wtf/BUILD.gn
```

Electron releaseは `is_component_build=false` なので、FFmpegのDLL交換と同じ説明にはしていない。source kitへ固定Electron/Chromium source archive、両DEPS、Electron patch queue、release GN argsを含め、`BUILDING-WIN-X64.md` に次の再link経路を記録した。

1. Electron build-toolsまたはmanual gclient checkoutを用意する。
2. Electron commitを固定する。
3. `e sync -f` / `gclient sync -f` でDEPSとpatchを反映する。
4. Chromium/FFmpeg revisionを照合する。
5. LGPL対象sourceを変更し、Win x64 releaseをbuildする。
6. disposable Att-Chat stagingのnative runtimeを置換する。

Electron公式build文書も、build-toolsがDEPSを同期し、Chromium sourceを `src/`、Electron sourceを `src/electron/` に配置し、upstream変更をElectron patch systemで管理する構造を説明している。[Electron Build Instructions](https://www.electronjs.org/docs/latest/development/build-instructions-gn)

native rebuildは100GB超の同期checkoutと対応Windows toolchainを要するため、この工程では実行していない。固定sourceとbuild/relink材料の実在、revision、path、hashまでは確認した。Att-ChatのJS/TS全体をLGPL扱いにはしていない。

## MPL対応

固定Chromium source archiveで以下のmetadata pathを検査し、Chromiumによる改変後sourceをarchive全体としてsource kitへ入れた。

| Component | Chromium path | Status |
|---|---|---|
| NSPR | `base/third_party/nspr/` | fixed source included |
| Mozilla URL parser | `url/third_party/mozilla/` | fixed source included |
| Mozilla Windows Cert | `net/third_party/mozilla_win/` | fixed source included |
| ISimpleDOM | `third_party/isimpledom/` | fixed source included |
| Hunspell | `third_party/hunspell/` | fixed source included |
| Symphonia | `third_party/rust/symphonia/` とvendor tree | fixed source included |
| Eigen | `third_party/eigen3/` | included conservatively; final binary inclusion not fully confirmed |
| gRPC | `third_party/grpc/` | included conservatively; use of MPL portion not fully confirmed |
| axe-core | `third_party/axe-core/` | included conservatively; runtime inclusion not fully confirmed |

MPL 2.0はExecutable Formを配布する場合、Covered SoftwareのSource Code Formを合理的な手段で速やかに取得できるようにし、その方法を通知することを定める。今回の対応source assetとnoticeはこの案内を具体化する。[Mozilla Public License 2.0 §3](https://www.mozilla.org/en-US/MPL/2.0/)

## Source kit

生成script: `scripts/build-license-source-kit.mjs`
生成directory: `.cache/license-v1/runtime-source/Att-Chat-v1.0-runtime-source/`
Release asset候補: `.cache/license-v1/release-assets/Att-Chat-v1.0-runtime-source.zip`

| Item | Value |
|---|---|
| Asset size | 1,829,801,983 bytes |
| Asset SHA-256 | `125a6b94c9b01340d193d6863d60ad8531b690a3b273129837102ac855ea34c9` |
| Source archives | Electron / Chromium / Chromium FFmpegの3件 |
| Manifest components | 10件。LGPL対象、MPL確定対象、保守的候補を区別 |
| Kit files | 37 files |
| Internal integrity | `SHA256SUMS.txt` |

`SOURCE_MANIFEST.json` はcomponent、revision、archive hash、source URL、license、source path、completeness limitsを保持する。source kit ZIPのlistingを開き、3 source archive、FFmpeg config、Electron patch、Blink source、manifest/build/replacement文書の存在を確認した。さらに外側ZIPから3 archiveを直接streamしてSHA-256を再計算し、上表の3 hashと一致した。

## Windows distribution

生成staging: `.cache/license-v1/distribution/Att-Chat-v1.0-win-x64/`
Release asset候補: `.cache/license-v1/release-assets/Att-Chat-v1.0-win-x64.zip`

| Item | Value |
|---|---|
| Asset size | 484,237,826 bytes |
| Asset SHA-256 | `aac43faf75ec929d5e9c02d2e0435a929d61db6d396da73c8bd6cb9511fed860` |
| Staged files | 345 files |
| npm license/notice files | 198 files |
| AttChat.exe SHA-256 | `49b61a030a520fc36a4b8fa5cce53fb4e935a7bdbbe4b80e9222f598e49cc7fa` |
| ffmpeg.dll SHA-256 | `7728490eb079c19b17baeff2b6590c976f6a928b3c17923aeb4fcf1f1f31d299` |

配布物rootで次を確認した。

```text
ATTCHAT-LICENSE.txt
THIRD_PARTY_NOTICES.md
SOURCE_AVAILABILITY.md
LICENSE
LICENSES.chromium.html
RpenProof-MIT.txt
```

また、`resources/node/LICENSE`、EJDictの `README.md` / `SOURCE.json` / `ejdict.json`、`resources/licenses/` のnpm noticeを確認した。source archiveはapplication ZIPに重複同梱していない。

## Release asset構成

同じVer1.0 GitHub Releaseへ次を置く。

```text
Att-Chat-v1.0-win-x64.zip
Att-Chat-v1.0-runtime-source.zip
```

root `README.md`、`THIRD_PARTY_NOTICES.md`、`SOURCE_AVAILABILITY.md` をRelease説明から参照できるようにする。`SOURCE_AVAILABILITY.md` にはv1.0.0公開時のbinary/source/checksum予定URLを記録済みである。Release公開前にapplication staging/ZIPと外側の `SHA256SUMS.txt` を再生成し、文書と実assetを一致させる。

## Verification

| Check | Result |
|---|---|
| Focused license packaging tests | 5 pass |
| Full `npm test` | 423 total / 421 pass / 2 skip / 0 fail |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS; pre-existing CRLF conversion warnings only |
| Packaged Electron staging smoke | PASS; isolated DB, restart, assets, dictionary, single instance |
| `npm run audit:license-package` | PASS |
| commit / push / tag | Initial RC push/tag completed; source-availability follow-up becomes the final `v1.0.0` tag target; Release publication pending |

`audit:license-package` は、staging必須文書、AttChat.exe/ffmpeg.dll/Electron LICENSE/Chromium notices/EJDict/source kit hash、staging manifest、RpenProof license一致、source kit主要entryを検査する。

## Final audit result and remaining risks

### PASS: local packaging set

- binary artifact、source kit、root docs、配布notice、license、revision、主要hashは一致した。
- Electron LICENSEをAtt-Chat MITで上書きしていない。
- FFmpeg対応sourceとWin x64 generated configが実在する。
- Blink source、DEPS、Electron patch/build argsが実在する。
- MPL fixed source pathと保守的候補がsource kit内に存在する。
- RpenProof noticeとEJDict provenance/hashを配布物へ含めた。

### Pending before public download

1. 更新済み `SOURCE_AVAILABILITY.md` を含むWindows staging/ZIPと外側の `SHA256SUMS.txt` を再生成する。
2. binary/source/checksumの3 assetを同じv1.0.0 Releaseへ添付する。
3. Release公開後に各assetを再downloadし、確定SHA-256と照合する。

### Explicitly unverified

- Chromium/Electronのnative full rebuildとrelink。
- 改変したinterface-compatible `ffmpeg.dll`による起動。
- Eigen/gRPC/axe-coreの最終Windows link mapによる含有判定。

これらを実施済みとは記録していない。公開assetの存在を偽らず、現在の完了状態を「ローカルpackaging audit PASS / Release publication pending」とした。
