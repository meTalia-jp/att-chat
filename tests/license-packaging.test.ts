import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// @ts-expect-error The executable license audit is intentionally a plain ESM script.
import { assertPublishedSourceAvailability, v100Publication } from '../scripts/audit-license-package.mjs';

test('Att-Chat declares MIT without replacing Electron distribution license', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  const packageLock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  const license = await readFile('LICENSE', 'utf8');
  const staging = await readFile('scripts/stage-electron.mjs', 'utf8');
  assert.equal(packageJson.license, 'MIT');
  assert.equal(packageLock.packages[''].license, 'MIT');
  assert.match(license, /^MIT License/);
  assert.match(staging, /\['LICENSE', 'ATTCHAT-LICENSE\.txt'\]/);
  assert.doesNotMatch(staging, /node_modules\/electron\/dist\/LICENSE[^\n]+ATTCHAT-LICENSE/);
});

test('RpenProof license is preserved verbatim in the formal license directory', async () => {
  const [original, formal] = await Promise.all([
    readFile('experiments/selection-poc/LICENSE-RpenProof.txt', 'utf8'),
    readFile('licenses/RpenProof-MIT.txt', 'utf8'),
  ]);
  assert.equal(formal, original);
});

test('notices cover required native, data, provenance, LGPL and MPL components', async () => {
  const notices = await readFile('THIRD_PARTY_NOTICES.md', 'utf8');
  for (const term of [
    'Electron', 'Chromium', 'Node.js', 'Frontend npm dependencies', 'EJDict-hand',
    'RpenProof-derived Marker code', 'Chromium FFmpeg fork', 'Blink', 'NSPR',
    'Mozilla URL parser', 'Mozilla Windows Cert', 'ISimpleDOM', 'Hunspell', 'Symphonia',
  ]) assert.match(notices, new RegExp(term, 'i'));
  assert.match(notices, /inclusion not fully confirmed/i);
  assert.match(notices, /74bf048fddee2d5bad426f81cc2c10374ae7d8007d7f8550bf42d86c61614e2b/i);
});

test('source availability identifies exact artifacts and the published v1.0.0 assets', async () => {
  const source = await readFile('SOURCE_AVAILABILITY.md', 'utf8');
  for (const value of [
    'Att-Chat-v1.0-runtime-source.zip',
    '19c601167d4ae75989938416c18ed81eb21c6020',
    '2c592105bbcd9490a9894df48d0fe59b2c512651',
    '2b68d2babae73714846961fb0ee47e3b3d2e39a9',
    '49b61a030a520fc36a4b8fa5cce53fb4e935a7bdbbe4b80e9222f598e49cc7fa',
    '7728490eb079c19b17baeff2b6590c976f6a928b3c17923aeb4fcf1f1f31d299',
    '125a6b94c9b01340d193d6863d60ad8531b690a3b273129837102ac855ea34c9',
  ]) assert.match(source, new RegExp(value, 'i'));
  assertPublishedSourceAvailability(source);
  assert.match(source, /successful execution with a modified replacement DLL is \*\*unverified\*\*/i);
});

test('published source availability rejects stale pre-publication claims', async () => {
  const source = await readFile('SOURCE_AVAILABILITY.md', 'utf8');
  for (const staleClaim of [
    'not yet published',
    'still unpublished',
    'pre-publication',
    'may not resolve',
    'まだ公開されていません',
    '未公開',
  ]) {
    assert.throws(
      () => assertPublishedSourceAvailability(`${source}\n${staleClaim}\n`),
      /stale publication claim/,
      staleClaim,
    );
  }
});

test('published source availability rejects a wrong Release tag or asset URL', async () => {
  const source = await readFile('SOURCE_AVAILABILITY.md', 'utf8');
  assert.throws(
    () => assertPublishedSourceAvailability(source.replace(v100Publication.release, v100Publication.release.replace('v1.0.0', 'v1.0.1'))),
    /missing public Release URL|wrong Release tag/,
  );

  const windowsUrl = v100Publication.assets['Att-Chat-v1.0-win-x64.zip'];
  assert.throws(
    () => assertPublishedSourceAvailability(source.replace(windowsUrl, windowsUrl.replace('/v1.0.0/', '/v1.0.1/'))),
    /must use only the v1\.0\.0 URL/,
  );
});

test('published source availability rejects binary and source links from different releases', async () => {
  const source = await readFile('SOURCE_AVAILABILITY.md', 'utf8');
  const sourceUrl = v100Publication.assets['Att-Chat-v1.0-runtime-source.zip'];
  assert.throws(
    () => assertPublishedSourceAvailability(source.replaceAll(sourceUrl, sourceUrl.replace('/v1.0.0/', '/v1.0.1/'))),
    /must use only the v1\.0\.0 URL/,
  );
});

test('source-kit builder fixes complete source archives and relink evidence', async () => {
  const builder = await readFile('scripts/build-license-source-kit.mjs', 'utf8');
  for (const value of [
    'chromium-2c592105bbcd9490a9894df48d0fe59b2c512651.zip',
    'electron-19c601167d4ae75989938416c18ed81eb21c6020.zip',
    'ffmpeg-2b68d2babae73714846961fb0ee47e3b3d2e39a9.tar.gz',
    'chromium/config/Chrome/win/x64/config.h',
    'patches/ffmpeg/link_with_loader_path.patch',
    'third_party/blink/renderer/platform/wtf/text/string_impl.cc',
    'SOURCE_MANIFEST.json', 'SHA256SUMS.txt', 'BUILDING-WIN-X64.md', 'FFMPEG-REPLACEMENT.md',
  ]) assert.ok(builder.includes(value), value);
});
