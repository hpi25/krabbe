import { ext } from './platform.ts';

export const DEFAULT_INSTANCE = 'https://krabbe.hpi.church';
export const SETTINGS_VERSION = 3;

/** `inherit` follows `Settings.defaults.countAllDay`. */
export type AllDayMode = 'inherit' | 'count' | 'ignore';

export interface Calendar {
  /** Opaque, random. The only calendar handle the website ever sees. */
  id: string;
  url: string;
  name: string;
  color?: string;
  /** Pre-checked in the website's calendar picker. */
  enabled: boolean;
  allDay: AllDayMode;
}

export interface Account {
  id: string;
  label: string;
  serverUrl: string;
  username: string;
  password: string;
  calendars: Calendar[];
}

export interface Settings {
  version: typeof SETTINGS_VERSION;
  /** Origins of Krabbe instances the bridge talks to, e.g. `https://krabbe.hpi.church`. */
  instances: string[];
  accounts: Account[];
  defaults: { countAllDay: boolean };
}

export const newId = (): string => crypto.randomUUID();

export function defaultSettings(): Settings {
  return { version: SETTINGS_VERSION, instances: [DEFAULT_INSTANCE], accounts: [], defaults: { countAllDay: false } };
}

/** `https://Host:8080/path?q` → `https://host:8080`. Throws for anything that isn't http(s). */
export function normalizeInstance(url: string): string {
  const u = new URL(url.trim());
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(`Unsupported URL scheme: ${u.protocol}`);
  return u.origin;
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

export function countsAllDay(calendar: Pick<Calendar, 'allDay'>, settings: Pick<Settings, 'defaults'>): boolean {
  return calendar.allDay === 'inherit' ? settings.defaults.countAllDay : calendar.allDay === 'count';
}

/** Refreshes an account's calendar list, keeping ids and preferences of calendars that still exist. */
export function mergeDiscovered(
  existing: Calendar[],
  discovered: { url: string; name: string; color?: string }[],
): Calendar[] {
  return discovered.map((d) => {
    const old = existing.find((c) => c.url === d.url);
    return {
      id: old?.id ?? newId(),
      url: d.url,
      name: d.name,
      ...(d.color ? { color: d.color } : {}),
      enabled: old?.enabled ?? true,
      allDay: old?.allDay ?? 'inherit',
    };
  });
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

/** Turns whatever is in storage (v2, v3, garbage) into valid v3 settings. Never throws. */
export function migrate(raw: Record<string, unknown>): Settings {
  const out = defaultSettings();

  if (raw.version === SETTINGS_VERSION) {
    if (Array.isArray(raw.instances)) {
      out.instances = [...new Set(raw.instances.flatMap((i) => tryNormalize(i)))];
    }
    if (isObj(raw.defaults)) out.defaults.countAllDay = raw.defaults.countAllDay === true;
  } else if (typeof raw.krabbeUrl === 'string') {
    // v2: one instance; the default stays so switching back needs no setup.
    out.instances = [...new Set([...out.instances, ...tryNormalize(raw.krabbeUrl)])];
  }

  // v2 had no "enabled", only the last picker selection.
  const selected = Array.isArray(raw.selectedCalendars) ? new Set(raw.selectedCalendars) : null;
  const accounts = Array.isArray(raw.accounts) ? raw.accounts.filter(isObj) : [];
  out.accounts = accounts.map((a) => ({
    id: str(a.id) || newId(),
    label: str(a.label),
    serverUrl: str(a.serverUrl),
    username: str(a.username),
    password: str(a.password),
    calendars: (Array.isArray(a.calendars) ? a.calendars.filter(isObj) : []).map((c): Calendar => {
      const url = str(c.url);
      const color = str(c.color);
      return {
        id: str(c.id) || newId(),
        url,
        name: str(c.name, url),
        ...(color ? { color } : {}),
        enabled: typeof c.enabled === 'boolean' ? c.enabled : selected ? selected.has(url) : true,
        allDay: isAllDayMode(c.allDay) ? c.allDay : c.countAllDay === true ? 'count' : 'inherit',
      };
    }),
  }));
  return out;
}

function tryNormalize(v: unknown): string[] {
  try {
    return typeof v === 'string' ? [normalizeInstance(v)] : [];
  } catch {
    return [];
  }
}

function isAllDayMode(v: unknown): v is AllDayMode {
  return v === 'inherit' || v === 'count' || v === 'ignore';
}

const V2_KEYS = ['krabbeUrl', 'selectedCalendars'];

export async function getSettings(): Promise<Settings> {
  const raw = (await ext.storage.local.get(null)) as Record<string, unknown>;
  const settings = migrate(raw);
  if (raw.version !== SETTINGS_VERSION) {
    await ext.storage.local.set({ ...settings });
    await ext.storage.local.remove(V2_KEYS);
  }
  return settings;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await ext.storage.local.set({ ...settings });
}
