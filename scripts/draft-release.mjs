import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const tag = process.argv[2];
execFileSync(process.execPath, ['scripts/check-version.mjs', tag ?? 'missing-tag'], { stdio: 'inherit' });
const root = resolve('src-tauri/target/release/bundle');
const files = ['nsis', 'msi'].flatMap((format) => readdirSync(join(root, format))
  .filter((file) => file.endsWith(format === 'nsis' ? '-setup.exe' : '.msi'))
  .map((file) => join(root, format, file)));
if (!files.some((file) => file.endsWith('.msi')) || !files.some((file) => file.endsWith('-setup.exe'))) {
  throw new Error('Both NSIS and MSI installers are required');
}
if (new Set(files.map((file) => basename(file))).size !== files.length) throw new Error('Duplicate artifact names');
const sums = files.map((file) => `${createHash('sha256').update(readFileSync(file)).digest('hex')}  ${basename(file)}`).join('\n') + '\n';
const checksumFile = join(root, 'SHA256SUMS.txt');
writeFileSync(checksumFile, sums);
execFileSync('gh', ['release', 'create', tag, ...files, checksumFile, '--verify-tag', '--draft',
  '--title', `NovaTerm ${tag}`, '--notes-file', 'docs/RELEASE-NOTES.md'], { stdio: 'inherit' });
