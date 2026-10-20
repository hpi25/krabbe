import { discoverCalendars } from '../calendar/caldav.ts';
import type { DiscoverResponse, FetchBusyResponse, Message } from '../messages.ts';
import { getSettings } from '../storage.ts';
import { fetchBusy } from './fetchBusy.ts';

export interface RouterDeps {
  getSettings: typeof getSettings;
  fetchBusy: typeof fetchBusy;
  discoverCalendars: typeof discoverCalendars;
  openOptionsPage: () => Promise<void> | void;
  /** e.g. `moz-extension://<uuid>/`; senders whose url starts with it are extension pages. */
  extensionBaseUrl: string;
}

const defaultDeps: RouterDeps = { getSettings, fetchBusy, discoverCalendars, openOptionsPage: () => undefined, extensionBaseUrl: '' };

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Returns true if `reply` will be called asynchronously; false/undefined otherwise. */
export function routeMessage(
  msg: Message | undefined,
  sender: { tab?: unknown; url?: string },
  reply: (r?: unknown) => void,
  deps: RouterDeps = defaultDeps,
): boolean {
  switch (msg?.type) {
    case 'discover': {
      if (!deps.extensionBaseUrl || !sender.url?.startsWith(deps.extensionBaseUrl)) {
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
      Promise.resolve()
        .then(() => deps.getSettings())
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
