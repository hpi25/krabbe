import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchBusy } from '../src/background/fetchBusy.ts';
import { CalDavError } from '../src/calendar/caldav.ts';
import type { Settings } from '../src/storage.ts';

const settings: Settings = {
  krabbeUrl: 'https://k.example',
  selectedCalendars: [],
  accounts: [
    {
      id: 'a',
      label: 'A',
      serverUrl: 'https://dav.example',
      username: 'u',
      password: 'p',
      calendars: [
        { url: 'https://dav.example/c1/', name: 'c1', countAllDay: true },
        { url: 'https://dav.example/c2/', name: 'c2', countAllDay: false },
      ],
    },
  ],
};
const req = { type: 'fetch-busy' as const, calendarUrls: [] as string[], timeStart: '2026-01-01T00:00:00Z', timeEnd: '2026-01-02T00:00:00Z', timezone: 'UTC' };

test('skips unknown calendars and passes per-calendar countAllDay', async () => {
  const calls: boolean[] = [];
  const res = await fetchBusy(
    settings,
    { ...req, calendarUrls: ['https://dav.example/c1/', 'https://dav.example/c2/', 'https://gone/'] },
    {
      fetchCalendarData: async (_c, url) => [`ics:${url}`],
      extractBusy: (ics, opts) => {
        calls.push(opts.countAllDay);
        assert.equal(opts.timezone, 'UTC');
        return [{ start: ics.length, end: ics.length + 1 }];
      },
    },
  );
  assert.deepEqual(calls.sort(), [false, true]);
  assert.equal(res.busy.length, 2);
  assert.deepEqual(res.errors, []);
});

test('one failing calendar yields error entry and keeps the other', async () => {
  const res = await fetchBusy(
    settings,
    { ...req, calendarUrls: ['https://dav.example/c1/', 'https://dav.example/c2/'] },
    {
      fetchCalendarData: async (_c, url) => {
        if (url.endsWith('c1/')) throw new Error('boom');
        return ['x'];
      },
      extractBusy: () => [{ start: 1, end: 2 }],
    },
  );
  assert.deepEqual(res.busy, [{ start: 1, end: 2 }]);
  assert.deepEqual(res.errors, [{ calendarUrl: 'https://dav.example/c1/', message: 'boom' }]);
});

test('401 reports authentication failure', async () => {
  const res = await fetchBusy(settings, { ...req, calendarUrls: ['https://dav.example/c1/'] }, {
    fetchCalendarData: async () => {
      throw new CalDavError('HTTP 401', 401);
    },
    extractBusy: () => [],
  });
  assert.match(res.errors[0]!.message, /authentication failed/i);
});

test('rejects invalid, inverted and oversized ranges without fetching', async () => {
  const bad = [
    { timeStart: 'nope', timeEnd: '2026-01-02T00:00:00Z' },
    { timeStart: '2026-01-02T00:00:00Z', timeEnd: '2026-01-01T00:00:00Z' },
    { timeStart: '2026-01-01T00:00:00Z', timeEnd: '2026-01-01T00:00:00Z' },
    { timeStart: '2026-01-01T00:00:00Z', timeEnd: '2027-06-01T00:00:00Z' },
  ];
  for (const range of bad) {
    let called = false;
    const res = await fetchBusy(
      settings,
      { ...req, ...range, calendarUrls: ['https://dav.example/c1/'] },
      {
        fetchCalendarData: async () => {
          called = true;
          return [];
        },
        extractBusy: () => [],
      },
    );
    assert.deepEqual(res, { busy: [], errors: [{ calendarUrl: '', message: 'Invalid time range' }] });
    assert.equal(called, false);
  }
});
