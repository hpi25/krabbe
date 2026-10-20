import type { Account, CalendarSettings } from '../storage.ts';

/** Reduce a user-entered URL to its origin (no path, no trailing slash). */
export function normalizeKrabbeUrl(input: string): string {
  const { protocol, origin } = new URL(input.trim());
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(`Unsupported URL scheme: ${protocol}`);
  }
  return origin;
}

/** Apply freshly discovered calendars, preserving per-calendar flags by URL. */
export function mergeRefreshedCalendars(
  existing: CalendarSettings[],
  discovered: Pick<CalendarSettings, 'url' | 'name' | 'color'>[],
): CalendarSettings[] {
  const flags = new Map(existing.map((c) => [c.url, c.countAllDay]));
  return discovered.map((d) => ({
    url: d.url,
    name: d.name,
    color: d.color,
    countAllDay: flags.get(d.url) ?? false,
  }));
}

/** True if another account (not `removedAccountId`) shares the removed account's server origin. */
export function originStillUsed(accounts: Account[], removedAccountId: string): boolean {
  const removed = accounts.find((a) => a.id === removedAccountId);
  if (!removed) return false;
  const origin = new URL(removed.serverUrl).origin;
  return accounts.some((a) => a.id !== removedAccountId && new URL(a.serverUrl).origin === origin);
}
