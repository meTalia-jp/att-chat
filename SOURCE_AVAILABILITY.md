# Att-Chat 1.0 native runtime source availability

対象release: **Att-Chat 1.0.0 for Windows x64**
Binary asset name: `Att-Chat-v1.0-win-x64.zip`
Corresponding source asset name: `Att-Chat-v1.0-runtime-source.zip`

この文書は、Att-Chatと共に配布するElectron native runtimeに含まれるLGPL/MPL対象について、固定source、変更、build/relink経路、実際に用意したsource assetを対応付けます。Att-Chat本体のMIT sourceと第三者一覧はrootの `LICENSE` と `THIRD_PARTY_NOTICES.md` を参照してください。

## Publication status

`Att-Chat-v1.0-runtime-source.zip` はこの作業で生成・検査済みですが、**まだ公開されていません**。現在のrepositoryにはGit remoteが設定されておらず、この作業ではcommit / push / tag / GitHub Release作成を行っていません。したがって、未公開assetを「現在download可能」とは表示しません。

公開時は `Att-Chat-v1.0-win-x64.zip` と同じGitHub Releaseへ、次の完全一致assetを添付してください。binaryだけを先に公開しないでください。

| Asset | Size | SHA-256 | Current location / URL |
|---|---:|---|---|
| `Att-Chat-v1.0-runtime-source.zip` | 1,829,801,983 bytes | `125a6b94c9b01340d193d6863d60ad8531b690a3b273129837102ac855ea34c9` | Generated locally at `.cache/license-v1/release-assets/`; public Release URL does not exist yet |

公開後、この行を同じReleaseのimmutable asset URLへ更新し、downloadしたassetのhashを再確認してください。

## Distributed native files

| File | Distribution path | Size | SHA-256 | Origin |
|---|---|---:|---|---|
| Electron executable | `AttChat.exe` | 245,726,208 bytes | `49b61a030a520fc36a4b8fa5cce53fb4e935a7bdbbe4b80e9222f598e49cc7fa` | Electron 44.5.1 `electron.exe` renamed without binary modification |
| FFmpeg shared library | `ffmpeg.dll` | 3,113,472 bytes | `7728490eb079c19b17baeff2b6590c976f6a928b3c17923aeb4fcf1f1f31d299` | Electron 44.5.1 Windows x64 package, copied without modification |
| Chromium notices | `LICENSES.chromium.html` | 20,472,830 bytes | `7b328b8c7463ac9bfc7dc648c751533517c8441a0b5b21047d6c0b2620e60d70` | Electron 44.5.1 package |

The hashes above match the installed Electron package and the audited `electron-dist-phase3` staging. The final license-compliant staging is rebuilt from the same Electron package and is rechecked by the packaging audit.

## Fixed source identity

| Component | Fixed version / revision | Source archive in the kit | Archive SHA-256 | Authoritative source |
|---|---|---|---|---|
| Electron | 44.5.1; `19c601167d4ae75989938416c18ed81eb21c6020` | `electron-19c601167d4ae75989938416c18ed81eb21c6020.zip` | `3f1ae9b6190781a7fd7bac20215c47fbf001cbdf5dc50cd2c029b2e0db118aac` | [fixed commit](https://github.com/electron/electron/tree/19c601167d4ae75989938416c18ed81eb21c6020) |
| Chromium | 152.0.7977.130; `2c592105bbcd9490a9894df48d0fe59b2c512651` | `chromium-2c592105bbcd9490a9894df48d0fe59b2c512651.zip` | `2e2d68063e1ac52eeb3df61452cf86285e7767651562060b4427ec2851220ac0` | [fixed commit](https://chromium.googlesource.com/chromium/src/+/2c592105bbcd9490a9894df48d0fe59b2c512651) |
| Chromium FFmpeg fork | `2b68d2babae73714846961fb0ee47e3b3d2e39a9` | `ffmpeg-2b68d2babae73714846961fb0ee47e3b3d2e39a9.tar.gz` | `35b0c8096e0c21f2de24e1eb14ec5243b76bbd88c44676289cc484f97f152749` | [fixed tree](https://chromium.googlesource.com/chromium/third_party/ffmpeg/+/2b68d2babae73714846961fb0ee47e3b3d2e39a9) |

Electron tag `v44.5.1` has annotated tag object `b4404a4d56d047147aa3474af1817ab902062aba`; the commit above, rather than the tag object, is the source tree identity. Electron's fixed `DEPS` identifies Chromium 152.0.7977.130. Chromium's fixed dependency graph identifies the FFmpeg fork revision.

## What the runtime source asset contains

The source asset contains:

- the intact fixed Electron, Chromium, and Chromium FFmpeg source archives listed above;
- Electron `DEPS`, root `BUILD.gn`, release/all/FFmpeg GN arguments, FFmpeg patch list, and `link_with_loader_path.patch`;
- Chromium `DEPS`, Blink/WTF build/source examples, and metadata for the MPL-covered paths;
- FFmpeg `BUILD.gn`, `ffmpeg_generated.gni`, `README.chromium`, `LICENSE.md`, `COPYING.LGPLv2.1`, and `chromium/config/Chrome/win/x64/config.h`;
- `SOURCE_MANIFEST.json`, `BUILD_INPUTS.json`, `SHA256SUMS.txt`, Windows x64 rebuild instructions, and DLL replacement instructions.

The Chromium archive is the actual fixed Chromium source tree and contains the modified Chromium forms of the listed MPL files. The Electron archive contains its complete patch queues. The FFmpeg archive is the complete fixed Chromium fork tree, not a handful of selected codec files.

The kit is not a pre-synced 100+ GB build checkout and does not redistribute Visual Studio, Windows SDK, depot_tools, downloaded toolchains, PGO data, or every external repository referenced by `DEPS`. Electron's fixed `DEPS` and documented `gclient sync` / build-tools process retrieve those exact external build inputs. A native rebuild was not performed in this packaging task; the kit does not claim byte-for-byte reproduction of the official Electron binary.

## FFmpeg LGPL configuration and changes

Electron release configuration records:

```text
is_component_build = false
is_official_build = true
is_component_ffmpeg = true
ffmpeg_branding = "Chrome"
proprietary_codecs = true
target_cpu = "x64"
```

The fixed Win x64 Chrome config has `CONFIG_GPL=0`, `CONFIG_GPLV3=0`, and `CONFIG_NONFREE=0`. This distribution therefore identifies the FFmpeg configuration as LGPL-2.1-or-later rather than GPL/nonfree. `CONFIG_STATIC=1` and `CONFIG_SHARED=0` in FFmpeg's generated `config.h` do not override Electron's final component-DLL link form; the delivered PE has a separate `ffmpeg.dll`, and Electron release GN sets `is_component_ffmpeg=true`.

Electron's FFmpeg patch list contains `link_with_loader_path.patch`. That patch affects a macOS build branch, but it remains part of the fixed Electron source and is included because a corresponding source package must preserve the real patch input rather than only Windows-touched lines. Att-Chat makes no native change to Electron or FFmpeg.

## Replacing ffmpeg.dll

`ffmpeg.dll` is at the distribution root beside `AttChat.exe`. Att-Chat preserves this dynamic-library layout and does not rename or statically fold the DLL into the application.

An interface-compatible library built from the fixed source/config may be substituted in a disposable copy after Att-Chat is closed. Preserve the original, replace the file under the same `ffmpeg.dll` name, then test the required media paths. Compatibility requires Electron's expected exports and ABI; an arbitrary upstream FFmpeg build is not necessarily compatible. Att-Chat adds no prohibition on replacement or on reverse engineering for modifying/debugging LGPL-covered code.

The packaging task did not build a second compatible DLL, so successful execution with a modified replacement DLL is **unverified**. The source kit's `FFMPEG-REPLACEMENT.md` records the procedure and limitation.

## Blink/WebKit-derived LGPL relink route

The fixed Chromium source contains WebKit/Blink-derived LGPL-family code, including:

```text
third_party/blink/renderer/platform/wtf/text/string_impl.cc
third_party/blink/renderer/platform/wtf/text/string_impl.h
third_party/blink/renderer/platform/wtf/BUILD.gn
```

Electron's Windows release is `is_component_build=false`, so this code is treated as part of the native executable build rather than as a separately replaceable Blink DLL. The source kit therefore includes the complete fixed Electron and Chromium source archives, the Electron patch queue, both DEPS files, and release build configuration. To modify and relink it:

1. Create an Electron build-tools or manual `gclient` checkout.
2. Check out Electron commit `19c601167d4ae75989938416c18ed81eb21c6020`.
3. Run `e sync -f` or `gclient sync -f` to retrieve the DEPS-locked Chromium and external inputs and apply Electron's patches.
4. Verify Chromium commit `2c592105bbcd9490a9894df48d0fe59b2c512651` and FFmpeg commit `2b68d2babae73714846961fb0ee47e3b3d2e39a9`.
5. Modify the LGPL-covered source and build the Windows x64 release with `import("//electron/build/args/release.gn")`.
6. Replace the native Electron runtime files in a disposable Att-Chat staging while retaining the Att-Chat app resources.

Detailed commands and the limits of this verified path are in `BUILDING-WIN-X64.md` inside the source asset. The Electron project documents that `gclient sync` uses DEPS to synchronize Chromium/Node dependencies and applies Electron's patch system. Att-Chat's JS/TS remains under its own MIT license.

## MPL fixed-source availability

All paths below are present in the fixed Chromium source archive included in the runtime source asset. The Chromium form, including Chromium modifications, is supplied rather than only an unmodified upstream project.

| Component | Revision | License | Chromium path |
|---|---|---|---|
| NSPR 4.38.2 | `488a7a069c8d7405696fd8171ec8fc369834158b` | MPL-2.0 | `base/third_party/nspr/` |
| Mozilla URL parser | `c7df6606be1bfdf6d6cec37a4ff644a9841c3ec2` | BSD-3-Clause and MPL-1.1 | `url/third_party/mozilla/` |
| Mozilla Windows Cert | `0fec57c05d3996cc00c55a66f20dd5793a9bfb5d` | MPL-2.0 | `net/third_party/mozilla_win/` |
| ISimpleDOM | `3f397dafbaa9dbc7d740e440c7a5112e094588eb` | MPL-1.1 selected by Chromium | `third_party/isimpledom/` |
| Hunspell | `96466a6` | MPL-1.1 selected by Chromium | `third_party/hunspell/` |
| Symphonia family 0.6.0 | `980bf5830a90e069fd64641d9c38f067ab772a24` | MPL-2.0 | `third_party/rust/symphonia/` and `third_party/rust/chromium_crates_io/vendor/` |

Eigen (`d53ac33805ba0a23fa139adaf24227fb6707e6fa`), gRPC (`ff8d12a129eedc58f9602c9fa9d1c01a2a270d62`), and axe-core (`281653df3794f429b71327fe3afa37ca0fadb1c7`) are also retained in the complete Chromium archive. Their final Windows binary inclusion, or use of their MPL-covered portions, was not fully confirmed; source is provided conservatively and is not presented as proof of inclusion.

## License texts

- Att-Chat MIT: `ATTCHAT-LICENSE.txt` in the Windows distribution and `LICENSE` in the repository.
- Electron MIT: `LICENSE` at the Windows distribution root.
- Chromium and bundled component notices: `LICENSES.chromium.html`.
- Standalone backend Node.js notices: `resources/node/LICENSE`.
- FFmpeg LGPL text: `LICENSES.chromium.html` and `COPYING.LGPLv2.1` inside the runtime source asset.
- RpenProof MIT: repository `licenses/RpenProof-MIT.txt`; distribution root `RpenProof-MIT.txt`.
- npm notices: `resources/licenses/`.
- EJDict provenance/license: `resources/frontend/dictionaries/ejdict-hand/README.md` and `SOURCE.json`.

## Source asset verification

After downloading the published source asset, compare its SHA-256 with this document, extract it, then verify `SHA256SUMS.txt`. Confirm the manifest revisions and archive hashes before building. If the eventual public asset differs from the generated hash above, update this document and rebuild the binary distribution so its bundled copy points to the actual published asset.
