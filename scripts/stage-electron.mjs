import { cp, mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nodeVersion = 'v24.19.0';
const nodeDirectory = process.env.ATTCHAT_DIST_NODE_DIR;
const dictionary = process.env.ATTCHAT_DIST_EJDICT;
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Phase 2 staging targets Windows x64');
if (!nodeDirectory || !dictionary) throw new Error('Set ATTCHAT_DIST_NODE_DIR to the extracted official node-v24.19.0-win-x64 directory (including LICENSE), and ATTCHAT_DIST_EJDICT to the approved ejdict.json. See docs/electron-finalization-phase2.md.');
const node = resolve(nodeDirectory, 'node.exe');
const version = spawnSync(node, ['--version'], { encoding: 'utf8', windowsHide: true });
if (version.error) throw version.error;
if (version.status !== 0 || version.stdout.trim() !== nodeVersion) throw new Error(`Bundled Node must be ${nodeVersion}`);
const nodeLicense = await readFile(resolve(nodeDirectory, 'LICENSE'));
if (!nodeLicense.includes('Node.js')) throw new Error('Node distribution LICENSE is required');
const source = JSON.parse(await readFile(resolve(root, 'public/dictionaries/ejdict-hand/SOURCE.json'), 'utf8'));
const dictionaryBytes = await readFile(resolve(dictionary));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
if (sha256(dictionaryBytes) !== source.expected_sha256) throw new Error('EJDict checksum differs from SOURCE.json; review the source manifest first');

// Refuse to merge into stale staging. Every build uses a new, explicit output directory.
const output = resolve(process.env.ATTCHAT_DIST_OUT ?? join(root, 'electron-dist'));
try { await stat(output); throw new Error(`Staging output already exists: ${output}. Choose a new ATTCHAT_DIST_OUT.`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const required of ['dist/index.html','dist-server/server/main.js','node_modules/electron/dist/electron.exe']) await stat(resolve(root, required));
await mkdir(output, { recursive: true });
await cp(resolve(root, 'node_modules/electron/dist'), output, {
  recursive: true, filter: path => !['default_app.asar','electron.exe'].includes(path.split(/[\\/]/).at(-1)),
});
await cp(resolve(root, 'node_modules/electron/dist/electron.exe'), join(output, 'AttChat.exe'));
// Keep Electron's own LICENSE at the distribution root and add Att-Chat's license
// under a distinct name so the two grants cannot be mistaken for one another.
for (const [source, target] of [
  ['LICENSE', 'ATTCHAT-LICENSE.txt'],
  ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
  ['SOURCE_AVAILABILITY.md', 'SOURCE_AVAILABILITY.md'],
  ['licenses/RpenProof-MIT.txt', 'RpenProof-MIT.txt'],
]) await cp(resolve(root, source), join(output, target));
const resources = join(output, 'resources');
await mkdir(join(resources,'node'),{recursive:true});
await cp(node,join(resources,'node/node.exe'));
await writeFile(join(resources,'node/LICENSE'),nodeLicense);
await cp(resolve(root,'dist-server'),join(resources,'backend'),{recursive:true});
await writeFile(join(resources,'backend/package.json'),JSON.stringify({type:'module'}));
await cp(resolve(root,'src/server/storage/migrations'),join(resources,'migrations'),{recursive:true});
// Only production entry assets; no laboratory HTML, public scratch files or proof images.
await mkdir(join(resources,'frontend'),{recursive:true});
const html = await readFile(resolve(root,'dist/index.html'),'utf8');
await writeFile(join(resources,'frontend/index.html'),html);
const copied = new Set();
async function copyAsset(path) {
  if (copied.has(path)) return;
  if (!/^assets\/[A-Za-z0-9_.-]+$/.test(path)) throw new Error(`Unexpected frontend asset: ${path}`);
  copied.add(path);
  const bytes = await readFile(resolve(root,'dist',path));
  await mkdir(dirname(join(resources,'frontend',path)),{recursive:true});
  await writeFile(join(resources,'frontend',path),bytes);
  if (/\.(js|css)$/.test(path)) {
    for (const match of bytes.toString().matchAll(/["'](?:\.\/)?([A-Za-z0-9_.-]+\.(?:js|css))["']/g)) await copyAsset(`assets/${match[1]}`);
  }
}
for (const match of html.matchAll(/(?:src|href)="\/(assets\/[^"?#]+)"/g)) await copyAsset(match[1]);
const dictionaryDirectory = join(resources,'frontend/dictionaries/ejdict-hand');
await mkdir(dictionaryDirectory,{recursive:true});
await writeFile(join(dictionaryDirectory,'ejdict.json'),dictionaryBytes);
for (const filename of ['README.md','SOURCE.json']) await cp(resolve(root,'public/dictionaries/ejdict-hand',filename),join(dictionaryDirectory,filename));
const appDirectory = join(resources,'app');
await mkdir(join(appDirectory,'electron'),{recursive:true});
for (const filename of ['main.mjs','runtime.mjs','lifecycle.mjs','single-instance.mjs','distribution.mjs']) await cp(resolve(root,'electron',filename),join(appDirectory,'electron',filename));
await writeFile(join(appDirectory,'package.json'),JSON.stringify({name:'att-chat',productName:'Att-Chat',version:'1.0.0',license:'MIT',type:'module',main:'electron/main.mjs'},null,2));
// Preserve dependency notices, including licenses for bundled frontend code.
const lock = JSON.parse(await readFile(resolve(root,'package-lock.json'),'utf8'));
for (const path of Object.keys(lock.packages).filter(path=>path.startsWith('node_modules/'))) {
  let names;
  try { names = await readdir(resolve(root,path)); } catch { continue; }
  for (const name of names.filter(name=>/^(license|copying|notice)(\.|$)/i.test(name))) {
    const target = join(resources,'licenses',path.replaceAll('node_modules/',''),name);
    await mkdir(dirname(target),{recursive:true});
    await cp(resolve(root,path,name),target,{recursive:true});
  }
}
const manifest = {platform:'win32-x64',nodeVersion,nodeSha256:sha256(await readFile(node)),dictionarySha256:sha256(dictionaryBytes),semantic:'not bundled; optional and unconfigured',asar:false,files:{}};
async function inventory(directory, prefix='') {
  for (const entry of await readdir(directory,{withFileTypes:true})) {
    const path = prefix+entry.name;
    if(entry.isDirectory()) await inventory(join(directory,entry.name),path+'/');
    else manifest.files[path]=sha256(await readFile(join(directory,entry.name)));
  }
}
await inventory(output);
await writeFile(join(output,'staging-manifest.json'),JSON.stringify(manifest,null,2));
console.log(`Staged Windows application: ${join(output,'AttChat.exe')}`);
