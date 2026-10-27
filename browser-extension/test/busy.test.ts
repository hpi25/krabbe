import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CalDavError } from '../src/caldav/caldav.ts';
import { errorCode, fetchBusy, mergeIntervals, type FetchBusyDeps } from '../src/background/busy.ts';
import { defaultSettings, type Settings } from '../src/storage.ts';

const settings: Settings = {
  ...defaultSettings(),
  defaults: { countAllDay: true },
  accounts: [
    {
      id: 'a', label: 'Work', serverUrl: 'https://cal.example/', username: 'u', password: 'p',
      calendars: [
        { id: 'inherit', url: 'https://cal.example/1/', name: 'One', enabled: true, allDay: 'inherit' },
        { id: 'ignore', url: 'https://cal.example/2/', name: 'Two', enabled: true, allDay: 'ignore' },
      ],
    },
  ],
};
const range = { timeStart: '2026-10-20T00:00:00Z', timeEnd: '2026-10-21T00:00:00Z', timezone: 'Europe/Berlin' };
const T0 = Date.parse(range.timeStart);
const H = 3_600_000;

test('passes the resolved all-day setting per calendar and returns merged, clamped {start,end} only', async () => {
  const seen: Record<string, boolean> = {};
  const deps: FetchBusyDeps = {
    fetchCalendarData: async (_creds, url) => [`BEGIN:VEVENT\r\nSUMMARY:${url}\r\nEND:VEVENT`],
    extractBusy: (ics, opts) => {
      seen[ics] = opts.countAllDay;
      return ics.includes('/1/')
        ? [Object.assign({ start: T0 - H, end: T0 + 2 * H }, { summary: 'Dentist' })]
        : [{ start: T0 + H, end: T0 + 3 * H }];
    },
  };
  const r = await fetchBusy(settings, { ...range, calendarIds: ['inherit', 'ignore'] }, deps);
  assert.ok(r.ok);
  assert.deepEqual(Object.values(seen).sort(), [false, true]);
  assert.deepEqual(r.data.busy, [{ start: T0, end: T0 + 3 * H }]);
  for (const b of r.data.busy) assert.deepEqual(Object.keys(b).sort(), ['end', 'start']);
  assert.deepEqual(r.data.errors, []);
  assert.deepEqual(r.data.stats.map((s) => [s.calendarId, s.events]).sort(), [['ignore', 1], ['inherit', 1]]);
});

test('failing and unknown calendars become error codes, others still count', async () => {
  const deps: FetchBusyDeps = {
    fetchCalendarData: async (_c, url) => {
      if (url.includes('/2/')) throw new CalDavError('REPORT https://cal.example/2/ returned HTTP 401', 'http', 401);
      return ['x'];
    },
    extractBusy: () => [{ start: T0, end: T0 + H }],
  };
  const r = await fetchBusy(settings, { ...range, calendarIds: ['inherit', 'ignore', 'nope'] }, deps);
  assert.ok(r.ok);
  assert.deepEqual(r.data.busy, [{ start: T0, end: T0 + H }]);
  assert.deepEqual(
    r.data.errors.sort((a, b) => a.calendarId.localeCompare(b.calendarId)),
    [{ calendarId: 'ignore', code: 'auth' }, { calendarId: 'nope', code: 'not-found' }],
  );
});

test('rejects backwards, NaN and over-long ranges', async () => {
  const deps: FetchBusyDeps = { fetchCalendarData: async () => assert.fail('no fetch'), extractBusy: () => [] };
  for (const [timeStart, timeEnd] of [['2026-10-21T00:00:00Z', '2026-10-20T00:00:00Z'], ['x', 'y'], ['2020-01-01T00:00:00Z', '2026-01-01T00:00:00Z']]) {
    assert.deepEqual(await fetchBusy(settings, { calendarIds: ['inherit'], timeStart: timeStart!, timeEnd: timeEnd!, timezone: 'UTC' }, deps), {
      ok: false,
      error: 'invalid-range',
    });
  }
});

test('mergeIntervals merges overlaps and touching intervals, drops empty ones', () => {
  assert.deepEqual(
    mergeIntervals([{ start: 5, end: 7 }, { start: 1, end: 3 }, { start: 3, end: 4 }, { start: 8, end: 8 }, { start: 6, end: 20 }], 0, 10),
    [{ start: 1, end: 4 }, { start: 5, end: 10 }],
  );
});

test('errorCode maps CalDAV failures to coarse codes', () => {
  assert.equal(errorCode(new CalDavError('x', 'http', 403)), 'auth');
  assert.equal(errorCode(new CalDavError('x', 'http', 404)), 'not-found');
  assert.equal(errorCode(new CalDavError('x', 'http', 500)), 'server');
  assert.equal(errorCode(new CalDavError('x', 'timeout')), 'timeout');
  assert.equal(errorCode(new CalDavError('x', 'network')), 'network');
  assert.equal(errorCode(new CalDavError('x', 'redirect')), 'server');
  assert.equal(errorCode(new Error('x')), 'unknown');
});
