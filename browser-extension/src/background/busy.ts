import { CalDavError, fetchCalendarData } from '../caldav/caldav.ts';
import { extractBusy, type ExtractOptions, type ExtractStats } from '../caldav/ical.ts';
import type { BusyInterval } from '../caldav/types.ts';
import type { BridgeReply, CalendarErrorCode, ResponseData } from '../protocol.ts';
import { countsAllDay, type Settings } from '../storage.ts';

export interface FetchBusyDeps {
  fetchCalendarData: typeof fetchCalendarData;
  extractBusy: typeof extractBusy;
}

export interface FetchBusyParams {
  calendarIds: string[];
  timeStart: string;
  timeEnd: string;
  timezone: string;
}

const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

export function errorCode(err: unknown): CalendarErrorCode {
  if (!(err instanceof CalDavError)) return 'unknown';
  switch (err.kind) {
    case 'timeout':
      return 'timeout';
    case 'network':
      return 'network';
    case 'http':
      if (err.status === 401 || err.status === 403) return 'auth';
      if (err.status === 404) return 'not-found';
      return 'server';
    default:
      return 'server';
  }
}

/** Sorted, non-overlapping intervals inside [min, max). Each one is a fresh `{start, end}` object. */
export function mergeIntervals(intervals: BusyInterval[], min: number, max: number): BusyInterval[] {
  const clamped = intervals
    .map((i) => ({ start: Math.max(i.start, min), end: Math.min(i.end, max) }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);
  const out: BusyInterval[] = [];
  for (const i of clamped) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push(i);
  }
  return out;
}

export async function fetchBusy(
  settings: Settings,
  req: FetchBusyParams,
  deps: FetchBusyDeps = { fetchCalendarData, extractBusy },
): Promise<BridgeReply<'fetch-busy'>> {
  const start = new Date(req.timeStart);
  const end = new Date(req.timeEnd);
  const span = end.getTime() - start.getTime();
  if (!Number.isFinite(span) || span <= 0 || span > MAX_RANGE_MS) return { ok: false, error: 'invalid-range' };

  const data: ResponseData['fetch-busy'] = { busy: [], errors: [], stats: [] };
  const jobs = [...new Set(req.calendarIds)].map(async (calendarId) => {
    const account = settings.accounts.find((a) => a.calendars.some((c) => c.id === calendarId));
    const calendar = account?.calendars.find((c) => c.id === calendarId);
    if (!account || !calendar) {
      data.errors.push({ calendarId, code: 'not-found' });
      return [];
    }
    try {
      const list = await deps.fetchCalendarData(account, calendar.url, start, end);
      const stats: ExtractStats = { instances: 0, truncated: false };
      const opts: ExtractOptions = {
        countAllDay: countsAllDay(calendar, settings),
        timezone: req.timezone,
        rangeStart: start.getTime(),
        rangeEnd: end.getTime(),
        stats,
      };
      const intervals = list.flatMap((ics) => deps.extractBusy(ics, opts));
      data.stats.push({ calendarId, events: stats.instances, intervals: intervals.length });
      if (stats.truncated) {
        console.warn(`Krabbe: calendar "${calendar.name}" has a recurring event with too many instances, some were skipped`);
        data.errors.push({ calendarId, code: 'unknown' });
      }
      return intervals;
    } catch (e) {
      console.warn(`Krabbe: fetching calendar "${calendar.name}" failed`, e);
      data.errors.push({ calendarId, code: errorCode(e) });
      return [];
    }
  });
  data.busy = mergeIntervals((await Promise.all(jobs)).flat(), start.getTime(), end.getTime());
  return { ok: true, data };
}
