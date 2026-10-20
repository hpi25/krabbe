import { ext } from './platform.ts';

export const DEFAULT_KRABBE_URL = 'https://krabbe.hpi.church';

export interface CalendarSettings {
  url: string;
  name: string;
  color?: string;
  countAllDay: boolean;
}

export interface Account {
  id: string;
  label: string;
  serverUrl: string;
  username: string;
  password: string;
  calendars: CalendarSettings[];
}

export interface Settings {
  krabbeUrl: string;
  accounts: Account[];
  selectedCalendars: string[];
}

export async function getSettings(): Promise<Settings> {
  const stored = (await ext.storage.local.get(['krabbeUrl', 'accounts', 'selectedCalendars'])) as Partial<Settings>;
  return {
    krabbeUrl: stored.krabbeUrl ?? DEFAULT_KRABBE_URL,
    accounts: stored.accounts ?? [],
    selectedCalendars: stored.selectedCalendars ?? [],
  };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await ext.storage.local.set(patch);
}

/**
 * Match pattern covering the host of `url`, e.g. `https://host/*`.
 * The port is dropped: Firefox never matches patterns that contain one, and a portless pattern covers all ports.
 */
export function originPattern(url: string): string {
  const { protocol, hostname } = new URL(url);
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(`Unsupported URL scheme: ${protocol}`);
  }
  return `${protocol}//${hostname}/*`;
}
