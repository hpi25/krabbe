import { test } from 'node:test';
import assert from 'node:assert/strict';
import { originPattern } from '../src/storage.ts';

test('originPattern drops the port, since Firefox match patterns with a port never match', () => {
  assert.equal(originPattern('http://localhost:1234/create'), 'http://localhost/*');
  assert.equal(originPattern('https://krabbe.hpi.church/abc'), 'https://krabbe.hpi.church/*');
});

test('originPattern rejects non-http(s) urls', () => {
  assert.throws(() => originPattern('ftp://x'));
});
