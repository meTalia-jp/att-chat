import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const distribution = resolve(process.env.ATTCHAT_LICENSE_DIST ?? '.cache/license-v1/distribution/Att-Chat-v1.0-win-x64');
const sourceZip = resolve(process.env.ATTCHAT_LICENSE_SOURCE_ZIP ?? '.cache/license-v1/release-assets/Att-Chat-v1.0-runtime-source.zip');
const expected = {
  executable: '49b61a030a520fc36a4b8fa5cce53fb4e935a7bdbbe4b80e9222f598e49cc7fa',
  ffmpeg: '7728490eb079c19b17baeff2b6590c976f6a928b3c17923aeb4fcf1f1f31d299',
  electronLicense: '5154e165bd6c2cc0cfbcd8916498c7abab0497923bafcd5cb07673fe8480087d',
  chromiumNotices: '7b328b8c7463ac9bfc7dc648c751533517c8441a0b5b21047d6c0b2620e60d70',
  dictionary: '74bf048fddee2d5bad426f81cc2c10374ae7d8007d7f8550bf42d86c61614e2b',
  sourceZip: '125a6b94c9b01340d193d6863d60ad8531b690a3b273129837102ac855ea34c9',
};
const sha256File = path => new Promise((resolveHash, reject) => {
  const hash = createHash('sha256');
  const stream = createReadStream(path);
  stream.on('error', reject);
  stream.on('data', chunk => hash.update(chunk));
  stream.on('end', () => resolveHash(hash.digest('hex')));
});
const file = path => join(distribution, path);

export const v100Publication = Object.freeze({
  release: 'https://github.com/meTalia-jp/att-chat/releases/tag/v1.0.0',
  assets: Object.freeze({
    'Att-Chat-v1.0-win-x64.zip': 'https://github.com/meTalia-jp/att-chat/releases/download/v1.0.0/Att-Chat-v1.0-win-x64.zip',
    'Att-Chat-v1.0-runtime-source.zip': 'https://github.com/meTalia-jp/att-chat/releases/download/v1.0.0/Att-Chat-v1.0-runtime-source.zip',
    'SHA256SUMS.txt': 'https://github.com/meTalia-jp/att-chat/releases/download/v1.0.0/SHA256SUMS.txt',
  }),
});

const stalePublicationClaims = [
  /not yet published/i,
  /still unpublished/i,
  /pre-publication/i,
  /may not resolve/i,
  /まだ公開されていません/,
  /未公開/,
  /Release公開までは解決しない/,
  /現時点でdownload可能であることを意味しません/i,
];

export function assertPublishedSourceAvailability(availability) {
  assert.match(availability, /Att-Chat v1\.0\.0[^\n]*(?:公開済み|publicly available)/i, 'SOURCE_AVAILABILITY.md must state that v1.0.0 is published');
  assert.ok(availability.includes(v100Publication.release), `SOURCE_AVAILABILITY.md missing public Release URL: ${v100Publication.release}`);
  const releaseLinks = [...availability.matchAll(/https:\/\/github\.com\/meTalia-jp\/att-chat\/releases\/tag\/([^\s)>]+)/gi)];
  assert.ok(releaseLinks.length > 0, 'SOURCE_AVAILABILITY.md must identify the v1.0.0 Release');
  for (const match of releaseLinks) assert.equal(match[1], 'v1.0.0', `SOURCE_AVAILABILITY.md links to wrong Release tag: ${match[1]}`);

  const assetLinks = [...availability.matchAll(/https:\/\/github\.com\/meTalia-jp\/att-chat\/releases\/download\/([^/\s>]+)\/(Att-Chat-v1\.0-win-x64\.zip|Att-Chat-v1\.0-runtime-source\.zip|SHA256SUMS\.txt)/gi)];
  for (const [name, expectedUrl] of Object.entries(v100Publication.assets)) {
    const urls = [...new Set(assetLinks.filter(match => match[2].toLowerCase() === name.toLowerCase()).map(match => match[0]))];
    assert.deepEqual(urls, [expectedUrl], `SOURCE_AVAILABILITY.md must use only the v1.0.0 URL for ${name}`);
  }
  assert.match(availability, /Windows binary、対応source、checksumは同じv1\.0\.0 Releaseで公開/i, 'SOURCE_AVAILABILITY.md must state that binary and corresponding source share the v1.0.0 Release');
  for (const staleClaim of stalePublicationClaims) assert.doesNotMatch(availability, staleClaim, `SOURCE_AVAILABILITY.md contains stale publication claim: ${staleClaim}`);
}

export async function auditLicensePackage() {

for (const path of [
  'ATTCHAT-LICENSE.txt', 'THIRD_PARTY_NOTICES.md', 'SOURCE_AVAILABILITY.md', 'RpenProof-MIT.txt',
  'LICENSE', 'LICENSES.chromium.html', 'resources/node/LICENSE',
  'resources/frontend/dictionaries/ejdict-hand/README.md',
  'resources/frontend/dictionaries/ejdict-hand/SOURCE.json',
  'resources/frontend/dictionaries/ejdict-hand/ejdict.json',
  'resources/licenses/react/LICENSE', 'staging-manifest.json',
]) assert.ok((await stat(file(path))).isFile(), `missing ${path}`);

assert.equal(await sha256File(file('AttChat.exe')), expected.executable);
assert.equal(await sha256File(file('ffmpeg.dll')), expected.ffmpeg);
assert.equal(await sha256File(file('LICENSE')), expected.electronLicense);
assert.equal(await sha256File(file('LICENSES.chromium.html')), expected.chromiumNotices);
assert.equal(await sha256File(file('resources/frontend/dictionaries/ejdict-hand/ejdict.json')), expected.dictionary);
assert.equal(await sha256File(sourceZip), expected.sourceZip);

const [attChatLicense, electronLicense, rpenProofLicense, notices, embeddedAvailability, currentAvailability] = await Promise.all([
  readFile(file('ATTCHAT-LICENSE.txt'), 'utf8'), readFile(file('LICENSE'), 'utf8'),
  readFile(file('RpenProof-MIT.txt'), 'utf8'), readFile(file('THIRD_PARTY_NOTICES.md'), 'utf8'),
  readFile(file('SOURCE_AVAILABILITY.md'), 'utf8'),
  readFile(resolve('SOURCE_AVAILABILITY.md'), 'utf8'),
]);
assert.match(attChatLicense, /^MIT License/);
assert.match(electronLicense, /Electron contributors/i);
assert.notEqual(attChatLicense, electronLicense, 'Att-Chat license must not overwrite Electron LICENSE');
assert.equal(rpenProofLicense, await readFile(resolve('licenses/RpenProof-MIT.txt'), 'utf8'));
for (const term of ['Electron', 'Chromium', 'Node.js', 'EJDict-hand', 'RpenProof', 'LGPL', 'MPL', 'Frontend npm dependencies']) assert.match(notices, new RegExp(term, 'i'));
for (const term of ['125a6b94c9b01340d193d6863d60ad8531b690a3b273129837102ac855ea34c9', expected.executable, expected.ffmpeg]) {
  assert.match(embeddedAvailability, new RegExp(term, 'i'));
  assert.match(currentAvailability, new RegExp(term, 'i'));
}
assertPublishedSourceAvailability(currentAvailability);

const packageMetadata = JSON.parse(await readFile(file('resources/app/package.json'), 'utf8'));
assert.equal(packageMetadata.license, 'MIT');

const manifest = JSON.parse(await readFile(file('staging-manifest.json'), 'utf8'));
for (const path of ['ATTCHAT-LICENSE.txt','THIRD_PARTY_NOTICES.md','SOURCE_AVAILABILITY.md','RpenProof-MIT.txt','LICENSE','LICENSES.chromium.html','resources/node/LICENSE']) {
  assert.equal(manifest.files[path], await sha256File(file(path)), `manifest mismatch ${path}`);
}

const listed = spawnSync('tar.exe', ['-tf', sourceZip], { encoding: 'utf8', windowsHide: true });
assert.equal(listed.status, 0, listed.stderr);
for (const path of [
  'source-archives/chromium-2c592105bbcd9490a9894df48d0fe59b2c512651.zip',
  'source-archives/electron-19c601167d4ae75989938416c18ed81eb21c6020.zip',
  'source-archives/ffmpeg-2b68d2babae73714846961fb0ee47e3b3d2e39a9.tar.gz',
  'build-evidence/ffmpeg/chromium/config/Chrome/win/x64/config.h',
  'build-evidence/electron-19c601167d4ae75989938416c18ed81eb21c6020/patches/ffmpeg/link_with_loader_path.patch',
  'build-evidence/chromium-2c592105bbcd9490a9894df48d0fe59b2c512651/third_party/blink/renderer/platform/wtf/text/string_impl.cc',
  'SOURCE_MANIFEST.json', 'BUILDING-WIN-X64.md', 'FFMPEG-REPLACEMENT.md', 'SHA256SUMS.txt',
]) assert.ok(listed.stdout.includes(path), `source kit missing ${path}`);

console.log(JSON.stringify({
  status: 'PASS', distribution, sourceZip,
  hashes: expected,
  note: 'Current source availability records the published v1.0.0 Release and its three exact asset URLs; immutable v1.0.0 package hashes and source/relink evidence verified.',
}, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await auditLicensePackage();
