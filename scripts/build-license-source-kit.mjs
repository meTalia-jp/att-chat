import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFile, link, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootPackage = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (typeof rootPackage.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(rootPackage.version)) {
  throw new Error('Root package.json must define a non-empty SemVer version');
}
const appVersion = rootPackage.version;
const cacheRoot = resolve(process.env.ATTCHAT_LICENSE_CACHE ?? join(root, `.cache/license-v${appVersion}`));
const inputDirectory = resolve(process.env.ATTCHAT_RUNTIME_SOURCE_INPUTS ?? join(cacheRoot, 'source-inputs'));
const stageRoot = resolve(process.env.ATTCHAT_RUNTIME_SOURCE_STAGE ?? join(cacheRoot, 'runtime-source'));
const packageName = `Att-Chat-v${appVersion}-runtime-source`;
const output = join(stageRoot, packageName);

const inputs = [
  {
    component: 'Electron',
    version: '44.5.1',
    revision: '19c601167d4ae75989938416c18ed81eb21c6020',
    file: 'electron-19c601167d4ae75989938416c18ed81eb21c6020.zip',
    sha256: '3f1ae9b6190781a7fd7bac20215c47fbf001cbdf5dc50cd2c029b2e0db118aac',
    license: 'MIT plus component-specific licenses',
    sourceUrl: 'https://codeload.github.com/electron/electron/zip/19c601167d4ae75989938416c18ed81eb21c6020',
  },
  {
    component: 'Chromium',
    version: '152.0.7977.130',
    revision: '2c592105bbcd9490a9894df48d0fe59b2c512651',
    file: 'chromium-2c592105bbcd9490a9894df48d0fe59b2c512651.zip',
    sha256: '2e2d68063e1ac52eeb3df61452cf86285e7767651562060b4427ec2851220ac0',
    license: 'BSD-3-Clause plus component-specific licenses including LGPL and MPL',
    sourceUrl: 'https://codeload.github.com/chromium/chromium/zip/2c592105bbcd9490a9894df48d0fe59b2c512651',
  },
  {
    component: 'Chromium FFmpeg fork',
    version: 'fixed Chromium dependency',
    revision: '2b68d2babae73714846961fb0ee47e3b3d2e39a9',
    file: 'ffmpeg-2b68d2babae73714846961fb0ee47e3b3d2e39a9.tar.gz',
    sha256: '35b0c8096e0c21f2de24e1eb14ec5243b76bbd88c44676289cc484f97f152749',
    license: 'LGPL-2.1-or-later for the distributed configuration',
    sourceUrl: 'https://chromium.googlesource.com/chromium/third_party/ffmpeg/+archive/2b68d2babae73714846961fb0ee47e3b3d2e39a9.tar.gz',
  },
];

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sha256File = path => new Promise((resolveHash, reject) => {
  const hash = createHash('sha256');
  const stream = createReadStream(path);
  stream.on('error', reject);
  stream.on('data', chunk => hash.update(chunk));
  stream.on('end', () => resolveHash(hash.digest('hex')));
});
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
};
const linkOrCopy = async (source, destination) => {
  await mkdir(dirname(destination), { recursive: true });
  try { await link(source, destination); } catch { await copyFile(source, destination); }
};

await rm(stageRoot, { recursive: true, force: true });
await mkdir(join(output, 'source-archives'), { recursive: true });

const manifestInputs = [];
for (const input of inputs) {
  const source = join(inputDirectory, input.file);
  const info = await stat(source);
  const actualHash = await sha256File(source);
  if (actualHash !== input.sha256) throw new Error(`${input.file} checksum mismatch: ${actualHash}`);
  await linkOrCopy(source, join(output, 'source-archives', input.file));
  manifestInputs.push({ ...input, size: info.size, archivePath: `source-archives/${input.file}` });
}

const electronRoot = `electron-${inputs[0].revision}`;
const chromiumRoot = `chromium-${inputs[1].revision}`;
const electronEvidence = [
  'DEPS', 'LICENSE', 'BUILD.gn', 'build/args/all.gn', 'build/args/release.gn',
  'build/args/ffmpeg.gn', 'patches/ffmpeg/.patches', 'patches/ffmpeg/link_with_loader_path.patch',
].map(path => `${electronRoot}/${path}`);
const chromiumEvidence = [
  'DEPS', 'LICENSE',
  'third_party/blink/renderer/platform/wtf/BUILD.gn',
  'third_party/blink/renderer/platform/wtf/text/string_impl.cc',
  'third_party/blink/renderer/platform/wtf/text/string_impl.h',
  'base/third_party/nspr/README.chromium',
  'url/third_party/mozilla/README.chromium',
  'net/third_party/mozilla_win/README.chromium',
  'third_party/isimpledom/README.chromium',
  'third_party/hunspell/README.chromium',
  'third_party/rust/symphonia/v0_6/README.chromium',
  'third_party/eigen3/README.chromium',
  'third_party/grpc/README.chromium',
  'third_party/axe-core/README.chromium',
].map(path => `${chromiumRoot}/${path}`);
const ffmpegEvidence = [
  'README.chromium', 'LICENSE.md', 'COPYING.LGPLv2.1', 'BUILD.gn', 'ffmpeg_generated.gni',
  'chromium/config/Chrome/win/x64/config.h',
];

const evidence = join(output, 'build-evidence');
await mkdir(evidence, { recursive: true });
run('tar.exe', ['-xf', join(inputDirectory, inputs[0].file), '-C', evidence, ...electronEvidence]);
run('tar.exe', ['-xf', join(inputDirectory, inputs[1].file), '-C', evidence, ...chromiumEvidence]);
await mkdir(join(evidence, 'ffmpeg'), { recursive: true });
run('tar.exe', ['-xzf', join(inputDirectory, inputs[2].file), '-C', join(evidence, 'ffmpeg'), ...ffmpegEvidence]);

const coveredComponents = [
  { component: 'Blink/WTF text implementation', license: 'GNU Library GPL 2 or later', archive: inputs[1].file, path: 'third_party/blink/renderer/platform/wtf/' },
  { component: 'NSPR', revision: '488a7a069c8d7405696fd8171ec8fc369834158b', license: 'MPL-2.0', archive: inputs[1].file, path: 'base/third_party/nspr/' },
  { component: 'Mozilla URL parser', revision: 'c7df6606be1bfdf6d6cec37a4ff644a9841c3ec2', license: 'BSD-3-Clause and MPL-1.1', archive: inputs[1].file, path: 'url/third_party/mozilla/' },
  { component: 'Mozilla Windows Cert', revision: '0fec57c05d3996cc00c55a66f20dd5793a9bfb5d', license: 'MPL-2.0', archive: inputs[1].file, path: 'net/third_party/mozilla_win/' },
  { component: 'ISimpleDOM', revision: '3f397dafbaa9dbc7d740e440c7a5112e094588eb', license: 'MPL-1.1 selected by Chromium', archive: inputs[1].file, path: 'third_party/isimpledom/' },
  { component: 'Hunspell', revision: '96466a6', license: 'MPL-1.1 selected by Chromium', archive: inputs[1].file, path: 'third_party/hunspell/' },
  { component: 'Symphonia family', revision: '980bf5830a90e069fd64641d9c38f067ab772a24', license: 'MPL-2.0', archive: inputs[1].file, path: 'third_party/rust/symphonia/ and third_party/rust/chromium_crates_io/vendor/' },
  { component: 'Eigen (conservative inclusion)', revision: 'd53ac33805ba0a23fa139adaf24227fb6707e6fa', license: 'MPL-2.0', archive: inputs[1].file, path: 'third_party/eigen3/' },
  { component: 'gRPC (conservative inclusion)', revision: 'ff8d12a129eedc58f9602c9fa9d1c01a2a270d62', license: 'Apache/BSD/MPL combination', archive: inputs[1].file, path: 'third_party/grpc/' },
  { component: 'axe-core (conservative inclusion)', revision: '281653df3794f429b71327fe3afa37ca0fadb1c7', license: 'MPL-2.0', archive: inputs[1].file, path: 'third_party/axe-core/' },
];

const buildInputs = {
  target: 'Windows x64 Electron 44.5.1 release runtime',
  electronRevision: inputs[0].revision,
  chromiumVersion: inputs[1].version,
  chromiumRevision: inputs[1].revision,
  ffmpegRevision: inputs[2].revision,
  electronEmbeddedNodeVersion: 'v24.21.0',
  gn: {
    import: '//electron/build/args/release.gn',
    is_component_build: false,
    is_official_build: true,
    is_component_ffmpeg: true,
    ffmpeg_branding: 'Chrome',
    proprietary_codecs: true,
    target_cpu: 'x64',
  },
  ffmpegConfig: 'chromium/config/Chrome/win/x64/config.h',
  ffmpegLicenseFlags: { CONFIG_GPL: 0, CONFIG_GPLV3: 0, CONFIG_NONFREE: 0 },
  note: 'CONFIG_STATIC/CONFIG_SHARED inside FFmpeg config.h describe FFmpeg configuration details; the delivered runtime link form is established by Electron is_component_ffmpeg=true and the separate dynamically loaded ffmpeg.dll.',
};
await writeFile(join(output, 'BUILD_INPUTS.json'), `${JSON.stringify(buildInputs, null, 2)}\n`);

const readme = `# Att-Chat ${appVersion} runtime corresponding source kit

This package preserves the fixed source inputs used to identify the native Electron runtime distributed with Att-Chat ${appVersion} for Windows x64.

It contains the actual Electron 44.5.1 source archive, the actual Chromium 152.0.7977.130 source archive (including Blink and the listed MPL-covered paths), and the actual Chromium FFmpeg fork source archive. The source archives are retained intact. Selected DEPS, GN arguments, patches, generated FFmpeg configuration, license files, and representative LGPL/MPL paths are also extracted under \`build-evidence/\` for review.

The archive is not a pre-synced 100+ GB Chromium build checkout and does not include Microsoft Visual Studio, Windows SDK, depot_tools, downloaded toolchains, PGO data, or every external DEPS repository. Those are obtained at their pinned revisions by Electron's documented \`gclient sync\` / build-tools process. This package does not claim byte-for-byte reproducibility of the official Electron binary.

See:

- \`SOURCE_MANIFEST.json\` for source identity, archive hashes, component paths, and licenses.
- \`BUILDING-WIN-X64.md\` for the rebuild and relink route.
- \`FFMPEG-REPLACEMENT.md\` for the dynamic DLL replacement location and limits.
- \`BUILD_INPUTS.json\` for the recorded release configuration.
- \`SHA256SUMS.txt\` for the package file inventory.
`;
await writeFile(join(output, 'README.md'), readme);

const building = `# Rebuilding the Electron runtime on Windows x64

## Fixed inputs

- Electron: 44.5.1, commit \`${inputs[0].revision}\`
- Chromium: ${inputs[1].version}, commit \`${inputs[1].revision}\`
- Chromium FFmpeg fork: commit \`${inputs[2].revision}\`
- Target: Windows x64 release
- GN entry point: \`import("//electron/build/args/release.gn")\`

The preserved source archives can be inspected and modified directly. For a buildable checkout, use Electron's supported build-tools or manual gclient workflow because Electron applies its patch queues and synchronizes the exact external repositories named by DEPS.

1. Install the Windows prerequisites documented by Electron and Chromium, including depot_tools, the supported Visual Studio C++ workload, and Windows SDK. Set \`DEPOT_TOOLS_WIN_TOOLCHAIN=0\` when using the local Visual Studio toolchain.
2. Initialize an Electron checkout with \`@electron/build-tools\` (recommended) or \`gclient config --name "src/electron" --unmanaged https://github.com/electron/electron\`.
3. In \`src/electron\`, check out commit \`${inputs[0].revision}\`.
4. Run \`e sync -f\` or \`gclient sync --with_branch_heads --with_tags -f\`. The fixed Electron DEPS resolves Chromium ${inputs[1].version}; verify the resulting Chromium commit is \`${inputs[1].revision}\` and the FFmpeg checkout is \`${inputs[2].revision}\`.
5. Verify Electron's patch queues, including \`electron/patches/ffmpeg/.patches\`, have applied. The recorded FFmpeg patch is preserved in this kit.
6. Generate the release build with \`gn gen out/Release --args="import(\\"//electron/build/args/release.gn\\") target_cpu=\\"x64\\""\` using the syntax appropriate to the shell.
7. Build Electron with Electron build-tools (\`e build\`) or the corresponding siso target from the synchronized checkout.

To modify Blink/WTF or an MPL-covered file, edit that file in the synchronized Chromium checkout, rebuild Electron, and replace the native runtime files in a disposable Att-Chat staging directory. Att-Chat itself adds no Electron/Chromium native patch. Electron's patch system and fixed DEPS are part of the rebuild inputs and must not be omitted.

This procedure has been checked against the preserved DEPS/GN/patch files. A complete native rebuild was not performed during Att-Chat packaging; it requires the large synchronized checkout and supported Windows toolchain.
`;
await writeFile(join(output, 'BUILDING-WIN-X64.md'), building);

const replacement = `# ffmpeg.dll replacement

The Windows x64 Att-Chat distribution places \`ffmpeg.dll\` beside \`AttChat.exe\` at the distribution root. \`AttChat.exe\` uses Electron's component FFmpeg configuration and dynamically loads that DLL.

For modification or debugging, work in a copy of the distribution:

1. Close Att-Chat.
2. Preserve the shipped \`ffmpeg.dll\`.
3. Build the same Chromium FFmpeg fork with an interface-compatible Electron 44.5.1 Windows x64 configuration.
4. Replace the root \`ffmpeg.dll\` without renaming it.
5. Start Att-Chat and test all required media paths.

Compatibility requires the exported ABI and Electron expectations to match. A differently configured DLL may fail to load or may remove codecs. Att-Chat does not impose a contractual prohibition on replacing the DLL or on reverse engineering performed for modification/debugging of LGPL-covered code. The source-kit preparation did not build a second compatible DLL, so successful replacement with a modified DLL remains unverified.
`;
await writeFile(join(output, 'FFMPEG-REPLACEMENT.md'), replacement);

const manifest = {
  schemaVersion: 1,
  package: packageName,
  release: `Att-Chat ${appVersion}`,
  target: 'win32-x64',
  generatedAt: new Date().toISOString(),
  sourceArchives: manifestInputs,
  coveredComponents,
  buildEvidence: { electron: electronEvidence, chromium: chromiumEvidence, ffmpeg: ffmpegEvidence },
  completeness: {
    actualFixedSourceArchivesIncluded: true,
    fixedDepsAndBuildFilesIncluded: true,
    preSyncedExternalDepsIncluded: false,
    compilerAndWindowsSdkIncluded: false,
    nativeRebuildPerformed: false,
    explanation: 'The kit contains the actual fixed Electron, Chromium, and FFmpeg sources. Electron DEPS and build instructions reconstruct the external dependency checkout; proprietary toolchains and downloaded build services/data are not redistributed.',
  },
};
await writeFile(join(output, 'SOURCE_MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const files = [];
async function inventory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await inventory(path);
    else if (entry.name !== 'SHA256SUMS.txt') files.push(path);
  }
}
await inventory(output);
files.sort((left, right) => relative(output, left).localeCompare(relative(output, right)));
const sums = [];
for (const path of files) sums.push(`${await sha256File(path)}  ${relative(output, path).replaceAll('\\', '/')}`);
await writeFile(join(output, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);

console.log(JSON.stringify({ output, archives: manifestInputs.map(item => ({ file: item.file, size: item.size, sha256: item.sha256 })) }, null, 2));
