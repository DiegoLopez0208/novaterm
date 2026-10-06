import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const version = process.argv[2];
assert.match(version ?? '', /^\d+\.\d+\.\d+$/);
for (const path of ['package.json', 'package-lock.json', 'src-tauri/tauri.conf.json', 'packages/plugin-sdk/package.json', 'packages/launcher/package.json']) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  data.version = version;
  if (path === 'package-lock.json') data.packages[''].version = version;
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}
for (const [path, pattern] of [
  ['src-tauri/Cargo.toml', /(^\[package\][\s\S]*?^version = ")[^"]+/m],
  ['src-tauri/Cargo.lock', /(name = "app"\r?\nversion = ")[^"]+/],
]) writeFileSync(path, readFileSync(path, 'utf8').replace(pattern, `$1${version}`));
