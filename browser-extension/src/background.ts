import { discoverCalendars } from './calendar/caldav.ts';
import { fetchBusy } from './background/fetchBusy.ts';
import { routeMessage } from './background/router.ts';
import { syncContentScript } from './background/contentScript.ts';
import type { Message } from './messages.ts';
import { ext } from './platform.ts';
import { getSettings, originPattern } from './storage.ts';

const routerDeps = {
  getSettings,
  fetchBusy,
  discoverCalendars,
  openOptionsPage: () => ext.runtime.openOptionsPage(),
};

type Listener = Parameters<typeof ext.runtime.onMessage.addListener>[0];

// Typings only allow a `true` return; returning false for unhandled messages is valid at runtime.
const onMessage = ((raw: unknown, sender: { tab?: unknown }, sendResponse: (r?: unknown) => void) =>
  routeMessage(raw as Message, sender, sendResponse, routerDeps)) as unknown as Listener;
ext.runtime.onMessage.addListener(onMessage);

async function syncCurrent(): Promise<void> {
  const { krabbeUrl } = await getSettings();
  if (await ext.permissions.contains({ origins: [originPattern(krabbeUrl)] })) {
    await syncContentScript(krabbeUrl);
  }
}
ext.runtime.onStartup.addListener(() => syncCurrent().catch(console.error));
ext.runtime.onInstalled.addListener(() => syncCurrent().catch(console.error));

ext.storage.onChanged.addListener((changes, area) => {
  const change = changes.krabbeUrl;
  if (area !== 'local' || !change || typeof change.newValue !== 'string') return;
  syncContentScript(change.newValue, typeof change.oldValue === 'string' ? change.oldValue : undefined).catch(console.error);
});
