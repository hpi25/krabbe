import { PROTOCOL_VERSION, parseRequest, type BridgeReply, type PickerCalendar } from '../protocol.ts';
import type { Settings } from '../storage.ts';
import type { fetchBusy } from './busy.ts';

export interface RouterDeps {
  getSettings: () => Promise<Settings>;
  fetchBusy: typeof fetchBusy;
  openOptionsPage: () => Promise<void> | void;
  /** `runtime.id`; messages from other extensions are refused. */
  extensionId: string;
}

export interface Sender {
  id?: string;
  url?: string;
  tab?: unknown;
}

function senderOrigin(sender: Sender): string | null {
  try {
    return sender.url ? new URL(sender.url).origin : null;
  } catch {
    return null;
  }
}

export function pickerCalendars(settings: Settings): PickerCalendar[] {
  return settings.accounts.flatMap((a) =>
    a.calendars.map((c) => ({
      id: c.id,
      name: c.name,
      ...(c.color ? { color: c.color } : {}),
      account: a.label,
      enabled: c.enabled,
    })),
  );
}

/** Handles one bridge request from the content script. Never throws. */
export async function handleBridgeMessage(raw: unknown, sender: Sender, deps: RouterDeps): Promise<BridgeReply> {
  try {
    if (sender.id !== deps.extensionId || !sender.tab) return { ok: false, error: 'forbidden' };
    const request = parseRequest((raw as { request?: unknown } | null)?.request);
    if (!request) return { ok: false, error: 'bad-request' };

    const settings = await deps.getSettings();
    const origin = senderOrigin(sender);
    if (!origin || !settings.instances.includes(origin)) return { ok: false, error: 'forbidden' };

    switch (request.type) {
      case 'hello':
        return { ok: true, data: { version: PROTOCOL_VERSION } };
      case 'list-calendars':
        return { ok: true, data: { calendars: pickerCalendars(settings) } };
      case 'fetch-busy':
        return await deps.fetchBusy(settings, request);
      case 'open-settings':
        await deps.openOptionsPage();
        return { ok: true, data: {} };
    }
  } catch (e) {
    console.error('Krabbe: bridge request failed', e);
    return { ok: false, error: 'internal' };
  }
}
