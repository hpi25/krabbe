import { ext } from '../platform.ts';
import { getSettings } from '../storage.ts';
import { fetchBusy } from './busy.ts';
import { SCRIPT_ID, serialized, syncContentScripts } from './contentScripts.ts';
import { handleBridgeMessage } from './router.ts';

const deps = {
  getSettings,
  fetchBusy,
  openOptionsPage: () => ext.runtime.openOptionsPage(),
  extensionId: ext.runtime.id,
};

type Listener = Parameters<typeof ext.runtime.onMessage.addListener>[0];

// sendResponse + `return true` works in both Chrome and Firefox; returning a promise only works in Firefox.
const onMessage = ((raw: unknown, sender: { id?: string; url?: string; tab?: unknown }, sendResponse: (r: unknown) => void) => {
  if ((raw as { channel?: unknown } | null)?.channel !== 'krabbe-bridge') return false;
  void handleBridgeMessage(raw, sender, deps).then(sendResponse);
  return true;
}) as unknown as Listener;
ext.runtime.onMessage.addListener(onMessage);

ext.action.onClicked.addListener(() => void ext.runtime.openOptionsPage());

const sync = serialized(async () => {
  const { instances } = await getSettings();
  await syncContentScripts(instances, {
    hasOrigin: (pattern) => ext.permissions.contains({ origins: [pattern] }),
    getRegistered: () => ext.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] }),
    register: (matches) =>
      ext.scripting.registerContentScripts([
        { id: SCRIPT_ID, matches, js: ['content.js'], runAt: 'document_start', persistAcrossSessions: false },
      ]),
    unregister: () => ext.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] }),
  });
});

// Top level runs on every background start: browser startup, install, update, worker/event-page wake.
void sync();
ext.permissions.onAdded.addListener(() => void sync());
ext.permissions.onRemoved.addListener(() => void sync());
ext.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'instances' in changes) void sync();
});
