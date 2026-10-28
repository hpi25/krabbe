import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractBusy, MAX_INSTANCES, type ExtractOptions } from '../src/caldav/ical.ts';

const BERLIN: ExtractOptions = {
  countAllDay: false,
  timezone: 'Europe/Berlin',
  rangeStart: Date.UTC(2026, 0, 1),
  rangeEnd: Date.UTC(2027, 0, 1),
};
const ALL_DAY: ExtractOptions = { ...BERLIN, countAllDay: true };

function cal(...eventLines: string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', ...eventLines, 'END:VCALENDAR'].join('\r\n');
}
function ev(...props: string[]): string {
  return ['BEGIN:VEVENT', ...props, 'END:VEVENT'].join('\r\n');
}

const utc9to10 = [{ start: Date.UTC(2026, 9, 20, 9), end: Date.UTC(2026, 9, 20, 10) }];

test('UTC event', () => {
  const ics = cal(ev('DTSTART:20261020T090000Z', 'DTEND:20261020T100000Z'));
  assert.deepEqual(extractBusy(ics, BERLIN), utc9to10);
});

test('folded lines parse like unfolded ones', () => {
  const ics = cal(ev('DTSTART:2026102\r\n 0T090000Z', 'DTEND:20261020T10\n\t0000Z'));
  assert.deepEqual(extractBusy(ics, BERLIN), utc9to10);
});

test('DURATION', () => {
  const ics = cal(ev('DTSTART:20261020T090000Z', 'DURATION:PT1H30M'));
  assert.deepEqual(extractBusy(ics, BERLIN), [
    { start: Date.UTC(2026, 9, 20, 9), end: Date.UTC(2026, 9, 20, 10, 30) },
  ]);
});

test('TZID', () => {
  const ics = cal(ev('DTSTART;TZID=Europe/Berlin:20261020T110000', 'DTEND;TZID=Europe/Berlin:20261020T120000'));
  assert.deepEqual(extractBusy(ics, BERLIN), utc9to10);
});

test('quoted TZID', () => {
  const ics = cal(ev('DTSTART;TZID="Europe/Berlin":20261020T110000', 'DTEND;TZID="Europe/Berlin":20261020T120000'));
  assert.deepEqual(extractBusy(ics, BERLIN), utc9to10);
});

test('unknown TZID falls back to the poll timezone', () => {
  const ics = cal(
    ev('DTSTART;TZID=W. Europe Standard Time:20261020T110000', 'DTEND;TZID=W. Europe Standard Time:20261020T120000'),
  );
  assert.deepEqual(extractBusy(ics, BERLIN), utc9to10);
});

test('floating time uses the poll timezone', () => {
  const ics = cal(ev('DTSTART:20261020T110000', 'DTEND:20261020T120000'));
  assert.deepEqual(extractBusy(ics, BERLIN), utc9to10);
});

test('floating time in winter uses CET offset', () => {
  const ics = cal(ev('DTSTART:20261201T110000', 'DTEND:20261201T120000'));
  assert.deepEqual(extractBusy(ics, BERLIN), [
    { start: Date.UTC(2026, 11, 1, 10), end: Date.UTC(2026, 11, 1, 11) },
  ]);
});

test('TRANSPARENT and CANCELLED events are ignored', () => {
  const ics = cal(
    ev('DTSTART:20261020T090000Z', 'DTEND:20261020T100000Z', 'TRANSP:TRANSPARENT'),
    ev('DTSTART:20261020T090000Z', 'DTEND:20261020T100000Z', 'STATUS:CANCELLED'),
  );
  assert.deepEqual(extractBusy(ics, BERLIN), []);
});

test('all-day events respect countAllDay', () => {
  const ics = cal(ev('DTSTART;VALUE=DATE:20261020'));
  assert.deepEqual(extractBusy(ics, BERLIN), []);
  assert.deepEqual(extractBusy(ics, ALL_DAY), [
    { start: Date.UTC(2026, 9, 19, 22), end: Date.UTC(2026, 9, 20, 22) },
  ]);
});

test('all-day DTEND is exclusive', () => {
  const ics = cal(ev('DTSTART;VALUE=DATE:20261020', 'DTEND;VALUE=DATE:20261022'));
  assert.deepEqual(extractBusy(ics, ALL_DAY), [
    { start: Date.UTC(2026, 9, 19, 22), end: Date.UTC(2026, 9, 21, 22) },
  ]);
});

test('date-time without DTEND or DURATION is zero-length and dropped', () => {
  const ics = cal(ev('DTSTART:20261020T090000Z'));
  assert.deepEqual(extractBusy(ics, BERLIN), []);
});

test('event inside the spring-forward gap collapses and is dropped', () => {
  const ics = cal(ev('DTSTART;TZID=Europe/Berlin:20260329T023000', 'DTEND;TZID=Europe/Berlin:20260329T033000'));
  assert.deepEqual(extractBusy(ics, BERLIN), []);
});

test('multiple VEVENTs', () => {
  const ics = cal(
    ev('DTSTART:20261020T090000Z', 'DTEND:20261020T100000Z'),
    ev('DTSTART:20261021T090000Z', 'DTEND:20261021T100000Z'),
  );
  assert.deepEqual(extractBusy(ics, BERLIN), [
    ...utc9to10,
    { start: Date.UTC(2026, 9, 21, 9), end: Date.UTC(2026, 9, 21, 10) },
  ]);
});

test('VTIMEZONE and VALARM blocks are ignored', () => {
  const tz = [
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Berlin',
    'BEGIN:STANDARD',
    'DTSTART:19701025T030000',
    'END:STANDARD',
    'END:VTIMEZONE',
  ].join('\r\n');
  const ics = cal(
    tz,
    ev('DTSTART:20261020T090000Z', 'DTEND:20261020T100000Z', 'BEGIN:VALARM', 'DTSTART:20200101T000000Z', 'TRIGGER:-PT15M', 'END:VALARM'),
  );
  assert.deepEqual(extractBusy(ics, BERLIN), utc9to10);
});

// Recurrence expansion. October 2026: DST ends on Sunday the 25th in Berlin.

const OCT: ExtractOptions = { ...BERLIN, rangeStart: Date.UTC(2026, 9, 1), rangeEnd: Date.UTC(2026, 10, 1) };
const at = (d: number, h: number, mi = 0) => Date.UTC(2026, 9, d, h, mi);
const hour = (d: number, h: number) => ({ start: at(d, h), end: at(d, h + 1) });

test('weekly event with COUNT', () => {
  const ics = cal(ev('UID:w', 'DTSTART:20261005T090000Z', 'DTEND:20261005T100000Z', 'RRULE:FREQ=WEEKLY;COUNT=3'));
  assert.deepEqual(extractBusy(ics, OCT), [hour(5, 9), hour(12, 9), hour(19, 9)]);
});

test('weekly event with a UTC UNTIL keeps the instance at UNTIL', () => {
  // 10:00 Berlin is 08:00Z; ical.js alone would compare 10:00 wall clock to 08:00Z and drop the 19th.
  const ics = cal(
    ev(
      'UID:w',
      'DTSTART;TZID=Europe/Berlin:20261005T100000',
      'DTEND;TZID=Europe/Berlin:20261005T110000',
      'RRULE:FREQ=WEEKLY;UNTIL=20261019T080000Z',
    ),
  );
  assert.deepEqual(extractBusy(ics, OCT), [hour(5, 8), hour(12, 8), hour(19, 8)]);
});

test('weekly event with no end stops at the range end', () => {
  const ics = cal(ev('UID:w', 'DTSTART:20200106T090000Z', 'DTEND:20200106T100000Z', 'RRULE:FREQ=WEEKLY;BYDAY=MO,TH'));
  assert.deepEqual(extractBusy(ics, { ...OCT, rangeStart: at(12, 0), rangeEnd: at(19, 0) }), [hour(12, 9), hour(15, 9)]);
});

test('EXDATE removes an instance, RDATE adds one', () => {
  const ics = cal(
    ev(
      'UID:w',
      'DTSTART;TZID=Europe/Berlin:20261005T110000',
      'DTEND;TZID=Europe/Berlin:20261005T120000',
      'RRULE:FREQ=WEEKLY;COUNT=3',
      'EXDATE;TZID=Europe/Berlin:20261012T110000',
      'RDATE;TZID=Europe/Berlin:20261014T150000,20261015T150000',
      'RDATE;VALUE=PERIOD:20261016T090000Z/PT30M',
    ),
  );
  assert.deepEqual(extractBusy(ics, OCT), [
    hour(5, 9),
    hour(19, 9),
    hour(14, 13),
    hour(15, 13),
    { start: at(16, 9), end: at(16, 9, 30) },
  ]);
});

test('EXDATE in UTC matches an instance in local time', () => {
  const ics = cal(
    ev(
      'UID:w',
      'DTSTART;TZID=Europe/Berlin:20261005T110000',
      'DTEND;TZID=Europe/Berlin:20261005T120000',
      'RRULE:FREQ=WEEKLY;COUNT=2',
      'EXDATE:20261012T090000Z',
    ),
  );
  assert.deepEqual(extractBusy(ics, OCT), [hour(5, 9)]);
});

test('overrides move, cancel and free single instances', () => {
  const ics = cal(
    ev('UID:w', 'DTSTART:20261005T090000Z', 'DTEND:20261005T100000Z', 'RRULE:FREQ=WEEKLY'),
    ev('UID:w', 'RECURRENCE-ID:20261012T090000Z', 'DTSTART:20261013T140000Z', 'DTEND:20261013T150000Z'),
    ev('UID:w', 'RECURRENCE-ID:20261019T090000Z', 'DTSTART:20261019T090000Z', 'DTEND:20261019T100000Z', 'STATUS:CANCELLED'),
    ev('UID:w', 'RECURRENCE-ID:20261026T090000Z', 'DTSTART:20261026T090000Z', 'DTEND:20261026T100000Z', 'TRANSP:TRANSPARENT'),
  );
  assert.deepEqual(extractBusy(ics, OCT), [hour(13, 14), hour(5, 9)]);
});

test('an override moved into the range counts even though its original instance is outside', () => {
  const ics = cal(
    ev('UID:w', 'DTSTART:20261005T090000Z', 'DTEND:20261005T100000Z', 'RRULE:FREQ=WEEKLY;COUNT=3'),
    ev('UID:w', 'RECURRENCE-ID:20261019T090000Z', 'DTSTART:20261008T090000Z', 'DTEND:20261008T100000Z'),
  );
  assert.deepEqual(extractBusy(ics, { ...OCT, rangeStart: at(6, 0), rangeEnd: at(10, 0) }), [hour(8, 9)]);
});

test('overrides of another UID do not touch the series', () => {
  const ics = cal(
    ev('UID:w', 'DTSTART:20261005T090000Z', 'DTEND:20261005T100000Z', 'RRULE:FREQ=WEEKLY;COUNT=2'),
    ev('UID:x', 'RECURRENCE-ID:20261012T090000Z', 'DTSTART:20261012T090000Z', 'DTEND:20261012T100000Z', 'STATUS:CANCELLED'),
  );
  assert.deepEqual(extractBusy(ics, OCT), [hour(5, 9), hour(12, 9)]);
});

test('weekly Berlin meeting keeps its local time across the end of DST', () => {
  const ics = cal(
    ev(
      'UID:w',
      'DTSTART;TZID=Europe/Berlin:20261019T100000',
      'DTEND;TZID=Europe/Berlin:20261019T110000',
      'RRULE:FREQ=WEEKLY;COUNT=2',
    ),
  );
  // 10:00 CEST is 08:00Z, 10:00 CET is 09:00Z.
  assert.deepEqual(extractBusy(ics, OCT), [hour(19, 8), hour(26, 9)]);
});

test('recurring all-day event respects countAllDay and keeps its length in days', () => {
  const ics = cal(
    ev('UID:w', 'DTSTART;VALUE=DATE:20261024', 'DTEND;VALUE=DATE:20261026', 'RRULE:FREQ=WEEKLY;COUNT=2'),
  );
  assert.deepEqual(extractBusy(ics, OCT), []);
  // Both instances are two local days; the first one spans the 25-hour DST day.
  assert.deepEqual(extractBusy(ics, { ...OCT, countAllDay: true }), [
    { start: at(23, 22), end: at(25, 23) },
    { start: at(30, 23), end: Date.UTC(2026, 10, 1, 23) },
  ]);
});

test('instances outside the range are dropped, one overlapping the edge is kept', () => {
  const ics = cal(ev('UID:w', 'DTSTART:20261001T230000Z', 'DTEND:20261002T010000Z', 'RRULE:FREQ=DAILY;COUNT=5'));
  assert.deepEqual(extractBusy(ics, { ...OCT, rangeStart: at(3, 0), rangeEnd: at(4, 0) }), [
    { start: at(2, 23), end: at(3, 1) },
    { start: at(3, 23), end: at(4, 1) },
  ]);
});

test('non-recurring events outside the range are dropped', () => {
  const ics = cal(ev('DTSTART:20261020T090000Z', 'DTEND:20261020T100000Z'));
  assert.deepEqual(extractBusy(ics, { ...OCT, rangeStart: at(21, 0) }), []);
});

test('stats count instances in range before the busy filters', () => {
  const stats = { instances: 0, truncated: false };
  const ics = cal(
    ev('UID:w', 'DTSTART:20261005T090000Z', 'DTEND:20261005T100000Z', 'RRULE:FREQ=WEEKLY;COUNT=10'),
    ev('UID:w', 'RECURRENCE-ID:20261012T090000Z', 'DTSTART:20261012T090000Z', 'DTEND:20261012T100000Z', 'STATUS:CANCELLED'),
    ev('UID:t', 'DTSTART:20261007T090000Z', 'DTEND:20261007T100000Z', 'TRANSP:TRANSPARENT'),
  );
  const busy = extractBusy(ics, { ...OCT, stats });
  // Mondays 5, 12 (cancelled), 19, 26 plus the transparent event; 2 Nov is out of range.
  assert.deepEqual(stats, { instances: 5, truncated: false });
  assert.equal(busy.length, 3);
});

test('a rule that would generate too many instances is cut off and flagged', () => {
  const stats = { instances: 0, truncated: false };
  const ics = cal(ev('UID:w', 'DTSTART:20200101T000000Z', 'DURATION:PT1S', 'RRULE:FREQ=SECONDLY'));
  extractBusy(ics, { ...OCT, stats });
  assert.equal(stats.truncated, true);
  assert.equal(stats.instances, 0);
  assert.ok(MAX_INSTANCES > 365 * 30, 'a daily event from 30 years ago still fits');
});

test('an unparseable RRULE keeps the first occurrence', () => {
  const ics = cal(ev('UID:w', 'DTSTART:20261020T090000Z', 'DTEND:20261020T100000Z', 'RRULE:FREQ=FORTNIGHTLY'));
  assert.deepEqual(extractBusy(ics, BERLIN), utc9to10);
});
