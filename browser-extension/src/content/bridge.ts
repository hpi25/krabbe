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

/** Status text shown after removing conflicts: what was searched, what was found, what changed. */
export function summarize(i: SummaryInput): string {
  const fmt = new Intl.DateTimeFormat(i.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: i.timezone });
  const events = i.stats.reduce((n, s) => n + s.events, 0);
  const intervals = i.stats.reduce((n, s) => n + s.intervals, 0);
  const lines = [
    `Searched ${fmt.format(new Date(i.timeStart))} – ${fmt.format(new Date(i.timeEnd))}`,
    ...i.stats.map((s) => `${s.name}: ${plural(s.events, 'event')} → ${s.intervals} busy`),
    `Total: ${plural(events, 'event')}, ${plural(intervals, 'busy interval')}`,
    i.removed === null ? "Page didn't confirm" : `Removed ${plural(i.removed, 'slot')}`,
  ];
  if (i.removed === 0 && intervals > 0) lines.push('Only slots you have already filled in are cleared.');
  return [...lines, ...i.errors].join('\n');
}
