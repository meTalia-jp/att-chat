# Att-Chat third-party notices

対象: Att-Chat 1.0.0 Windows x64 distribution built with Electron 44.5.1.

Att-Chat本体はrootの `LICENSE` にあるMIT Licenseで提供されます。この文書は第三者コンポーネントの権利を変更せず、各ライセンス本文・copyright notice・source入手先への索引を提供します。Electron配布物rootの `LICENSE` はElectron自身の文書であり、Att-Chatのlicenseで上書きしません。

## Runtime foundation

| Component | Version / revision | License | Use in Att-Chat | License document in Windows distribution | Source |
|---|---|---|---|---|---|
| Electron | 44.5.1; commit `19c601167d4ae75989938416c18ed81eb21c6020` | MIT plus bundled third-party terms | Desktop runtime and `AttChat.exe` | `LICENSE`; Chromium notices in `LICENSES.chromium.html` | [electron/electron fixed commit](https://github.com/electron/electron/tree/19c601167d4ae75989938416c18ed81eb21c6020) |
| Chromium | 152.0.7977.130; commit `2c592105bbcd9490a9894df48d0fe59b2c512651` | BSD-3-Clause and component-specific licenses | Renderer, networking and native runtime embedded in Electron | `LICENSES.chromium.html` | [Chromium fixed commit](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651) |
| Node.js | 24.19.0 | MIT plus bundled third-party terms | Bundled backend process | `resources/node/LICENSE` | [Node.js v24.19.0 source](https://nodejs.org/dist/v24.19.0/) |
| Chromium FFmpeg fork | commit `2b68d2babae73714846961fb0ee47e3b3d2e39a9` | LGPL-2.1-or-later for this configuration | Dynamically loaded `ffmpeg.dll` used by Electron media support | FFmpeg entry and license text in `LICENSES.chromium.html`; corresponding source in the runtime source kit | [fixed FFmpeg fork](https://chromium.googlesource.com/chromium/third_party/ffmpeg/+/2b68d2babae73714846961fb0ee47e3b3d2e39a9) |

The distributed `ffmpeg.dll` is the unmodified file from the Electron 44.5.1 Windows x64 package. Its SHA-256, fixed source, configuration, patch inputs, and replacement instructions are recorded in `SOURCE_AVAILABILITY.md`. This software uses libraries from the FFmpeg project under the LGPL v2.1 or later.

## LGPL-covered Chromium code

The fixed Chromium tree contains WebKit/Blink-derived code under the GNU Library General Public License version 2 or later. A verified example is `third_party/blink/renderer/platform/wtf/text/string_impl.cc` and `.h`, built through `third_party/blink/renderer/platform/wtf/BUILD.gn`. Electron 44.5.1 is a non-component build for this release, so this is handled separately from the replaceable FFmpeg DLL.

The runtime source kit contains the actual fixed Chromium and Electron source archives, `DEPS`, build arguments, and patch/config evidence needed to establish a modifiable rebuild path. Att-Chat's JavaScript and TypeScript code is not relicensed under LGPL merely because it runs on Electron. See `SOURCE_AVAILABILITY.md` for the exact archive and rebuild procedure.

## MPL-covered and conservatively included Chromium code

The fixed Chromium source in the runtime source kit is the modified source form distributed for these components. Paths are relative to Chromium commit `2c592105bbcd9490a9894df48d0fe59b2c512651`.

| Component | Upstream revision / family | License | Windows use / Chromium path | Corresponding source |
|---|---|---|---|---|
| NSPR | 4.38.2; `488a7a069c8d7405696fd8171ec8fc369834158b` | MPL-2.0 | Chromium-adapted time code in `base/third_party/nspr/` | Fixed Chromium archive in runtime source kit |
| Mozilla URL parser | `c7df6606be1bfdf6d6cec37a4ff644a9841c3ec2` | BSD-3-Clause and MPL-1.1 | URL parser fork in `url/third_party/mozilla/` | Fixed Chromium archive in runtime source kit |
| Mozilla Windows Cert | `0fec57c05d3996cc00c55a66f20dd5793a9bfb5d` | MPL-2.0 | Windows certificate code in `net/third_party/mozilla_win/` | Fixed Chromium archive in runtime source kit |
| ISimpleDOM | `3f397dafbaa9dbc7d740e440c7a5112e094588eb` | MPL-1.1 selected by Chromium; original tri-license also offers GPL/LGPL | Windows accessibility input in `third_party/isimpledom/` | Fixed Chromium archive in runtime source kit |
| Hunspell | `96466a6`; CPE 1.7.2 | MPL-1.1 selected by Chromium | Spellchecker engine and Chromium changes in `third_party/hunspell/` | Fixed Chromium archive in runtime source kit |
| Symphonia family | 0.6.0; `980bf5830a90e069fd64641d9c38f067ab772a24` | MPL-2.0 | Vendored Rust sources and GN integration under `third_party/rust/symphonia/` and `third_party/rust/chromium_crates_io/vendor/` | Fixed Chromium archive in runtime source kit |
| Eigen | `d53ac33805ba0a23fa139adaf24227fb6707e6fa` | MPL-2.0 | Final Windows binary inclusion not fully confirmed; supplied conservatively from `third_party/eigen3/` | Fixed Chromium archive in runtime source kit |
| gRPC | 1.71.0-dev; `ff8d12a129eedc58f9602c9fa9d1c01a2a270d62` | Apache-2.0 / BSD / MPL-2.0 combination | Final use of MPL-covered portions not fully confirmed; supplied conservatively from `third_party/grpc/` | Fixed Chromium archive in runtime source kit |
| axe-core | 3.3.2; `281653df3794f429b71327fe3afa37ca0fadb1c7` | MPL-2.0 | Runtime inclusion not fully confirmed; supplied conservatively from `third_party/axe-core/` | Fixed Chromium archive in runtime source kit |

`LICENSES.chromium.html` remains the complete generated Chromium notice collection. Inclusion in that HTML alone is not asserted to prove that every listed project is linked into this Windows artifact.

## RpenProof-derived Marker code

Parts of Att-Chat's Marker foundation selectively modify and carry forward RpenProof's Markdown source-position and text-selection techniques. RpenProof is not the base of the entire Att-Chat application.

| Component | Revision | License | Use | License / trace | Source |
|---|---|---|---|---|---|
| RpenProof-derived code | reference HEAD `dc5fe7fed394378ada3fd2376b0e611249304069`, plus the recorded working-tree snapshot | MIT | Part of the Marker source-offset, selection and rendering foundation | Repository: `licenses/RpenProof-MIT.txt`; distribution: `RpenProof-MIT.txt`; trace: `docs/rpenproof-contribution-trace.md` | Provenance snapshot and manifest under `docs/phase0-reference-snapshot/` and `docs/phase0-rpenproof-source-manifest.json` |

## EJDict-hand

| Component | Bundled revision | License | Use | License / provenance | Source |
|---|---|---|---|---|---|
| EJDict-hand | `ejdict.json` SHA-256 `74bf048fddee2d5bad426f81cc2c10374ae7d8007d7f8550bf42d86c61614e2b`, 5,009,560 bytes | Public Domain / CC0 as stated by the distributor | Offline ASCII single-word Japanese dictionary | `resources/frontend/dictionaries/ejdict-hand/README.md` and `SOURCE.json` | [kujirahand/EJDict](https://github.com/kujirahand/EJDict), [distribution page](https://kujirahand.com/web-tools/EJDictFreeDL.php) |

Att-Chat adds no restriction to EJDict-hand beyond the terms stated by its distributor.

## Frontend npm dependencies

The production frontend directly declares the following packages. Exact transitive versions are locked in `package-lock.json`; the packaged distribution copies available `LICENSE`, `COPYING`, and `NOTICE` files to `resources/licenses/<package>/`.

| Component | Bundled version | License | Use | Source |
|---|---:|---|---|---|
| React | 19.2.8 | MIT | UI runtime | [facebook/react](https://github.com/facebook/react) |
| React DOM | 19.2.8 | MIT | Browser renderer | [facebook/react](https://github.com/facebook/react) |
| react-markdown | 10.1.0 | MIT | Markdown rendering | [remarkjs/react-markdown](https://github.com/remarkjs/react-markdown) |
| remark-gfm | 4.0.1 | MIT | GitHub Flavored Markdown support | [remarkjs/remark-gfm](https://github.com/remarkjs/remark-gfm) |

Build-time and transitive package notices are preserved in `resources/licenses/`. That directory is intentionally broader than code proven to remain in the final bundle; retaining an extra notice does not change a component's license or establish binary inclusion.

## Source availability

Corresponding source, exact hashes, fixed revisions, replacement/rebuild instructions, and publication status are documented in [`SOURCE_AVAILABILITY.md`](SOURCE_AVAILABILITY.md). The large runtime source archive is a separate release asset rather than part of the application ZIP.
