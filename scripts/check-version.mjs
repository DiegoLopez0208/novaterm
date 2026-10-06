import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const json = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const version = json('package.json').version;
assert.match(version, /^\d+\.\d+\.\d+$/);
assert.equal(json('package-lock.json').version, version);
assert.equal(json('package-lock.json').packages[''].version, version);
assert.equal(json('src-tauri/tauri.conf.json').version, version);
assert.equal(json('packages/plugin-sdk/package.json').version, version);
assert.equal(json('packages/launcher/package.json').version, version);
const cargo = readFileSync(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8');
assert.equal(cargo.match(/\[package\][\s\S]*?^version = "([^"]+)"/m)?.[1], version);
const lock = readFileSync(new URL('../src-tauri/Cargo.lock', import.meta.url), 'utf8');
assert.equal(lock.match(/name = "app"\r?\nversion = "([^"]+)"/)?.[1], version);
if (process.argv[2]) assert.equal(process.argv[2], `v${version}`, 'Release tag must match application version');
console.log(`Application versions match: ${version}`);
