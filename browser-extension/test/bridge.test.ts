import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReady, parseApplied, summarize } from '../src/content/bridge.ts';
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

const base = {
  timeStart: '2026-10-20T07:00:00Z',
  timeEnd: '2026-10-22T18:00:00Z',
  timezone: 'Europe/Berlin',
  locale: 'en-GB',
};

test('summarize lists the searched range, per-calendar counts, totals and removed slots', () => {
  const text = summarize({
    ...base,
    stats: [
      { name: 'Work', events: 3, intervals: 2 },
      { name: 'Home', events: 1, intervals: 0 },
    ],
    errors: [],
    removed: 2,
  });
  assert.deepEqual(text.split('\n'), [
    'Searched 20 Oct 2026, 09:00 – 22 Oct 2026, 20:00',
    'Work: 3 events → 2 busy',
    'Home: 1 event → 0 busy',
    'Total: 4 events, 2 busy intervals',
    'Removed 2 slots',
  ]);
});

test('summarize explains zero removals when busy intervals were found', () => {
  const lines = summarize({ ...base, stats: [{ name: 'Work', events: 1, intervals: 1 }], errors: [], removed: 0 }).split('\n');
  assert.equal(lines.at(-2), 'Removed 0 slots');
  assert.equal(lines.at(-1), 'Only slots you have already filled in are cleared.');
});

test('summarize reports an unconfirmed page and appends errors', () => {
  const lines = summarize({ ...base, stats: [], errors: ['Work: boom'], removed: null }).split('\n');
  assert.deepEqual(lines.slice(1), ['Total: 0 events, 0 busy intervals', "Page didn't confirm", 'Work: boom']);
});
