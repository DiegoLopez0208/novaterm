#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const args = process.argv.slice(2);

try {
  if (args.length === 1 && ['--version', '-v'].includes(args[0])) {
    console.log(version);
  } else if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log(`NovaTerm ${version} — Windows x64 desktop terminal

Usage: novaterm [directory]
       novaterm --version
       novaterm --doctor

Launches the bundled native application. No compiler or download script needed.
Requires Windows x64 and Microsoft Edge WebView2 Runtime.
Configuration: ~/.novaterm/config.toml or %APPDATA%/novaterm/config.toml.
For an installed Start menu shortcut, use the GitHub Windows setup installer.`);
  } else {
    if (process.platform !== 'win32' || process.arch !== 'x64') {
      throw new Error('This release supports Windows x64 only. See the GitHub releases for supported platforms.');
    }
    const executable = resolve(root, 'native', 'NovaTerm.exe');
    if (args.length === 1 && args[0] === '--doctor') {
      const manifest = JSON.parse(readFileSync(resolve(root, 'native', 'manifest.json'), 'utf8'));
      const digest = createHash('sha256').update(readFileSync(executable)).digest('hex');
      if (manifest.version !== version || manifest.sha256 !== digest) throw new Error('Bundled executable integrity check failed. Reinstall this package.');
      console.log(`NovaTerm ${version}: Windows x64 executable verified (${digest}).`);
      console.log('WebView2 and interactive shell behavior are checked when the application opens.');
    } else {
      if (args.length > 1 || args[0]?.startsWith('-')) throw new Error('Usage: novaterm [directory]. Use --help for options.');
      const cwd = resolve(args[0] ?? process.cwd());
      if (!statSync(cwd).isDirectory()) throw new Error(`Not a directory: ${cwd}`);
      if (!statSync(executable).isFile()) throw new Error('Bundled executable is missing. Reinstall this package.');
      const child = spawn(executable, [], { cwd, detached: true, stdio: 'ignore', windowsHide: false });
      child.once('error', (error) => { console.error(`NovaTerm: ${error.message}`); process.exitCode = 1; });
      child.once('spawn', () => { child.unref(); console.log(`NovaTerm opened in ${cwd}`); });
    }
  }
} catch (error) {
  console.error(`NovaTerm: ${error.message}`);
  process.exitCode = 1;
}
