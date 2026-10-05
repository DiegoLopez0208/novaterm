import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getNova } from '../index.js';

test('rejects use outside the host and unsupported API versions', () => {
  assert.throws(() => getNova({}), /unavailable/);
  assert.throws(() => getNova({ nova: { apiVersion: 2 } }), /unavailable/);
});
test('returns the host API without wrapping permissions or changing methods', async () => {
  const calls = [];
  const api = {
    apiVersion: 1,
    terminal: { read: async (lines) => { calls.push(lines); return 'output'; }, write() {} },
    ai: { complete() {} }, commands: { trigger() {} },
  };
  assert.equal(getNova({ nova: api }), api);
  assert.equal(await getNova({ nova: api }).terminal.read(12), 'output');
  assert.deepEqual(calls, [12]);
});
