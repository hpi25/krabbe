import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReady, parseApplied } from '../src/content/bridge.ts';
import type { Settings } from '../src/storage.ts';

const ready = { source: 'krabbe', type: 'calendar-bridge:ready', timeStart: 'a', timeEnd: 'b', timezone: 'Europe/Berlin' };

test('parseReady accepts valid message', () => {
  assert.deepEqual(parseReady(ready), { timeStart: 'a', timeEnd: 'b', timezone: 'Europe/Berlin' });
});

test('parseReady rejects garbage', () => {
  assert.equal(parseReady(null), null);
  assert.equal(parseReady('x'), null);
  assert.equal(parseReady({ ...ready, source: 'evil' }), null);
  assert.equal(parseReady({ ...ready, type: 'calendar-bridge:applied' }), null);
  assert.equal(parseReady({ ...ready, timeEnd: 5 }), null);
  assert.equal(parseReady({ ...ready, timezone: undefined }), null);
});

test('parseApplied', () => {
  const m = { source: 'krabbe', type: 'calendar-bridge:applied', removed: 3 };
  assert.equal(parseApplied(m), 3);
  assert.equal(parseApplied({ ...m, removed: 0 }), 0);
  assert.equal(parseApplied({ ...m, removed: '3' }), null);
  assert.equal(parseApplied({ ...m, removed: NaN }), null);
  assert.equal(parseApplied({ ...m, source: 'x' }), null);
  assert.equal(parseApplied({ ...m, type: 'calendar-bridge:ready' }), null);
  assert.equal(parseApplied(undefined), null);
});
