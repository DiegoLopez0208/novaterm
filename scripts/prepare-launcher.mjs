import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = resolve('packages/launcher');
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const launcher = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
if (launcher.version !== version) throw new Error('Launcher/application version mismatch');
const binary = readFileSync('src-tauri/target/release/app.exe');
mkdirSync(resolve(root, 'native'), { recursive: true });
mkdirSync(resolve(root, 'licenses'), { recursive: true });
writeFileSync(resolve(root, 'native/NovaTerm.exe'), binary);
writeFileSync(resolve(root, 'native/manifest.json'), JSON.stringify({
  version, platform: 'win32-x64', sha256: createHash('sha256').update(binary).digest('hex'),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
}, null, 2) + '\n');
copyFileSync('LICENSE', resolve(root, 'LICENSE'));
for (const name of ['LICENSE-NovaMono.md', 'LICENSE-SymbolsNerdFont.txt']) {
  copyFileSync(`src/assets/fonts/${name}`, resolve(root, 'licenses', name));
}
console.log(`Prepared bundled Windows x64 launcher ${version}`);
