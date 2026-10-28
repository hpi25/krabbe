/**
 * Website ⇄ extension bridge, protocol v1.
 *
 * Page → content script, via `window.postMessage` on the page's own origin:
 *   `{ source: 'krabbe', requestId, type, ...params }`
 * Content script → page:
 *   `{ source: 'krabbe-extension', type: 'present', version }`  (unprompted, when the content script loads)
 *   `{ source: 'krabbe-extension', type: 'response', requestId, ok: true, data }`
 *   `{ source: 'krabbe-extension', type: 'response', requestId, ok: false, error }`
 *
 * Privacy invariant: nothing here may carry event details, credentials or server URLs.
 * `sanitizeResponse` rebuilds every reply field by field so extra properties can't slip through.
 * The frontend mirrors this file in `frontend/src/components/AvailabilityEditor/useExtensionBridge.ts`.
 */

export const PROTOCOL_VERSION = 1;
export const PAGE_SOURCE = 'krabbe';
export const EXTENSION_SOURCE = 'krabbe-extension';

export type BridgeRequest =
  | { type: 'hello' }
  | { type: 'list-calendars' }
  | { type: 'fetch-busy'; calendarIds: string[]; timeStart: string; timeEnd: string; timezone: string }
  | { type: 'open-settings' };
export type RequestType = BridgeRequest['type'];

export interface PickerCalendar {
  id: string;
  name: string;
  color?: string;
  /** Label of the CalDAV account, for grouping. */
  account: string;
  /** Default selection from the extension settings. */
  enabled: boolean;
}

export type CalendarErrorCode = 'auth' | 'not-found' | 'timeout' | 'network' | 'server' | 'unknown';
export type BridgeErrorCode = 'bad-request' | 'forbidden' | 'invalid-range' | 'internal';

export interface ResponseData {
  hello: { version: number };
  'list-calendars': { calendars: PickerCalendar[] };
  'fetch-busy': {
    /** Epoch ms, `end` exclusive, merged and clamped to the requested range. */
    busy: { start: number; end: number }[];
    errors: { calendarId: string; code: CalendarErrorCode }[];
    stats: { calendarId: string; events: number; intervals: number }[];
  };
  'open-settings': Record<string, never>;
}

export type BridgeReply<T extends RequestType = RequestType> =
  | { ok: true; data: ResponseData[T] }
  | { ok: false; error: BridgeErrorCode };

/** What the content script sends to the background. */
export interface BackgroundMessage {
  channel: 'krabbe-bridge';
  request: BridgeRequest;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isStr = (v: unknown): v is string => typeof v === 'string';
const MAX_CALENDARS = 200;
const MAX_ID_LENGTH = 100;

/** Validates a request and rebuilds it with only the known fields. */
export function parseRequest(raw: unknown): BridgeRequest | null {
  if (!isObj(raw)) return null;
  switch (raw.type) {
    case 'hello':
    case 'list-calendars':
    case 'open-settings':
      return { type: raw.type };
    case 'fetch-busy': {
      const { calendarIds, timeStart, timeEnd, timezone } = raw;
      if (!Array.isArray(calendarIds) || calendarIds.length > MAX_CALENDARS) return null;
      if (!calendarIds.every((id) => isStr(id) && id.length <= MAX_ID_LENGTH)) return null;
      if (!isStr(timeStart) || !isStr(timeEnd) || !isStr(timezone)) return null;
      return { type: 'fetch-busy', calendarIds: [...calendarIds], timeStart, timeEnd, timezone };
    }
    default:
      return null;
  }
}

/** A page message addressed to the extension, or null for anything else on the channel. */
export function parsePageMessage(raw: unknown): { requestId: string; request: BridgeRequest } | null {
  if (!isObj(raw) || raw.source !== PAGE_SOURCE) return null;
  if (!isStr(raw.requestId) || raw.requestId.length === 0 || raw.requestId.length > MAX_ID_LENGTH) return null;
  const request = parseRequest(raw);
  return request ? { requestId: raw.requestId, request } : null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Rebuilds a reply with only the fields the protocol allows; anything malformed becomes `internal`. */
export function sanitizeReply<T extends RequestType>(type: T, raw: unknown): BridgeReply<T>;
export function sanitizeReply(type: RequestType, raw: unknown): BridgeReply {
  const internal = { ok: false, error: 'internal' } as const;
  if (!isObj(raw)) return internal;
  if (raw.ok === false) {
    const codes: BridgeErrorCode[] = ['bad-request', 'forbidden', 'invalid-range', 'internal'];
    return { ok: false, error: codes.includes(raw.error as BridgeErrorCode) ? (raw.error as BridgeErrorCode) : 'internal' };
  }
  if (raw.ok !== true || !isObj(raw.data)) return internal;
  const d = raw.data;
  switch (type) {
    case 'hello':
      return num(d.version) === null ? internal : { ok: true, data: { version: d.version as number } };
    case 'open-settings':
      return { ok: true, data: {} };
    case 'list-calendars': {
      if (!Array.isArray(d.calendars)) return internal;
      const calendars: PickerCalendar[] = d.calendars.filter(isObj).flatMap((c) =>
        isStr(c.id) && isStr(c.name) && isStr(c.account)
          ? [{ id: c.id, name: c.name, ...(isStr(c.color) ? { color: c.color } : {}), account: c.account, enabled: c.enabled === true }]
          : [],
      );
      return { ok: true, data: { calendars } };
    }
    case 'fetch-busy': {
      if (!Array.isArray(d.busy) || !Array.isArray(d.errors) || !Array.isArray(d.stats)) return internal;
      const codes: CalendarErrorCode[] = ['auth', 'not-found', 'timeout', 'network', 'server', 'unknown'];
      return {
        ok: true,
        data: {
          busy: d.busy.filter(isObj).flatMap((b) => {
            const start = num(b.start);
            const end = num(b.end);
            return start !== null && end !== null ? [{ start, end }] : [];
          }),
          errors: d.errors.filter(isObj).flatMap((e) =>
            isStr(e.calendarId) ? [{ calendarId: e.calendarId, code: codes.includes(e.code as CalendarErrorCode) ? (e.code as CalendarErrorCode) : 'unknown' }] : [],
          ),
          stats: d.stats.filter(isObj).flatMap((s) => {
            const events = num(s.events);
            const intervals = num(s.intervals);
            return isStr(s.calendarId) && events !== null && intervals !== null ? [{ calendarId: s.calendarId, events, intervals }] : [];
          }),
        },
      };
    }
  }
}
