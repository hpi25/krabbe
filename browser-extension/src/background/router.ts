import { discoverCalendars } from '../calendar/caldav.ts';
import type { DiscoverResponse, FetchBusyResponse, Message } from '../messages.ts';
import { getSettings } from '../storage.ts';
import { fetchBusy } from './fetchBusy.ts';

export interface RouterDeps {
  getSettings: typeof getSettings;
  fetchBusy: typeof fetchBusy;
  discoverCalendars: typeof discoverCalendars;
  openOptionsPage: () => Promise<void> | void;
}

const defaultDeps: RouterDeps = { getSettings, fetchBusy, discoverCalendars, openOptionsPage: () => undefined };

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Returns true if `reply` will be called asynchronously; false/undefined otherwise. */
export function routeMessage(
  msg: Message | undefined,
  sender: { tab?: unknown },
  reply: (r?: unknown) => void,
  deps: RouterDeps = defaultDeps,
): boolean {
  switch (msg?.type) {
    case 'discover': {
      if (sender.tab !== undefined) {
        reply({ error: 'discover is only available from the settings page' } satisfies DiscoverResponse);
        return true;
      }
      deps.discoverCalendars(msg.creds).then(
        (calendars) => reply({ calendars } satisfies DiscoverResponse),
        (e) => reply({ error: errMsg(e) } satisfies DiscoverResponse),
      );
      return true;
    }
    case 'fetch-busy':
      deps
        .getSettings()
        .then((s) => deps.fetchBusy(s, msg))
        .catch((e): FetchBusyResponse => ({ busy: [], errors: [{ calendarUrl: '', message: errMsg(e) }] }))
        .then(reply);
      return true;
    case 'open-options':
      void deps.openOptionsPage();
      return false;
    default:
      return false;
  }
}
