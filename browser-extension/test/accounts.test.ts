import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeKrabbeUrl, mergeRefreshedCalendars, originStillUsed } from '../src/options/accounts.ts';
import type { Account } from '../src/storage.ts';

test('normalizeKrabbeUrl strips path and trailing slash', () => {
  assert.equal(normalizeKrabbeUrl('https://krabbe.hpi.church/foo/'), 'https://krabbe.hpi.church');
  assert.equal(normalizeKrabbeUrl(' http://localhost:1234/ '), 'http://localhost:1234');
});

test('normalizeKrabbeUrl rejects non-http(s) and garbage', () => {
  assert.throws(() => normalizeKrabbeUrl('ftp://x'));
  assert.throws(() => normalizeKrabbeUrl('not a url'));
});

test('mergeRefreshedCalendars keeps flags, adds new, drops vanished, takes fresh name/color', () => {
  const existing = [
    { url: 'a', name: 'Old A', color: '#111', countAllDay: true },
    { url: 'gone', name: 'Gone', countAllDay: true },
  ];
  const merged = mergeRefreshedCalendars(existing, [
    { url: 'a', name: 'New A', color: '#222' },
    { url: 'b', name: 'B' },
  ]);
  assert.deepEqual(merged, [
    { url: 'a', name: 'New A', color: '#222', countAllDay: true },
    { url: 'b', name: 'B', color: undefined, countAllDay: false },
  ]);
});

const acc = (id: string, serverUrl: string): Account => ({ id, label: id, serverUrl, username: 'u', password: 'p', calendars: [] });

test('originStillUsed checks other accounts sharing the origin', () => {
  const accounts = [acc('1', 'https://dav.example/cal/a'), acc('2', 'https://dav.example/cal/b'), acc('3', 'https://other.example')];
  assert.equal(originStillUsed(accounts, '1'), true);
  assert.equal(originStillUsed(accounts, '3'), false);
  assert.equal(originStillUsed(accounts, 'nope'), false);
});
