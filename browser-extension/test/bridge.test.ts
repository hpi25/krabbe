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

test('summarize reports the searched range, per-calendar counts, totals and removed slots', () => {
  const s = summarize({
    ...base,
    stats: [
      { name: 'Work', events: 3, intervals: 2 },
      { name: 'Home', events: 1, intervals: 0 },
    ],
    errors: [],
    removed: 2,
  });
  assert.deepEqual(s, {
    headline: 'Removed 2 slots',
    range: '20 Oct 2026, 09:00 – 22 Oct 2026, 20:00',
    calendars: [
      { name: 'Work', events: 3, intervals: 2 },
      { name: 'Home', events: 1, intervals: 0 },
    ],
    total: { events: 4, intervals: 2 },
    hint: undefined,
    errors: [],
  });
});

test('summarize explains zero removals when busy intervals were found', () => {
  const s = summarize({ ...base, stats: [{ name: 'Work', events: 1, intervals: 1 }], errors: [], removed: 0 });
  assert.equal(s.headline, 'Removed 0 slots');
  assert.equal(s.hint, 'Only slots you have already filled in are cleared.');
});

test('summarize singularises one slot and gives no hint when nothing was busy', () => {
  const s = summarize({ ...base, stats: [{ name: 'Work', events: 0, intervals: 0 }], errors: [], removed: 1 });
  assert.equal(s.headline, 'Removed 1 slot');
  assert.equal(s.hint, undefined);
});

test('summarize reports an unconfirmed page and passes errors through', () => {
  const s = summarize({ ...base, stats: [], errors: ['Work: boom'], removed: null });
  assert.equal(s.headline, "Page didn't confirm");
  assert.deepEqual(s.total, { events: 0, intervals: 0 });
  assert.deepEqual(s.errors, ['Work: boom']);
});
