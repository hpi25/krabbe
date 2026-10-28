import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countsAllDay, defaultSettings, DEFAULT_INSTANCE, mergeDiscovered, migrate, normalizeInstance, originPattern } from '../src/storage.ts';

test('empty storage yields defaults', () => {
  assert.deepEqual(migrate({}), defaultSettings());
});

test('v2 settings migrate: instance kept next to default, selection becomes enabled, countAllDay becomes override', () => {
  const s = migrate({
    krabbeUrl: 'https://krabbe.example.org/some/path',
    selectedCalendars: ['https://c/a/'],
    accounts: [
      {
        id: 'acc', label: 'Work', serverUrl: 'https://c/', username: 'u', password: 'p',
        calendars: [
          { url: 'https://c/a/', name: 'A', color: '#f00', countAllDay: true },
          { url: 'https://c/b/', name: 'B', countAllDay: false },
        ],
      },
    ],
  });
  assert.deepEqual(s.instances, [DEFAULT_INSTANCE, 'https://krabbe.example.org']);
  assert.equal(s.defaults.countAllDay, false);
  const [a, b] = s.accounts[0]!.calendars;
  assert.equal(typeof a!.id, 'string');
  assert.notEqual(a!.id, b!.id);
  assert.deepEqual({ ...a, id: '' }, { id: '', url: 'https://c/a/', name: 'A', color: '#f00', enabled: true, allDay: 'count' });
  assert.deepEqual({ ...b, id: '' }, { id: '', url: 'https://c/b/', name: 'B', enabled: false, allDay: 'inherit' });
});

test('v3 settings round-trip unchanged', () => {
  const v3 = {
    ...defaultSettings(),
    instances: ['https://krabbe.hpi.church', 'http://localhost:3000'],
    defaults: { countAllDay: true },
    accounts: [{ id: 'a', label: 'L', serverUrl: 's', username: 'u', password: 'p', calendars: [
      { id: 'c', url: 'u', name: 'n', enabled: false, allDay: 'ignore' as const },
    ] }],
  };
  assert.deepEqual(migrate(structuredClone(v3)), v3);
});

test('garbage is dropped, not thrown', () => {
  const s = migrate({ version: 3, instances: ['javascript:alert(1)', 42, 'nope'], accounts: [null, 'x', { calendars: 'y' }] });
  assert.deepEqual(s.instances, []);
  assert.equal(s.accounts.length, 1);
  assert.deepEqual(s.accounts[0]!.calendars, []);
});

test('normalizeInstance keeps the port, drops path, rejects other schemes', () => {
  assert.equal(normalizeInstance(' https://Krabbe.Example:8443/x?y '), 'https://krabbe.example:8443');
  assert.throws(() => normalizeInstance('ftp://x'));
});

test('originPattern drops the port', () => {
  assert.equal(originPattern('http://localhost:3000/abc'), 'http://localhost/*');
});

test('countsAllDay: override wins, inherit follows the default', () => {
  const on = { defaults: { countAllDay: true } };
  const off = { defaults: { countAllDay: false } };
  assert.equal(countsAllDay({ allDay: 'inherit' }, on), true);
  assert.equal(countsAllDay({ allDay: 'inherit' }, off), false);
  assert.equal(countsAllDay({ allDay: 'count' }, off), true);
  assert.equal(countsAllDay({ allDay: 'ignore' }, on), false);
});

test('mergeDiscovered keeps ids and prefs, adds new calendars enabled, drops vanished ones', () => {
  const existing = [
    { id: 'keep', url: 'u1', name: 'Old', enabled: false, allDay: 'count' as const },
    { id: 'gone', url: 'u2', name: 'Gone', enabled: true, allDay: 'inherit' as const },
  ];
  const merged = mergeDiscovered(existing, [{ url: 'u1', name: 'Renamed', color: '#0f0' }, { url: 'u3', name: 'New' }]);
  assert.deepEqual(merged[0], { id: 'keep', url: 'u1', name: 'Renamed', color: '#0f0', enabled: false, allDay: 'count' });
  assert.equal(merged[1]!.url, 'u3');
  assert.equal(merged[1]!.enabled, true);
  assert.equal(merged[1]!.allDay, 'inherit');
  assert.equal(merged.length, 2);
});
