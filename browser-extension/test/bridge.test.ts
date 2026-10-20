import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReady, parseApplied, pickerGroups } from '../src/content/bridge.ts';
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

test('pickerGroups groups by account, checks selected, ignores stale', () => {
  const settings: Settings = {
    krabbeUrl: 'https://k',
    selectedCalendars: ['u1', 'gone'],
    accounts: [
      { id: 'a', label: 'Work', serverUrl: 's', username: 'u', password: 'p', calendars: [
        { url: 'u1', name: 'Main', color: '#f00', countAllDay: false },
        { url: 'u2', name: 'Other', countAllDay: false },
      ] },
      { id: 'b', label: 'Home', serverUrl: 's', username: 'u', password: 'p', calendars: [] },
    ],
  };
  assert.deepEqual(pickerGroups(settings), [
    { label: 'Work', calendars: [
      { url: 'u1', name: 'Main', color: '#f00', checked: true },
      { url: 'u2', name: 'Other', color: undefined, checked: false },
    ] },
    { label: 'Home', calendars: [] },
  ]);
});
