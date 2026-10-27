import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractBusy } from '../src/caldav/ical.ts';

const BERLIN = { countAllDay: false, timezone: 'Europe/Berlin' };

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
  assert.deepEqual(extractBusy(ics, { countAllDay: false, timezone: 'Europe/Berlin' }), []);
  assert.deepEqual(extractBusy(ics, { countAllDay: true, timezone: 'Europe/Berlin' }), [
    { start: Date.UTC(2026, 9, 19, 22), end: Date.UTC(2026, 9, 20, 22) },
  ]);
});

test('all-day DTEND is exclusive', () => {
  const ics = cal(ev('DTSTART;VALUE=DATE:20261020', 'DTEND;VALUE=DATE:20261022'));
  assert.deepEqual(extractBusy(ics, { countAllDay: true, timezone: 'Europe/Berlin' }), [
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

test('unexpanded RRULE master yields only the first occurrence', () => {
  const ics = cal(ev('DTSTART:20261020T090000Z', 'DTEND:20261020T100000Z', 'RRULE:FREQ=DAILY;COUNT=5'));
  assert.deepEqual(extractBusy(ics, BERLIN), utc9to10);
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
