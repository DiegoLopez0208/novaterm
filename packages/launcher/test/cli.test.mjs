import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../bin/novaterm.mjs', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
test('version and help work without launching a native process', () => {
  assert.equal(execFileSync(process.execPath, [cli, '--version'], { encoding: 'utf8' }).trim(), version);
  assert.match(execFileSync(process.execPath, [cli, '--help'], { encoding: 'utf8' }), /Windows x64/);
});
test('invalid options fail rather than starting the desktop application', () => {
  const result = spawnSync(process.execPath, [cli, '--unknown'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:|supports Windows x64/);
});
