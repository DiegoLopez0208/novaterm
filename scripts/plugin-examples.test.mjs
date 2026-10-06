import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatJson } from '../examples/plugins/json-tools/index.js';
import { convertTimestamp } from '../examples/plugins/timestamp-tools/index.js';
import { filterOutput } from '../examples/plugins/output-inspector/index.js';
import { prepareSnippet } from '../examples/plugins/command-snippets/index.js';

test('JSON formatting preserves strings, validates syntax and bounds input', () => {
  assert.equal(formatJson('{"text":"<script>雪</script>","n":1}', true), '{"text":"<script>雪</script>","n":1}');
  assert.equal(formatJson('[1,2]'), '[\n  1,\n  2\n]');
  assert.throws(() => formatJson('{nope}'));
  assert.throws(() => formatJson(' '.repeat(200001)));
});
test('timestamp units are explicit and ISO input requires a timezone', () => {
  assert.match(convertTimestamp('0', 'seconds'), /UTC: 1970-01-01T00:00:00.000Z/);
  assert.match(convertTimestamp('1000', 'milliseconds'), /Unix seconds: 1\n/);
  assert.match(convertTimestamp('2026-10-06T15:00:00+03:00', 'iso'), /UTC: 2026-10-06T12:00:00.000Z/);
  for (const text of ['', 'abc', '1e30']) assert.throws(() => convertTimestamp(text, 'seconds'));
  assert.throws(() => convertTimestamp('2026-10-06T12:00:00', 'iso'));
});
test('output filtering treats search as literal text rather than a regex', () => {
  assert.equal(filterOutput('INFO start\nERROR [.*]\nerror exit', 'ERROR'), 'ERROR [.*]\nerror exit');
  assert.equal(filterOutput('INFO start\nERROR [.*]', '[.*]'), 'ERROR [.*]');
  assert.equal(filterOutput('a\nb', ''), 'a\nb');
});
test('snippets cannot inject Enter, terminal escapes or multiline paste', () => {
  assert.equal(prepareSnippet(' git status --short '), 'git status --short');
  for (const text of ['', 'a'.repeat(4001), 'git status\rwhoami', 'git status\nwhoami', '\u001b[200~whoami', 'a\u0085b', 'a\u2028b']) {
    assert.throws(() => prepareSnippet(text));
  }
  assert.equal(prepareSnippet('echo 雪'), 'echo 雪');
});
