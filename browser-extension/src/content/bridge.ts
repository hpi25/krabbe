export interface ReadyInfo {
  timeStart: string;
  timeEnd: string;
  timezone: string;
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

export interface SummaryInput {
  timeStart: string;
  timeEnd: string;
  timezone: string;
  stats: { name: string; events: number; intervals: number }[];
  /** Already formatted as `<calendar>: <message>`. */
  errors: string[];
  /** Slots the page cleared, or null if it never confirmed. */
  removed: number | null;
  locale?: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export interface Summary {
  /** "Removed N slots", or a note that the page never confirmed. */
  headline: string;
  /** The searched range, formatted in the poll's zone. */
  range: string;
  calendars: SummaryInput['stats'];
  total: { events: number; intervals: number };
  /** Why nothing was removed even though busy intervals were found. */
  hint: string | undefined;
  errors: string[];
}

/** What to show after removing conflicts: what was searched, what was found, what changed. */
export function summarize(i: SummaryInput): Summary {
  const fmt = new Intl.DateTimeFormat(i.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: i.timezone });
  const total = {
    events: i.stats.reduce((n, s) => n + s.events, 0),
    intervals: i.stats.reduce((n, s) => n + s.intervals, 0),
  };
  return {
    headline: i.removed === null ? "Page didn't confirm" : `Removed ${plural(i.removed, 'slot')}`,
    range: `${fmt.format(new Date(i.timeStart))} – ${fmt.format(new Date(i.timeEnd))}`,
    calendars: i.stats,
    total,
    hint: i.removed === 0 && total.intervals > 0 ? 'Only slots you have already filled in are cleared.' : undefined,
    errors: i.errors,
  };
}
