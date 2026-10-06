import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const tag = process.argv[2];
execFileSync(process.execPath, ['scripts/check-version.mjs', tag ?? 'missing-tag'], { stdio: 'inherit' });
const root = resolve('src-tauri/target/release/bundle');
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const files = ['nsis', 'msi'].flatMap((format) => readdirSync(join(root, format))
  .filter((file) => file.includes(`_${version}_`) && file.endsWith(format === 'nsis' ? '-setup.exe' : '.msi'))
  .map((file) => join(root, format, file)));
if (!files.some((file) => file.endsWith('.msi')) || !files.some((file) => file.endsWith('-setup.exe'))) {
  throw new Error('Both NSIS and MSI installers are required');
}
execFileSync(process.execPath, ['scripts/prepare-launcher.mjs'], { stdio: 'inherit' });
execFileSync('powershell.exe', ['-NoProfile', '-File', 'scripts/prepare-portable.ps1'], { stdio: 'inherit' });
const packed = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-File', 'scripts/pack-launcher.ps1', '-OutputDirectory', root], { encoding: 'utf8' }));
files.push(join(root, packed[0].filename), join(root, `novaterm_${version}_windows_x64.zip`));
if (new Set(files.map((file) => basename(file))).size !== files.length) throw new Error('Duplicate artifact names');
const sums = files.map((file) => `${createHash('sha256').update(readFileSync(file)).digest('hex')}  ${basename(file)}`).join('\n') + '\n';
const checksumFile = join(root, 'SHA256SUMS.txt');
writeFileSync(checksumFile, sums);
if (process.argv.includes('--prepare-only')) {
  console.log(`Prepared ${files.length} installers and ${checksumFile}`);
  process.exit(0);
}
try {
  const existing = JSON.parse(execFileSync('gh', ['release', 'view', tag, '--json', 'isDraft'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  if (!existing.isDraft) {
    console.log(`${tag} is already public; its artifacts were left unchanged.`);
    process.exit(0);
  }
  throw new Error(`A draft for ${tag} already exists; inspect it before replacing artifacts.`);
} catch (error) {
  if (!error.status) throw error;
}
execFileSync('gh', ['release', 'create', tag, ...files, checksumFile, '--verify-tag', '--draft',
  '--title', `NovaTerm ${tag}`, '--notes-file', 'docs/RELEASE-NOTES.md'], { stdio: 'inherit' });
