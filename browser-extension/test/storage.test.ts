import { test } from 'node:test';
import assert from 'node:assert/strict';
import { originPattern } from '../src/storage.ts';

test('originPattern keeps scheme and host:port', () => {
  assert.equal(originPattern('http://localhost:1234/create'), 'http://localhost:1234/*');
});

test('originPattern rejects non-http(s) urls', () => {
  assert.throws(() => originPattern('ftp://x'));
});
