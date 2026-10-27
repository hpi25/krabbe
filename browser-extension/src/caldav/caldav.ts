import { XMLParser } from 'fast-xml-parser';

export interface Credentials {
  serverUrl: string;
  username: string;
  password: string;
}

export interface DiscoveredCalendar {
  url: string;
  name: string;
  color?: string;
}

/** Why a request failed, coarse enough to show to the website without leaking server details. */
export type CalDavErrorKind = 'http' | 'timeout' | 'network' | 'redirect' | 'protocol';

export class CalDavError extends Error {
  kind: CalDavErrorKind;
  status?: number;
  constructor(message: string, kind: CalDavErrorKind, status?: number) {
    super(message);
    this.name = 'CalDavError';
    this.kind = kind;
    if (status !== undefined) this.status = status;
  }
}

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  parseTagValue: false,
  // Decodes numeric refs too: Nextcloud sends calendar-data line endings as `&#13;`.
  htmlEntities: true,
  isArray: (name) => ['response', 'propstat', 'comp'].includes(name),
});

function basicAuth(c: Credentials): string {
  const bytes = new TextEncoder().encode(`${c.username}:${c.password}`);
  return 'Basic ' + btoa(String.fromCharCode(...bytes));
}

interface DavResponse {
  text: string;
  /** Final URL after redirects; falls back to the request URL. */
  url: string;
}

const REQUEST_TIMEOUT_MS = 20_000;

/** Credentials only ever go to the server's own origin. */
function assertSameOrigin(creds: Credentials, url: string): void {
  const origin = new URL(url).origin;
  if (origin !== new URL(creds.serverUrl).origin) {
    throw new CalDavError(`Calendar server redirected to another host (${origin}), which is not supported`, 'redirect');
  }
}

async function dav(
  creds: Credentials,
  fetchFn: typeof fetch,
  method: 'PROPFIND' | 'REPORT',
  url: string,
  depth: '0' | '1',
  body: string,
): Promise<DavResponse> {
  assertSameOrigin(creds, url);
  let res: Response;
  try {
    res = await fetchFn(url, {
      method,
      credentials: 'omit',
      headers: {
        Authorization: basicAuth(creds),
        Depth: depth,
        'Content-Type': 'application/xml; charset=utf-8',
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new CalDavError(`${method} ${url} failed: the server timed out after ${REQUEST_TIMEOUT_MS / 1000}s`, 'timeout');
    }
    throw new CalDavError(`${method} ${url} failed: ${e instanceof Error ? e.message : String(e)}`, 'network');
  }
  if (!res.ok) throw new CalDavError(`${method} ${url} returned HTTP ${res.status}`, 'http', res.status);
  const finalUrl = res.url || url;
  assertSameOrigin(creds, finalUrl);
  return { text: await res.text(), url: finalUrl };
}

type Node = Record<string, unknown>;

function asArray<T>(v: T | T[] | undefined): T[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

/** Text of a parsed element: plain string, or the `#text` of an element with attributes. */
function text(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined;
  if (v && typeof v === 'object' && '#text' in v) return text((v as Node)['#text']);
  return undefined;
}

/** Each response's href plus the merged props of its 2xx propstats. */
function parseMultistatus(xml: string): { href: string; prop: Node }[] {
  const root = parser.parse(xml) as { multistatus?: { response?: Node[] } };
  return (root.multistatus?.response ?? []).map((r) => {
    const prop: Node = {};
    for (const ps of asArray(r['propstat'] as Node[] | undefined)) {
      if (!/\s2\d\d\b/.test(String(ps['status'] ?? ' 200'))) continue;
      Object.assign(prop, ps['prop'] as Node | undefined);
    }
    return { href: text(r['href']) ?? '', prop };
  });
}

function propfindBody(prop: string): string {
  return `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"><d:prop>${prop}</d:prop></d:propfind>`;
}

function hrefProp(prop: Node, name: string): string | undefined {
  const v = prop[name];
  return v && typeof v === 'object' ? text((v as Node)['href']) : undefined;
}

export async function discoverCalendars(
  creds: Credentials,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<DiscoveredCalendar[]> {
  const principalBody = propfindBody('<d:current-user-principal/>');
  const base = new URL(creds.serverUrl);

  // 1. Well-known only locates the DAV root (its post-redirect URL); fall back to the configured URL.
  let rootUrl: string;
  try {
    rootUrl = (await dav(creds, fetchFn, 'PROPFIND', new URL('/.well-known/caldav', base).href, '0', principalBody)).url;
  } catch (e) {
    if (e instanceof CalDavError && e.status === 401) throw e;
    rootUrl = base.href;
  }

  // 2. Principal.
  const root = await dav(creds, fetchFn, 'PROPFIND', rootUrl, '0', principalBody);
  const principalHref = parseMultistatus(root.text)
    .map((r) => hrefProp(r.prop, 'current-user-principal'))
    .find((h) => h);
  if (!principalHref) throw new CalDavError('Server did not report a current-user-principal', 'protocol');
  const principalUrl = new URL(principalHref, root.url).href;

  // 3. Calendar home set.
  const principal = await dav(creds, fetchFn, 'PROPFIND', principalUrl, '0', propfindBody('<c:calendar-home-set/>'));
  const homeHref = parseMultistatus(principal.text)
    .map((r) => hrefProp(r.prop, 'calendar-home-set'))
    .find((h) => h);
  if (!homeHref) throw new CalDavError('Server did not report a calendar-home-set', 'protocol');
  const homeUrl = new URL(homeHref, principal.url).href;

  // 4. Calendars in the home set.
  const home = await dav(
    creds,
    fetchFn,
    'PROPFIND',
    homeUrl,
    '1',
    propfindBody('<d:resourcetype/><d:displayname/><a:calendar-color/><c:supported-calendar-component-set/>'),
  );
  const out: DiscoveredCalendar[] = [];
  for (const { href, prop } of parseMultistatus(home.text)) {
    const rt = prop['resourcetype'];
    if (!rt || typeof rt !== 'object' || !('calendar' in rt)) continue;
    const comps = asArray((prop['supported-calendar-component-set'] as Node | undefined)?.['comp'] as Node[] | undefined);
    // A missing component set means "unrestricted" per RFC 4791.
    if (comps.length > 0 && !comps.some((c) => String(c['@_name']).toUpperCase() === 'VEVENT')) continue;
    const url = new URL(href, home.url).href;
    assertSameOrigin(creds, url);
    const color = text(prop['calendar-color']);
    out.push({ url, name: text(prop['displayname']) ?? url, ...(color ? { color } : {}) });
  }
  return out;
}

function icalUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export async function fetchCalendarData(
  creds: Credentials,
  calendarUrl: string,
  start: Date,
  end: Date,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<string[]> {
  const range = `start="${icalUtc(start)}" end="${icalUtc(end)}"`;
  const body =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop>` +
    `<c:calendar-data><c:expand ${range}/></c:calendar-data></d:prop>` +
    `<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">` +
    `<c:time-range ${range}/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
  const res = await dav(creds, fetchFn, 'REPORT', calendarUrl, '1', body);
  const out: string[] = [];
  for (const { prop } of parseMultistatus(res.text)) {
    const data = text(prop['calendar-data']);
    if (data) out.push(data);
  }
  return out;
}
