import { discoverCalendars } from './calendar/caldav.ts';
import { fetchBusy } from './background/fetchBusy.ts';
import { routeMessage } from './background/router.ts';
import { syncContentScript, syncCurrent } from './background/contentScript.ts';
import type { Message } from './messages.ts';
import { ext } from './platform.ts';
import { getSettings, saveSettings } from './storage.ts';

const routerDeps = {
  getSettings,
  saveSettings,
  fetchBusy,
  discoverCalendars,
  openOptionsPage: () => ext.runtime.openOptionsPage(),
  get extensionBaseUrl() {
    return ext.runtime.getURL('');
  },
};

type Listener = Parameters<typeof ext.runtime.onMessage.addListener>[0];

// Typings only allow a `true` return; returning false for unhandled messages is valid at runtime.
const onMessage = ((raw: unknown, sender: { tab?: unknown; url?: string }, sendResponse: (r?: unknown) => void) =>
  routeMessage(raw as Message, sender, sendResponse, routerDeps)) as unknown as Listener;
ext.runtime.onMessage.addListener(onMessage);

// Top level: runs on every background start (browser startup, install, update, event-page wake).
const resync = () => syncCurrent().catch(console.error);
resync();
// Granting the krabbe origin later (e.g. via the options page) must register the script too.
ext.permissions.onAdded.addListener(resync);

ext.storage.onChanged.addListener((changes, area) => {
  const change = changes.krabbeUrl;
  if (area !== 'local' || !change || typeof change.newValue !== 'string') return;
  const previous = typeof change.oldValue === 'string' ? change.oldValue : undefined;
  getSettings()
    .then(({ accounts }) => syncContentScript(change.newValue as string, previous, accounts))
    .catch(console.error);
});
