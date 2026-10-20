import type { PickerGroup } from '../messages.ts';
import type { Settings } from '../storage.ts';

/** Stale selected URLs (calendars no longer in any account) are simply never rendered. */
export function pickerGroups(settings: Settings): PickerGroup[] {
  const selected = new Set(settings.selectedCalendars);
  return settings.accounts.map((a) => ({
    label: a.label,
    calendars: a.calendars.map((c) => ({
      url: c.url,
      name: c.name,
      ...(c.color !== undefined ? { color: c.color } : {}),
      checked: selected.has(c.url),
    })),
  }));
}
