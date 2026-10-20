import type { Settings } from '../storage.ts';

export interface ReadyInfo {
  timeStart: string;
  timeEnd: string;
  timezone: string;
}

export interface PickerCalendar {
  url: string;
  name: string;
  color?: string;
  checked: boolean;
}

export interface PickerGroup {
  label: string;
  calendars: PickerCalendar[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export function parseReady(data: unknown): ReadyInfo | null {
  if (!isObj(data) || data.source !== 'krabbe' || data.type !== 'calendar-bridge:ready') return null;
  const { timeStart, timeEnd, timezone } = data;
  if (typeof timeStart !== 'string' || typeof timeEnd !== 'string' || typeof timezone !== 'string') return null;
  return { timeStart, timeEnd, timezone };
}

export function parseApplied(data: unknown): number | null {
  if (!isObj(data) || data.source !== 'krabbe' || data.type !== 'calendar-bridge:applied') return null;
  return typeof data.removed === 'number' && Number.isFinite(data.removed) ? data.removed : null;
}

/** Stale selected URLs (calendars no longer in any account) are simply never rendered. */
export function pickerGroups(settings: Settings): PickerGroup[] {
  const selected = new Set(settings.selectedCalendars);
  return settings.accounts.map((a) => ({
    label: a.label,
    calendars: a.calendars.map((c) => ({ url: c.url, name: c.name, color: c.color, checked: selected.has(c.url) })),
  }));
}
