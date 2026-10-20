import { CalDavError, fetchCalendarData } from '../calendar/caldav.ts';
import { extractBusy } from '../calendar/ical.ts';
import type { BusyInterval } from '../calendar/types.ts';
import type { FetchBusyRequest, FetchBusyResponse } from '../messages.ts';
import type { Settings } from '../storage.ts';

export interface FetchBusyDeps {
  fetchCalendarData: typeof fetchCalendarData;
  extractBusy: typeof extractBusy;
}

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
  const jobs: { url: string; run: Promise<BusyInterval[]> }[] = [];
  for (const url of req.calendarUrls) {
    for (const account of settings.accounts) {
      const cal = account.calendars.find((c) => c.url === url);
      if (!cal) continue;
      const run = deps
        .fetchCalendarData(account, url, start, end)
        .then((list) => list.flatMap((ics) => deps.extractBusy(ics, { countAllDay: cal.countAllDay, timezone: req.timezone })));
      jobs.push({ url, run });
      break;
    }
  }
  const results = await Promise.allSettled(jobs.map((j) => j.run));
  const busy: BusyInterval[] = [];
  const errors: FetchBusyResponse['errors'] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') busy.push(...r.value);
    else errors.push({ calendarUrl: jobs[i]!.url, message: messageOf(r.reason) });
  });
  return { busy, errors };
}
