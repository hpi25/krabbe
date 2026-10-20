import type { BusyInterval } from './types.ts';

export interface ExtractOptions {
  /** Whether all-day events (VALUE=DATE) count as busy. */
  countAllDay: boolean;
  /** The poll's IANA zone: used for floating times, all-day events and unknown TZIDs. */
  timezone: string;
}

interface Prop {
  params: Record<string, string>;
  value: string;
}

const DAY_MS = 86_400_000;

function unfold(ics: string): string[] {
  return ics.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
}

/** Split `NAME;P=V;P="V:x":value` at the first colon outside quotes. */
function parseLine(line: string): { name: string; prop: Prop } | null {
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ':' && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts: string[] = [];
  let cur = '';
  inQuotes = false;
  for (const c of head) {
    if (c === '"') inQuotes = !inQuotes;
    if (c === ';' && !inQuotes) {
      parts.push(cur);
      cur = '';
    } else cur += c;
  }
  parts.push(cur);
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"(.*)"$/, '$1');
  }
  return { name: parts[0].toUpperCase(), prop: { params, value } };
}

function zoneOffset(epoch: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(epoch));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(epoch / 1000) * 1000;
}

/** Convert wall-clock fields (expressed as if UTC) in `timeZone` to a real epoch. */
function wallToEpoch(wall: number, timeZone: string): number {
  let guess = wall;
  for (let i = 0; i < 2; i++) guess = wall - zoneOffset(guess, timeZone);
  return guess;
}

function resolveZone(tzid: string | undefined, fallback: string): string {
  if (!tzid) return fallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tzid });
    return tzid;
  } catch {
    return fallback;
  }
}

function parseTime(prop: Prop, fallbackZone: string): { epoch: number; allDay: boolean } | null {
  const m = /^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?)?(Z)?$/.exec(prop.value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4] ?? '0', m[5] ?? '0', m[6] ?? '0'].map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  const allDay = prop.params['VALUE'] === 'DATE' || m[4] === undefined;
  if (m[7]) return { epoch: wall, allDay };
  const zone = allDay ? fallbackZone : resolveZone(prop.params['TZID'], fallbackZone);
  return { epoch: wallToEpoch(wall, zone), allDay };
}

function parseDuration(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m) return null;
  const [w, d, h, mi, s] = m.slice(2).map((x) => Number(x ?? 0));
  const ms = (((w * 7 + d) * 24 + h) * 60 + mi) * 60_000 + s * 1000;
  return m[1] === '-' ? -ms : ms;
}

function eventToInterval(props: Map<string, Prop>, opts: ExtractOptions): BusyInterval | null {
  if (props.get('TRANSP')?.value.trim().toUpperCase() === 'TRANSPARENT') return null;
  if (props.get('STATUS')?.value.trim().toUpperCase() === 'CANCELLED') return null;
  const dtstart = props.get('DTSTART');
  if (!dtstart) return null;
  const start = parseTime(dtstart, opts.timezone);
  if (!start) return null;
  if (start.allDay && !opts.countAllDay) return null;

  let end: number;
  const dtend = props.get('DTEND');
  const duration = props.get('DURATION');
  const parsedEnd = dtend ? parseTime(dtend, opts.timezone) : null;
  const parsedDur = duration ? parseDuration(duration.value) : null;
  if (parsedEnd) end = parsedEnd.epoch;
  else if (parsedDur !== null) end = start.epoch + parsedDur;
  else if (start.allDay) end = nextDay(start.epoch, opts.timezone);
  else end = start.epoch;
  if (end < start.epoch) end = start.epoch;
  return { start: start.epoch, end };
}

/** Start of the following local day (DST-safe), given a local-midnight epoch. */
function nextDay(startEpoch: number, timeZone: string): number {
  const wall = startEpoch + zoneOffset(startEpoch, timeZone) + DAY_MS;
  return wallToEpoch(wall, timeZone);
}

export function extractBusy(ics: string, opts: ExtractOptions): BusyInterval[] {
  const result: BusyInterval[] = [];
  const stack: string[] = [];
  let props: Map<string, Prop> | null = null;

  for (const line of unfold(ics)) {
    if (!line) continue;
    const parsed = parseLine(line);
    if (!parsed) continue;
    const { name, prop } = parsed;
    if (name === 'BEGIN') {
      const kind = prop.value.trim().toUpperCase();
      stack.push(kind);
      if (kind === 'VEVENT' && stack[stack.length - 2] === 'VCALENDAR') props = new Map();
    } else if (name === 'END') {
      const kind = prop.value.trim().toUpperCase();
      if (kind === 'VEVENT' && props) {
        const interval = eventToInterval(props, opts);
        if (interval) result.push(interval);
        props = null;
      }
      stack.pop();
    } else if (props && stack[stack.length - 1] === 'VEVENT' && !props.has(name)) {
      props.set(name, prop);
    }
  }
  return result;
}
