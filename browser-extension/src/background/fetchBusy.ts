import { CalDavError, fetchCalendarData } from '../calendar/caldav.ts';
import { extractBusy } from '../calendar/ical.ts';
import type { BusyInterval } from '../calendar/types.ts';
import type { FetchBusyRequest, FetchBusyResponse } from '../messages.ts';
import type { Settings } from '../storage.ts';

export interface FetchBusyDeps {
  fetchCalendarData: typeof fetchCalendarData;
  extractBusy: typeof extractBusy;
}

const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

const countEvents = (ics: string) => ics.match(/^BEGIN:VEVENT\r?$/gm)?.length ?? 0;

function messageOf(err: unknown): string {
  if (err instanceof CalDavError && err.status === 401) return 'Authentication failed (HTTP 401)';
  return err instanceof Error ? err.message : String(err);
}

export async function fetchBusy(
  settings: Settings,
  req: FetchBusyRequest,
  deps: FetchBusyDeps = { fetchCalendarData, extractBusy },
): Promise<FetchBusyResponse> {
  const start = new Date(req.timeStart);
  const end = new Date(req.timeEnd);
  const span = end.getTime() - start.getTime();
  if (!Number.isFinite(span) || span <= 0 || span > MAX_RANGE_MS) {
    return { busy: [], errors: [{ calendarUrl: '', message: 'Invalid time range' }], stats: [] };
  }
  const jobs: { url: string; run: Promise<{ intervals: BusyInterval[]; events: number }> }[] = [];
  for (const url of req.calendarUrls) {
    for (const account of settings.accounts) {
      const cal = account.calendars.find((c) => c.url === url);
      if (!cal) continue;
      const run = deps
        .fetchCalendarData(account, url, start, end)
        .then((list) => ({
          intervals: list.flatMap((ics) => deps.extractBusy(ics, { countAllDay: cal.countAllDay, timezone: req.timezone })),
          events: list.reduce((n, ics) => n + countEvents(ics), 0),
        }));
      jobs.push({ url, run });
      break;
    }
  }
  const results = await Promise.allSettled(jobs.map((j) => j.run));
  const busy: BusyInterval[] = [];
  const errors: FetchBusyResponse['errors'] = [];
  const stats: FetchBusyResponse['stats'] = [];
  results.forEach((r, i) => {
    const calendarUrl = jobs[i]!.url;
    if (r.status === 'fulfilled') {
      busy.push(...r.value.intervals);
      stats.push({ calendarUrl, events: r.value.events, intervals: r.value.intervals.length });
    } else {
      errors.push({ calendarUrl, message: messageOf(r.reason) });
    }
  });
  return { busy, errors, stats };
}
