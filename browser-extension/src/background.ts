import { discoverCalendars } from './calendar/caldav.ts';
import { fetchBusy } from './background/fetchBusy.ts';
import { syncContentScript } from './background/contentScript.ts';
import type { Message } from './messages.ts';
import { ext } from './platform.ts';
import { getSettings, originPattern } from './storage.ts';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

type Listener = Parameters<typeof ext.runtime.onMessage.addListener>[0];

// Typings only allow `true`; returning undefined for unhandled messages is valid at runtime.
const onMessage = ((raw: unknown, _sender: unknown, sendResponse: (r?: unknown) => void) => {
  const msg = raw as Message;
  switch (msg?.type) {
    case 'discover':
      discoverCalendars(msg.creds).then(
        (calendars) => sendResponse({ calendars }),
        (e) => sendResponse({ error: errMsg(e) }),
      );
      return true;
    case 'fetch-busy':
      getSettings()
        .then((s) => fetchBusy(s, msg))
        .then(sendResponse);
      return true;
    case 'open-options':
      void ext.runtime.openOptionsPage();
      return undefined;
    default:
      return undefined;
  }
}) as unknown as Listener;
ext.runtime.onMessage.addListener(onMessage);

async function syncCurrent(): Promise<void> {
  const { krabbeUrl } = await getSettings();
  if (await ext.permissions.contains({ origins: [originPattern(krabbeUrl)] })) {
    await syncContentScript(krabbeUrl);
  }
}
ext.runtime.onStartup.addListener(() => void syncCurrent());
ext.runtime.onInstalled.addListener(() => void syncCurrent());

ext.storage.onChanged.addListener((changes, area) => {
  const change = changes.krabbeUrl;
  if (area !== 'local' || !change || typeof change.newValue !== 'string') return;
  void syncContentScript(change.newValue, typeof change.oldValue === 'string' ? change.oldValue : undefined);
});
