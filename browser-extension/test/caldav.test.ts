import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { discoverCalendars, fetchCalendarData, CalDavError } from '../src/caldav/caldav.ts';
import { extractBusy } from '../src/caldav/ical.ts';

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

interface Recorded {
  method: string;
  url: string;
  headers: Headers;
  body: string;
  credentials?: string;
}

type Handler = (method: string, url: string, body: string) => { status?: number; body?: string; url?: string } | undefined;

function fakeFetch(handler: Handler): { fetchFn: typeof fetch; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? init.body : '';
    calls.push({ method, url, headers: new Headers(init?.headers), body, credentials: init?.credentials });
    const r = handler(method, url, body) ?? { status: 404, body: '' };
    const status = r.status ?? 207;
    const res = new Response(status === 204 ? null : (r.body ?? ''), { status });
    Object.defineProperty(res, 'url', { value: r.url ?? url });
    return res;
  }) as typeof fetch;
  return { fetchFn, calls };
}

const creds = { serverUrl: 'https://cloud.example/', username: 'alice', password: 'pässword' };
const expectedAuth = 'Basic ' + btoa(String.fromCharCode(...new TextEncoder().encode('alice:pässword')));

const nextcloud: Handler = (method, url) => {
  if (method !== 'PROPFIND') return undefined;
  if (url === 'https://cloud.example/.well-known/caldav') {
    return { status: 207, body: '<d:multistatus xmlns:d="DAV:"/>', url: 'https://cloud.example/remote.php/dav/' };
  }
  if (url === 'https://cloud.example/remote.php/dav/') return { body: fx('nc-principal.xml') };
  if (url === 'https://cloud.example/remote.php/dav/principals/users/alice/') return { body: fx('nc-homeset.xml') };
  if (url === 'https://cloud.example/remote.php/dav/calendars/alice/') return { body: fx('nc-calendars.xml') };
  return undefined;
};

test('discovers Nextcloud calendars via well-known, in order', async () => {
  const { fetchFn, calls } = fakeFetch(nextcloud);
  const cals = await discoverCalendars(creds, fetchFn);
  assert.deepEqual(cals, [
    { url: 'https://cloud.example/remote.php/dav/calendars/alice/personal/', name: 'Personal', color: '#0082C9FF' },
  ]);
  assert.deepEqual(
    calls.map((c) => [c.method, c.url, c.headers.get('Depth')]),
    [
      ['PROPFIND', 'https://cloud.example/.well-known/caldav', '0'],
      ['PROPFIND', 'https://cloud.example/remote.php/dav/', '0'],
      ['PROPFIND', 'https://cloud.example/remote.php/dav/principals/users/alice/', '0'],
      ['PROPFIND', 'https://cloud.example/remote.php/dav/calendars/alice/', '1'],
    ],
  );
});

test('every request carries Basic auth and credentials omit', async () => {
  const { fetchFn, calls } = fakeFetch(nextcloud);
  await discoverCalendars(creds, fetchFn);
  assert.ok(calls.length > 0);
  for (const c of calls) {
    assert.equal(c.headers.get('Authorization'), expectedAuth);
    assert.equal(c.credentials, 'omit');
  }
});

test('discovers Radicale calendars (default namespace, no color, no well-known)', async () => {
  const { fetchFn } = fakeFetch((method, url, body) => {
    if (method !== 'PROPFIND') return undefined;
    if (url === 'https://rad.example/') return { body: fx('rad-principal.xml') };
    if (url === 'https://rad.example/alice/') {
      // principal and home set share a URL; the request body tells the queries apart
      return { body: fx(body.includes('calendar-home-set') ? 'rad-homeset.xml' : 'rad-calendars.xml') };
    }
    return undefined; // incl. /.well-known/caldav -> 404, falls back to serverUrl
  });
  const cals = await discoverCalendars({ ...creds, serverUrl: 'https://rad.example/' }, fetchFn);
  assert.deepEqual(cals, [{ url: 'https://rad.example/alice/work/', name: 'Work' }]);
});

test('401 rejects with CalDavError status 401', async () => {
  const { fetchFn } = fakeFetch(() => ({ status: 401 }));
  await assert.rejects(discoverCalendars(creds, fetchFn), (e: unknown) => {
    assert.ok(e instanceof CalDavError);
    assert.equal(e.status, 401);
    return true;
  });
});

test('network errors become CalDavError without status', async () => {
  const fetchFn = (async () => {
    throw new TypeError('boom');
  }) as typeof fetch;
  await assert.rejects(fetchCalendarData(creds, 'https://cloud.example/c/', new Date(0), new Date(1), fetchFn), (e: unknown) => {
    assert.ok(e instanceof CalDavError);
    assert.equal(e.status, undefined);
    assert.match(e.message, /boom/);
    return true;
  });
});

test('fetchCalendarData sends a time-range without expand and returns calendar-data incl. CDATA', async () => {
  const { fetchFn, calls } = fakeFetch((method) => (method === 'REPORT' ? { body: fx('report.xml') } : undefined));
  const out = await fetchCalendarData(
    creds,
    'https://cloud.example/remote.php/dav/calendars/alice/personal/',
    new Date(Date.UTC(2026, 9, 20)),
    new Date(Date.UTC(2026, 9, 27)),
    fetchFn,
  );
  assert.equal(calls.length, 1);
  const c = calls[0]!;
  assert.equal(c.method, 'REPORT');
  assert.equal(c.url, 'https://cloud.example/remote.php/dav/calendars/alice/personal/');
  assert.equal(c.headers.get('Depth'), '1');
  assert.equal(c.headers.get('Authorization'), expectedAuth);
  assert.equal(c.credentials, 'omit');
  assert.ok(c.body.includes('<c:time-range start="20261020T000000Z" end="20261027T000000Z"/>'));
  // Recurrences are expanded locally; server-side expand is the slow part on Nextcloud.
  assert.ok(!c.body.includes('expand'));
  assert.ok(c.body.includes('<c:calendar-data/>'));
  assert.equal(out.length, 2);
  assert.match(out[0]!, /^BEGIN:VCALENDAR/);
  assert.match(out[0]!, /SUMMARY:Fish & chips/);
  // Nextcloud escapes CR as &#13;; left undecoded, every line ends in junk and no VEVENT parses.
  assert.ok(!out[0]!.includes('&#13;'));
  assert.match(out[0]!, /^BEGIN:VEVENT\r$/m);
  assert.match(out[1]!, /SUMMARY:<cdata> party/);
});

test('REPORT failure throws CalDavError with status', async () => {
  const { fetchFn } = fakeFetch(() => ({ status: 500 }));
  await assert.rejects(
    fetchCalendarData(creds, 'https://cloud.example/c/', new Date(0), new Date(1000), fetchFn),
    (e: unknown) => e instanceof CalDavError && e.status === 500,
  );
});

const crossMsg = /redirected to another host \(https:\/\/evil\.example\), which is not supported/;

test('cross-origin home-set href is refused and never contacted', async () => {
  const { fetchFn, calls } = fakeFetch((method, url, body) => {
    if (method !== 'PROPFIND') return undefined;
    if (url === 'https://rad.example/') return { body: fx('rad-principal.xml') };
    if (url === 'https://rad.example/alice/') {
      return {
        body: body.includes('calendar-home-set')
          ? `<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><response><href>/alice/</href><propstat><prop><C:calendar-home-set><href>https://evil.example/alice/</href></C:calendar-home-set></prop><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>`
          : fx('rad-calendars.xml'),
      };
    }
    return undefined;
  });
  await assert.rejects(
    discoverCalendars({ ...creds, serverUrl: 'https://rad.example/' }, fetchFn),
    (e: unknown) => e instanceof CalDavError && crossMsg.test(e.message),
  );
  assert.ok(calls.every((c) => new URL(c.url).origin === 'https://rad.example'));
  assert.ok(calls.length > 0);
});

test('well-known redirecting cross-origin falls back to serverUrl', async () => {
  const { fetchFn, calls } = fakeFetch((method, url, body) => {
    if (method !== 'PROPFIND') return undefined;
    if (url === 'https://rad.example/.well-known/caldav') return { body: '<d:multistatus xmlns:d="DAV:"/>', url: 'https://evil.example/dav/' };
    if (url === 'https://rad.example/') return { body: fx('rad-principal.xml') };
    if (url === 'https://rad.example/alice/') {
      return { body: fx(body.includes('calendar-home-set') ? 'rad-homeset.xml' : 'rad-calendars.xml') };
    }
    return undefined;
  });
  const cals = await discoverCalendars({ ...creds, serverUrl: 'https://rad.example/' }, fetchFn);
  assert.equal(cals.length, 1);
  assert.ok(calls.every((c) => new URL(c.url).origin === 'https://rad.example'));
});

test('fetchCalendarData refuses a cross-origin calendar url without sending anything', async () => {
  const { fetchFn, calls } = fakeFetch(() => ({ body: '' }));
  await assert.rejects(
    fetchCalendarData(creds, 'https://evil.example/c/', new Date(0), new Date(1000), fetchFn),
    (e: unknown) => e instanceof CalDavError && crossMsg.test(e.message),
  );
  assert.equal(calls.length, 0);
});

test('request timeouts surface as a CalDavError saying so', async () => {
  const seen: (AbortSignal | null | undefined)[] = [];
  const fetchFn = (async (_u: unknown, init?: RequestInit) => {
    seen.push(init?.signal);
    throw new DOMException('The operation timed out.', 'TimeoutError');
  }) as typeof fetch;
  await assert.rejects(
    fetchCalendarData(creds, 'https://cloud.example/c/', new Date(0), new Date(1000), fetchFn),
    (e: unknown) => e instanceof CalDavError && /timed out/.test(e.message),
  );
  assert.ok(seen[0] instanceof AbortSignal);
});

test('raw Nextcloud recurring event expands locally: rule, EXDATE, moved override, DST', async () => {
  const { fetchFn } = fakeFetch((method) => (method === 'REPORT' ? { body: fx('nc-report-recurring.xml') } : undefined));
  const start = new Date(Date.UTC(2026, 9, 19));
  const end = new Date(Date.UTC(2026, 9, 29));
  const [ics] = await fetchCalendarData(creds, 'https://cloud.example/remote.php/dav/calendars/alice/personal/', start, end, fetchFn);
  const busy = extractBusy(ics!, { countAllDay: false, timezone: 'Europe/Berlin', rangeStart: start.getTime(), rangeEnd: end.getTime() });
  const half = (d: number, h: number) => ({ start: Date.UTC(2026, 9, d, h), end: Date.UTC(2026, 9, d, h, 30) });
  assert.deepEqual(
    busy.sort((a, b) => a.start - b.start),
    // Mon 19 moved to 14:00 CEST, Wed 21 excluded, Mon 26 / Wed 28 at 10:00 CET after the DST switch.
    [half(19, 12), half(26, 9), half(28, 9)],
  );
});
