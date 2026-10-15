# Att-Chat Ver1.0 LGPL / MPL Source Availability Audit

調査日: 2026-10-14。対象: `electron-dist-phase3/` Windows x64、Electron 44.5.1。
調査記録のみを追加した。コード・README・LICENSE・配布物・Git履歴は変更していない。

## 1. 結論

**LICENSES.chromium.htmlの同梱だけでは、今回確認したLGPL/MPL対象のソース提供条件まで満たしたとは判断できない。** Ver1.0には、ライセンス本文に加え、実バイナリに対応するソースとその取得方法を整える必要がある。

今回確定できた重要事項:

1. `AttChat.exe` は `ffmpeg.dll` をPEのdelay importで参照する。FFmpegは動的リンクである。対応する公式GN/configではGPL/nonfreeは無効、ライセンスはLGPL 2.1 or later。
2. **FFmpegだけではない。Blink内のWebKit由来LGPLコードが、非component版Electronへ組み込まれる経路がある。** 例として `wtf/text/string_impl.cc` と `.h` のLGPLヘッダー、BUILD対象、Electronの `is_component_build=false` を確認した。これをDLL交換だけで処理してはならない。
3. NSPR、Mozilla URL parser、Mozilla Windows Cert、ISimpleDOM、Hunspell、Symphoniaについて、Windows向けソース/ビルド経路を確認した。MPL対象ソースの案内を追加する。
4. noticeは実Windows実行ファイルの厳密なSBOMではない。Android/別OS専用コード、別配布データ、テスト由来候補まで、名前だけで同梱済みとはしない。
5. Eigen/gRPC/axe-coreの実リンク・埋込みの完全な確定には、該当公式ビルドのGN依存グラフやlink map等が不足する。この少数候補は未確定と明示する。必要条件が確定した対象と混同しない。

したがって、**必要な対応方針は確定できたが、全候補の最小集合と、対応ソースを実際に取得・再リンクできることまでは未検証**である。本書を「release compliance完了」の証明にはしない。

## 2. 調査方法・固定版

実ファイルのPE import/export、notice、staging処理と、Electron/Chromium/FFmpegの固定版一次ソースを照合した。実行ファイルやDLLは実行していない。build、DLL差替え試験、source archiveの作成もしていない。

調査終了時にmanifest記載340ファイルを再ハッシュし、相違0件。配布物のffmpeg.dllとLICENSES.chromium.htmlはinstalled Electronの元ファイルとバイト一致した。本書の末尾空白は0件。

| 対象 | 固定識別子 |
|---|---|
| Electron | tag `v44.5.1`、commit `19c601167d4ae75989938416c18ed81eb21c6020` |
| Electron annotated tag object | `b4404a4d56d047147aa3474af1817ab902062aba`。上のcommitとは別 |
| Chromium | `152.0.7977.130`、commit `2c592105bbcd9490a9894df48d0fe59b2c512651` |
| Chromium fork FFmpeg | `2b68d2babae73714846961fb0ee47e3b3d2e39a9` |
| FFmpegのLast Upstream Merge | `a5e6c0175a7245fc1a9f4639da2810156128aa8b`、2026-07-15。これ単独では対応ソースにならない |
| AttChat.exe SHA-256 | `49b61a030a520fc36a4b8fa5cce53fb4e935a7bdbbe4b80e9222f598e49cc7fa` |
| ffmpeg.dll SHA-256 | `7728490eb079c19b17baeff2b6590c976f6a928b3c17923aeb4fcf1f1f31d299` |

根拠: [Electron DEPS](https://github.com/electron/electron/blob/19c601167d4ae75989938416c18ed81eb21c6020/DEPS)、[Electron tag object](https://api.github.com/repos/electron/electron/git/tags/b4404a4d56d047147aa3474af1817ab902062aba)、[Chromium commit](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651)、[Chromium DEPS](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651/DEPS)、[FFmpeg README.chromium](https://chromium.googlesource.com/chromium/third_party/ffmpeg/+/2b68d2babae73714846961fb0ee47e3b3d2e39a9/README.chromium)。

以降のChromiumソースパスは、この固定Chromium commitを基準にする。上流プロジェクトの版番号だけでなく、Chromiumによる改変を含むこのtreeを渡す必要がある。タグ・HEAD・mainへの一般リンクだけに依存せず、commitも明記する。

## 3. FFmpegの実際の構成

### 3.1 配布・リンク形態

- 実配布: `electron-dist-phase3/ffmpeg.dll`。
- `AttChat.exe` のPE delay import descriptorに `ffmpeg.dll` がある。
- DLLは53個の名前付きexportを持ち、`av_frame_alloc`、`avcodec_*`等のFFmpeg APIを公開する。
- Electron release設定は `is_component_build=false`、`is_component_ffmpeg=true`。Windowsのリンク設定には `/DELAYLOAD:ffmpeg.dll` がある。
- `config.h` の `CONFIG_STATIC=1` / `CONFIG_SHARED=0` は、ChromiumのGNで作る最終DLLのリンク形態そのものを示す値ではない。実PEとGNを優先する。

根拠: [release.gn](https://github.com/electron/electron/blob/19c601167d4ae75989938416c18ed81eb21c6020/build/args/release.gn)、[Electron BUILD.gn](https://github.com/electron/electron/blob/19c601167d4ae75989938416c18ed81eb21c6020/BUILD.gn)。

### 3.2 branding・ライセンス

通常Electronは `ffmpeg_branding="Chrome"`、`proprietary_codecs=true`。該当Chrome/win/x64/config.hには次がある。

```text
FFMPEG_LICENSE = LGPL version 2.1 or later
CONFIG_GPL = 0
CONFIG_NONFREE = 0
CONFIG_GPLV3 = 0
CONFIG_LGPLV3 = 0
```

AAC/H.264等の設定があるが、`proprietary_codecs=true`は `--enable-gpl` や `--enable-nonfree` と同義ではない。今回の構成をGPL版FFmpegとは判定しない。コーデック特許の判断は本調査対象外。

別ファイル `build/args/ffmpeg.gn` はChromium branding/proprietary=falseの代替FFmpeg用であり、通常Electronの設定と取り違えない。実DLLにもAAC/H.264関連文字列があるが、文字列検出だけを全codec構成の証明には使わない。

根拠: [all.gn](https://github.com/electron/electron/blob/19c601167d4ae75989938416c18ed81eb21c6020/build/args/all.gn)、[代替ffmpeg.gn](https://github.com/electron/electron/blob/19c601167d4ae75989938416c18ed81eb21c6020/build/args/ffmpeg.gn)、[対応config.h](https://chromium.googlesource.com/chromium/third_party/ffmpeg/+/2b68d2babae73714846961fb0ee47e3b3d2e39a9/chromium/config/Chrome/win/x64/config.h)。

### 3.3 modified/unmodified

Att-Chat側はElectron付属DLLをそのままコピーしており、Att-Chatによるバイナリ改変はない。しかし次の違いを区別する。

- upstream FFmpegから見ればChromium forkであり、未改変upstream releaseではない。
- ElectronのFFmpegパッチ一覧には `link_with_loader_path.patch` がある。これはBUILD.gnのmacOS分岐を変更するもので、Windows動作へ直接影響する変更ではないが、Electron checkout再現の入力として記録する。
- `README.chromium` はVersionをN/A、RevisionをDEPSとする。任意のFFmpeg 8.x等へ読み替えない。

根拠: [パッチ一覧](https://github.com/electron/electron/blob/19c601167d4ae75989938416c18ed81eb21c6020/patches/ffmpeg/.patches)、[パッチ内容](https://github.com/electron/electron/blob/19c601167d4ae75989938416c18ed81eb21c6020/patches/ffmpeg/link_with_loader_path.patch)。

### 3.4 Ver1.0で用意するもの

LGPL 2.1の経路を採る前提で整理する。

1. DLLに対応するChromium forkの完全なソース、変更、必要なinterface定義・ビルド制御スクリプト。`BUILD.gn`、生成済み構成、`ffmpeg_generated.gni`等を落とさない。
2. 必要な外部ビルド入力（例: OpusやChromium build設定）も版固定し、再構築に必要な範囲を提供対象へ含める。ソース一部だけのarchiveを「完全」としない。
3. DLL hash、Electron/Chromium/FFmpegのcommit、適用パッチ、Win x64、Chrome branding、主要GN argsを対応表へ記録する。
4. LGPL本文とFFmpeg利用表示、実際に取得可能な対応ソースの案内。
5. interface互換の改変DLLを利用できること。現状は動的リンクを確認したが、改変DLLを作って交換する実験は行っていない。
6. 使用条件で、利用者自身の改変・そのデバッグ目的のreverse engineeringを一律禁止しない。

§4はDLLそのもののobject code配布に対応ソースを要求する。ネット配布なら同じ配布場所から同等にソース取得できる経路がある。§6(b)の共有ライブラリ方式はリンクするworkの再リンク要件への選択肢であり、**DLL自体の§4対応を消すものではない**。

FFmpeg公式checklistは同じ配布サーバーでの対応ソース公開、構成・変更の説明等を示すが、全項目が唯一の法的履行方法という説明ではない。今回の実務案は、バイナリを置く同じGitHub Releaseに対応source assetを置く方式とする。

根拠: [FFmpeg公式legal/checklist](https://ffmpeg.org/legal.html)、[固定版LGPL 2.1全文](https://chromium.googlesource.com/chromium/third_party/ffmpeg/+/2b68d2babae73714846961fb0ee47e3b3d2e39a9/COPYING.LGPLv2.1)。ローカルnoticeのFFmpeg項目にも§4/§6を含む全文がある。

## 4. FFmpeg以外のLGPL: Blink/WebKit由来部分

具体例: `third_party/blink/renderer/platform/wtf/text/string_impl.cc` と `.h` はGNU Library GPL version 2 or laterを明示し、WTFのBUILD対象に列挙される。Electron releaseは非component buildであり、配布物に独立したBlink DLLはない。**Blink由来コードはAttChat.exeへ静的に組み込まれるものとして対応する。**

これはnoticeのWebKitという名前だけからの推測ではなく、対応版のソースヘッダーとbuild定義に基づく判定である。ただしこの2ファイルは具体例であり、全LGPLファイルを列挙したものではない。

- version: 固定Chromium tree内のBlink。現在のWebKit最新版では代替できない。
- license: ファイルごとにBSD等と混在。上記はLGPL-2.0-or-laterであり、許される後続版として2.1の条件による整理を採る。
- 改変: Att-ChatによるElectronバイナリ改変なし。WebKitからのChromium fork・Electronパッチは含む。
- 必要事項: 対象ライブラリの対応ソースと、改変して再リンクできる「work that uses the Library」のobject codeまたはsource code等を、選択した履行方法に沿って提供する。
- FFmpegの§6(b)のDLL交換方式を、exe内部のこの部分へそのまま適用しない。
- 実務案: 対応Electron/Chromiumと必要DEPS・パッチ・ビルド入力を含むsource一式を整え、Electronを再構築できる経路を用意する。単にBlinkの数ファイルを公開して終了しない。
- byte-for-byte再現build自体を一般的なlicense条件とはしないが、利用者がライブラリを変更して再リンク可能な材料が必要。

Att-ChatのJS/TS全体をLGPLにするという結論ではない。リンクされたElectron runtimeへの義務と、その上で動くアプリの利用条件を区別する。

根拠: [string_impl.cc](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651/third_party/blink/renderer/platform/wtf/text/string_impl.cc)、[WTF BUILD.gn](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651/third_party/blink/renderer/platform/wtf/BUILD.gn)、[WebKit公式license説明](https://webkit.org/licensing-webkit/)、Electron release.gn。

## 5. Windows向けMPL対象

「Windows build定義上の含有」は公式ソースの依存経路による判定であり、最適化後の全objectをlink mapで実測した意味ではない。MPLの案内対象として扱う十分な根拠があるものを以下に分ける。

| component / version | license | 含有・リンクの根拠 | 改変と対応ソース |
|---|---|---|---|
| NSPR 4.38.2、上流rev `488a7a069c8d7405696fd8171ec8fc369834158b` | MPL-2.0 | `base/BUILD.gn`に `third_party/nspr/prtime.cc`、本体へ組込み | ChromiumでISO 8601処理等を改変。固定Chromiumの `base/third_party/nspr/` |
| Mozilla URL parser、上流rev `c7df6606be1bfdf6d6cec37a4ff644a9841c3ec2` | BSD-3-Clause＋MPL-1.1 | `url/BUILD.gn`の共通URL処理 | 2013年頃からのfork。`url/third_party/mozilla/`。BSDのみと読み替えない |
| Mozilla Windows Cert、上流rev `0fec57c05d3996cc00c55a66f20dd5793a9bfb5d` | MPL-2.0 | `net/BUILD.gn`のWindows分岐、`win_util.cc` | Chromium向け大幅適応。`net/third_party/mozilla_win/` |
| ISimpleDOM、上流rev `3f397dafbaa9dbc7d740e440c7a5112e094588eb` | Chromium選択はMPL-1.1。元ヘッダーにGPL/LGPLとの選択肢 | Windows accessibility依存、IDLから生成・組込み | READMEのLocal modificationsはNone。`third_party/isimpledom/`と生成入力 |
| Hunspell `96466a6`、CPE 1.7.2 | Chromium選択はMPL-1.1 | `use_renderer_spellchecker`はWindowsでもtrue。rendererからstatic_library hunspellへ依存。exeにHunspell文字列あり | BDICT等のChromium改変あり。`third_party/hunspell/`、`google.patch`、BUILD含む |
| Symphonia 0.6.0 family、rev `980bf5830a90e069fd64641d9c38f067ab772a24` | MPL-2.0 | `media_use_symphonia=true`、rust static glueから依存。exe内でbundle-mp3/flacの文字列を確認 | vendored sourceとChromium生成GNを固定。`third_party/rust/chromium_crates_io/vendor/`と各crate BUILD |

Symphonia familyは、noticeにある `symphonia`、`symphonia-bundle-flac`、`symphonia-bundle-mp3`、`symphonia-codec-pcm`、`symphonia-codec-vorbis`、`symphonia-common`、`symphonia-core`、`symphonia-metadata`。上記同じ0.6.0系のソースを対象とする。crateの使用時機能が無効でも、バイナリへコードが含まれるなら配布義務は消えない。

全対象でAtt-Chat自身による変更は確認されないが、「上流未改変」とは限らない。**Chromium内の改変後ソースを案内する**。MPLは静的リンクというだけでAtt-Chat全体のソース公開を要求するものではなく、対象ファイルとその変更が中心となる。

一次情報（いずれも固定Chromium版）:

- [NSPR metadata](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651/base/third_party/nspr/README.chromium)、[base BUILD](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651/base/BUILD.gn)
- [URL parser metadata](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651/url/third_party/mozilla/README.chromium)、[URL BUILD](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651/url/BUILD.gn)
- [Windows Cert metadata](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651/net/third_party/mozilla_win/README.chromium)、[net BUILD](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651/net/BUILD.gn)
- [ISimpleDOM metadata](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651/third_party/isimpledom/README.chromium)、[accessibility BUILD](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651/ui/accessibility/platform/BUILD.gn)
- [Hunspell metadata](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651/third_party/hunspell/README.chromium)、[spellcheck flags](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651/components/spellcheck/spellcheck_build_features.gni)、[renderer BUILD](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651/components/spellcheck/renderer/BUILD.gn)
- [Symphonia metadata](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651/third_party/rust/symphonia/v0_6/README.chromium)、[crate BUILD](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651/third_party/rust/symphonia/v0_6/BUILD.gn)、[media flags](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651/media/media_options.gni)

## 6. noticeにあるが一律に実配布としない対象

| 対象 | license/版情報 | 今回の扱いと根拠 |
|---|---|---|
| Android NDK、common/core-common、feature-delivery、googleid、play-services-*、review | 複合notice内にLGPL/MPL記述 | Android向け。Windows componentとして追加ソース義務を認定しない |
| glibc、libsecret、libbrlapi、Speech Dispatcher、v4l-utils、plasma-wayland-protocols | LGPL/MPL等 | Linux/POSIX系で今回のWindows対象ではない。対応OSの配布時には再監査 |
| libusbx/libusb | LGPL | 対応USB BUILDではlibusb依存がis_mac分岐。WindowsはWinUSB経路。名前だけでWindows DLL同梱としない |
| Mozilla Personal Security Manager、Mozilla 1.9.2 fork | MPL-1.1 | `net`のuse_nss_certs分岐。定義はis_linux/is_chromeosでWindowsではfalse |
| ScreenAI Library 148.13 | MPL/GPL等を含む複合notice | READMEはChromeがComponent Updaterで別途取得するバイナリと明記。現artifactには該当library/modelsなし。exe内のscreen_ai文字列は呼出し側コードの存在と区別 |
| Hunspell dictionaries、DEPS rev `cccf64a8acc951afe3f47fee023908e55699bc58` | 辞書別のLGPL/MPL/その他 | engineとは別データ。artifactにbdic辞書なし。将来download/cacheを再配布する場合は別途対象 |
| hyphenation-patterns、rev `06ce8d348f9145e41e8f52ff9f83470fe3563084` | LGPL-2.1/MPL-1.1/MPL-2.0等、言語別 | Windowsでもminikin利用設定はtrue。ただしBUILD出力のhyphens-data.zip/hyphen-data/*.hybは現artifactにない。エンジン有効と辞書データ同梱を区別 |
| Eigen、rev `d53ac33805ba0a23fa139adaf24227fb6707e6fa` | MPL-2.0 | notice/metadataはyesだが最終リンク経路未確定。header templateが生成コードに入る可能性もあり、文字列がないことでは除外しない |
| grpc v1.71.0-dev、rev `ff8d12a129eedc58f9602c9fa9d1c01a2a270d62` | Apache/BSD/MPL複合 | noticeだけでは実使用MPL部分・Electronへの含有を確定できない |
| axe-core 3.3.2、rev `281653df3794f429b71327fe3afa37ca0fadb1c7` | MPL-2.0 | metadataはWeb UI自動テスト用途。出力JS/pakでの含有は確定できず。圧縮資産やdead strippingがあるため文字列不在だけで除外しない |

未確定3候補は、(a)実ビルドのGN graph/link map等で除外を証明するか、(b)「含有未確定の補足ソース」と表示して固定版ソース案内に含める。後者は全notice項目に義務があるとの判断ではなく、最小集合の確定を待たずに不足を避ける運用案である。

notice生成の仕組みも確認した。`components/resources/BUILD.gn` はlicenses.pyへcredits/target-osを渡すが、GN target限定を渡していない。licenses.pyはgn-target未指定時にthird_partyを走査する。これが「Shipped: yes」やHTML掲載だけではElectron Windowsの含有証拠にならない理由である。

根拠: [credits生成BUILD](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651/components/resources/BUILD.gn)、[licenses.py](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651/tools/licenses/licenses.py)、[NSS flags](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651/crypto/features.gni)、[USB BUILD](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651/services/device/usb/BUILD.gn)、[ScreenAI metadata](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651/third_party/screen-ai/README.chromium)、[hyphenation BUILD](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651/third_party/hyphenation-patterns/BUILD.gn)、[minikin flag](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651/third_party/blink/public/public_features.gni)。

## 7. ソースURL・archive・build情報の要否

| 区分 | 入手案内で足りる条件 | archive自前配布 | build情報 |
|---|---|---|---|
| FFmpeg DLL / LGPL 2.1 §4 | 実対応ソースが実際に提供され、ネット配布の同じ場所から同等に取得できる等、選んだ条項を満たす必要。一般上流リンクだけでは未達 | ZIP形式や自社サーバーという形式自体は必須でない。本件は同じGitHub Releaseへの対応source assetを推奨 | 対応ソースに必要なビルド制御scripts/interface定義を含め、fork/patch/configを説明 |
| FFmpegを使うElectron / §6(b) | 互換改変DLLで動作する共有ライブラリ機構、利用表示、license、改変/デバッグ権の確保 | DLLソースの§4対応は別途必要 | 交換方法・互換条件。差替え実験は未実施 |
| Blink内LGPL静的部分 / §6(a),(d)等 | sourceの存在だけでなく改変libraryと再リンク可能な材料が必要 | 本件は完全なruntime source/build入力の同じReleaseでの提供を推奨。代替の書面offer等を使うなら別途履行体制が必要 | library source、work側source/object、必要scripts。ElectronだけのGitHub自動source ZIPはChromium/DEPSを含まず不十分 |
| MPL-2.0 | 対象版の改変込みsourceが合理的手段で速やかに取得でき、その方法とMPL適用を通知。正確な第三者hostの固定URLでも可能 | 一律に必須ではない。消失対策のmirror/保存は推奨 | LGPLの再リンクkitと同じ義務ではない。preferred formの対象sourceを提供 |
| MPL-1.1 | §3.6のsource利用可能性のnoticeを含め、§3.1〜3.5等を満たす。固定版・改変込みsourceのURLが必要 | 第三者hostも可能だが利用可能性の責任は丸投げできない | sourceの定義に関連scripts等が含まれる。改変記録も保持 |

MPL 1.1 §3.2には、作成・寄与したModificationを電子提供する場合の12か月/後続版公開後6か月の期間規定がある。MPL 2.0にそのまま同じ期間を転記しない。今回はAtt-Chatによる対象ソース変更なしだが、上流の改変ソースとnoticeを保持し、配布期間中のリンク切れを放置しない運用が必要。

「GitHubリンクだから足りる/足りない」ではなく、**どのlicenseのどの条項を、どの対応ソース・提供方法で満たすか**で判断する。LGPLの選択可能な別方式を否定するものではないが、現状は書面offerやその履行体制もない。

根拠: [MPL 2.0 §3.1–3.4](https://www.mozilla.org/en-US/MPL/2.0/)、[Mozilla FAQ Q8–12](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)、[MPL 1.1 §1/§3](https://www.mozilla.org/en-US/MPL/1.1/)、前掲LGPL全文。

## 8. SOURCE_AVAILABILITY.mdに書く内容

このファイル名はlicense上の指定ではない。しかし現状のHTMLに不足する案内を追加するため、本件では同等内容の文書が必要である。今回は作成しない。

- Att-Chat releaseと対象Windows x64 artifactの識別、Electron/Chromium版、runtime/DLL hash。
- LGPL対象とMPL対象を分けたcomponent一覧。確定・ビルド経路確認・補足候補を区別。
- 各componentのlicense、copyright/全文の同梱位置。
- source repository、固定commit、Chromium内のpath、適用patch。
- upstream未改変とAtt-Chat未改変を区別した変更説明。
- **実際に公開済みの**source取得URL、archive名・hash、範囲。未作成assetを取得可能と書かない。
- FFmpegのbranding/config、Windows x64 build手順、互換DLL交換案内。
- Blink静的部分について、runtimeを変更・再リンクするためのsource/objectとbuild入力の入手方法。
- MPL sourceが該当MPLのもとで利用できる旨。上流変更記録の場所。
- リンク不達時の連絡先・代替提供方法。書面offerを選ぶならその有効期間と実際の提供体制。

全文licenseをこの文書へ重複貼付する必要はない。既存HTMLの該当項目に案内できる。ただし、具体的なsource取得案内の代わりにlicense本文だけを置くことはできない。

## 9. 配布物とGitHubに用意するもの

### バイナリ配布物

- 既存Electron LICENSE/完全なLICENSES.chromium.htmlを維持する。
- LGPL利用表示、対応source案内、MPL source案内を利用者が見つけられる文書に同梱する。例: SOURCE_AVAILABILITY.md＋第三者一覧。
- 改変・デバッグ目的reverse engineeringを禁止しない条件を、実際の利用規約と整合させる。
- source archiveを必ずアプリZIP内へ入れる必要はない。ネット配布で選んだ条項に合う同等取得経路を同じReleaseに設ける方式を採れる。オフライン配布はその媒体・提供方式で再評価する。

### GitHub / release公開場所

- 同じsource案内をリポジトリとReleaseから参照可能にする。
- 実配布版のcommit/patch/configとsource asset対応表を残す。
- 推奨するLGPL履行経路では、同じReleaseに対応source資産を置く。巨大なruntime sourceをGitの通常treeへ直接commitする必要はない。
- MPLのみなら固定した上流の対応source URLによる案内も可能。Electronの一般homepage、最新版README、GitHub自動生成のElectron単体source ZIPだけでは、全対象の対応sourceを示したことにならない。
- archiveの作成・取得試験・再リンク可能性の確認は次の実装/配布準備工程。本調査では実施していない。

## 10. Blocking項目と完了条件

| 項目 | 現在 | 公開前に必要な状態 |
|---|---|---|
| FFmpegの版・基本構成特定 | 確認済み | 本書の固定版と最終DLLの対応を維持 |
| FFmpeg対応ソース提供 | 未整備 | 改変・必要scripts込みのsourceが実際に取得可能。案内を同梱 |
| Blink静的LGPL部分の再リンク材料 | 未整備 | 対応runtime source/object等とbuild入力を提供し、選んだ条項に合う経路を確保 |
| MPLの対応ソース通知 | 不足 | Windows対象に対する版固定・改変込みsource案内を同梱 |
| Eigen/grpc/axe-coreの最小含有判定 | 未確定 | GN graph等で確定するか、補足sourceとして保守的に提供範囲へ含める |
| 文書と実公開URLの整合 | 未実施 | Releaseからsource取得、archive内容、patch/config対応を検証 |

本書では実機再リンク・source archive完全性検証を行っていないため、完成したsource kitの保証はしない。法律上の適用境界に判断余地がある部分は、採用する配布方式と文書が具体化した時点で専門家確認の対象にできる。ただし、既存noticeだけで不足が解消した扱いにはしない。

## 11. 最後の質問への回答

**Q1. Ver1.0公開のblocking項目は何か。**
FFmpeg対応ソースの提供、Blink内静的LGPL部分の改変・再リンク可能な材料と提供経路、Windows対象MPL source案内が未整備。候補3件は厳密な除外確認か補足source提供で閉じる。これは他の本体license/RpenProof問題とは独立した判定。

**Q2. ffmpeg.dllについて何を用意すればよいか。**
固定Chromium FFmpeg fork＋Electron patch＋Win x64 Chrome構成＋必要build入力、LGPL全文/利用表示、同じReleaseから取得できる対応source、互換DLL交換案内。単なる最新FFmpegのURLでは不足。

**Q3. MPL対象について追加対応が必要か。**
必要。確認したWindows経路の対象について、改変込み固定sourceの取得方法とMPL適用を通知する。MPLだけを理由にAtt-Chat全体のsource公開や再リンクobject配布を要求しない。Android等を名前だけで一括対象にしない。

**Q4. SOURCE_AVAILABILITY.mdには何を書くか。**
artifact/hash、component/license、固定revision/path/patch、sourceの実取得URL、build/差替え・再リンク情報、MPL利用可能性、問い合わせ先。第8節を具体化する。名称自体は必須ではない。

**Q5. GitHubリンクだけで足りる項目と足りない項目。**
MPLは正しい版の改変込みsourceが利用可能で、必要な通知・権利保持を満たすなら第三者GitHub等への固定リンクでも可能。LGPLについて一般的なGitHubリンクだけで§4/§6対応を認定しない。同じReleaseの完全な対応source asset等を用意する。Electron単体source ZIPにはChromium/DEPSが含まれない。

**Q6. 配布物へ必ず同梱すべきもの。**
必要なlicense/copyright文（既存HTML等を保持）、LGPL利用表示、source入手案内、MPL source通知、採用方式に必要なoffer等。アプリZIP内への全source同梱は一律必須ではないが、別配布の場合も実際のsource提供経路と取得条件を満たす必要がある。

## 12. 未実施・調査限界

- 公式ビルドの完全なGN dependency graph/link map/PDBによる全ライブラリ・最適化後objectの照合。
- Eigen/grpc/axe-coreの最終含有証明。notice/文字列検索だけで確定しなかった。
- runtime初回起動で追加downloadされるcomponentやユーザーの既存profile/cacheの監査。対象は現在のstaged artifact。
- 対応source一式のdownload/保全、archive作成、build、DLL交換、Electron再リンク試験。
- 全ソースの著作権帰属・コーデック特許・第三者権利の法律意見。

これらを行ったとする記録や、未取得sourceを公開済みとする記述は追加していない。
