import ICAL from 'ical.js';
import type { BusyInterval } from './types.ts';

export interface ExtractStats {
  /** Instances overlapping the range, before the busy filters (like the VEVENTs of a server-side expand). */
  instances: number;
  /** Set when a recurring event hit MAX_INSTANCES and was cut short. */
  truncated: boolean;
}

export interface ExtractOptions {
  /** Whether all-day events (VALUE=DATE) count as busy. */
  countAllDay: boolean;
  /** The poll's IANA zone: used for floating times, all-day events and unknown TZIDs. */
  timezone: string;
  /** Requested range, epoch ms, end exclusive: recurrences are expanded up to it, instances outside are dropped. */
  rangeStart: number;
  rangeEnd: number;
  /** Filled in when given. */
  stats?: ExtractStats;
}

interface Prop {
  params: Record<string, string>;
  value: string;
}

const DAY_MS = 86_400_000;
/** Instances generated per recurring event before giving up, so a broken rule can't hang the background. */
export const MAX_INSTANCES = 50_000;

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

interface Time {
  epoch: number;
  allDay: boolean;
  /** Wall-clock fields expressed as if UTC. */
  wall: number;
  /** Zone the wall clock is in; null for UTC times. */
  zone: string | null;
}

function parseTimeValue(value: string, params: Record<string, string>, fallbackZone: string): Time | null {
  const m = /^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?)?(Z)?$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4] ?? '0', m[5] ?? '0', m[6] ?? '0'].map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  const allDay = params['VALUE'] === 'DATE' || m[4] === undefined;
  if (m[7]) return { epoch: wall, allDay, wall, zone: null };
  const zone = allDay ? fallbackZone : resolveZone(params['TZID'], fallbackZone);
  return { epoch: wallToEpoch(wall, zone), allDay, wall, zone };
}

function parseTime(prop: Prop, fallbackZone: string): Time | null {
  return parseTimeValue(prop.value, prop.params, fallbackZone);
}

/** Every comma-separated value of every occurrence of a multi-valued property (RDATE, EXDATE). */
function listValues(props: Props, name: string): { value: string; params: Record<string, string> }[] {
  return (props.get(name) ?? []).flatMap((p) =>
    p.value.split(',').map((value) => ({ value: value.trim(), params: p.params })),
  );
}

function parseDuration(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m) return null;
  const [w, d, h, mi, s] = m.slice(2).map((x) => Number(x ?? 0));
  const ms = (((w * 7 + d) * 24 + h) * 60 + mi) * 60_000 + s * 1000;
  return m[1] === '-' ? -ms : ms;
}

type Props = Map<string, Prop[]>;

const first = (props: Props, name: string) => props.get(name)?.[0];
const upper = (props: Props, name: string) => first(props, name)?.value.trim().toUpperCase();

interface Instance {
  start: number;
  end: number;
  allDay: boolean;
  /** The VEVENT the instance comes from; TRANSP and STATUS are read from it. */
  props: Props;
}

/** DTSTART plus DTEND, DURATION or the default length. */
function eventTiming(props: Props, timezone: string): { start: Time; end: number } | null {
  const dtstart = first(props, 'DTSTART');
  const start = dtstart ? parseTime(dtstart, timezone) : null;
  if (!start) return null;

  let end: number;
  const dtend = first(props, 'DTEND');
  const duration = first(props, 'DURATION');
  const parsedEnd = dtend ? parseTime(dtend, timezone) : null;
  const parsedDur = duration ? parseDuration(duration.value) : null;
  if (parsedEnd) end = parsedEnd.epoch;
  else if (parsedDur !== null) end = start.epoch + parsedDur;
  else if (start.allDay) end = addDays(start.epoch, 1, timezone);
  else end = start.epoch;
  if (end < start.epoch) end = start.epoch;
  return { start, end };
}

/** Local midnight `days` days later (DST-safe), given a local-midnight epoch. */
function addDays(startEpoch: number, days: number, timeZone: string): number {
  const wall = startEpoch + zoneOffset(startEpoch, timeZone) + days * DAY_MS;
  return wallToEpoch(wall, timeZone);
}

/** Wall-clock fields of `epoch` in `zone` (or UTC), expressed as if UTC. */
function toWall(epoch: number, zone: string | null): number {
  return zone ? epoch + zoneOffset(epoch, zone) : epoch;
}

/**
 * Instances of a master with RRULE and/or RDATE, minus EXDATEs and the instances in `overridden`.
 * The rule runs on DTSTART's wall clock, so a weekly 10:00 meeting stays at 10:00 across DST.
 */
function expandMaster(master: Props, overridden: Set<number>, opts: ExtractOptions): Instance[] {
  const timing = eventTiming(master, opts.timezone);
  if (!timing) return [];
  const { start, end } = timing;
  const tz = opts.timezone;
  // All-day events keep their length in days, timed ones in real time.
  const days = Math.round((end - start.epoch) / DAY_MS);
  const instanceEnd = (s: number) => (start.allDay ? addDays(s, days, tz) : s + (end - start.epoch));

  const skip = new Set(overridden);
  for (const { value, params } of listValues(master, 'EXDATE')) {
    const t = parseTimeValue(value, params, tz);
    if (t) skip.add(t.epoch);
  }

  const out: Instance[] = [];
  const seen = new Set<number>();
  const add = (s: number, e: number) => {
    if (seen.has(s)) return;
    seen.add(s);
    if (!skip.has(s)) out.push({ start: s, end: Math.max(e, s), allDay: start.allDay, props: master });
  };

  const rrule = first(master, 'RRULE');
  if (!rrule) add(start.epoch, end);
  else {
    let recur;
    try {
      recur = ICAL.Recur.fromString(rrule.value.trim());
    } catch {
      // Unparseable rule: keep DTSTART, as before the local expansion.
      recur = ICAL.Recur.fromString('FREQ=DAILY;COUNT=1');
    }
    // UNTIL is checked here in epoch ms: ical.js would compare a UTC UNTIL to the zoneless wall clock.
    let until = Infinity;
    const untilMatch = /(?:^|;)UNTIL=([^;]+)/i.exec(rrule.value);
    const untilTime = untilMatch ? parseTimeValue(untilMatch[1], start.zone ? { TZID: start.zone } : {}, tz) : null;
    if (untilTime) until = untilTime.allDay && !start.allDay ? addDays(untilTime.epoch, 1, tz) - 1 : untilTime.epoch;
    recur.until = null;

    const w = new Date(start.wall);
    const iterator = recur.iterator(
      ICAL.Time.fromData({
        year: w.getUTCFullYear(),
        month: w.getUTCMonth() + 1,
        day: w.getUTCDate(),
        hour: w.getUTCHours(),
        minute: w.getUTCMinutes(),
        second: w.getUTCSeconds(),
        isDate: start.allDay,
      }),
    );
    for (let n = 0; ; n++) {
      if (n >= MAX_INSTANCES) {
        if (opts.stats) opts.stats.truncated = true;
        break;
      }
      const t = iterator.next();
      if (!t) break;
      const wall = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
      const s = start.zone ? wallToEpoch(wall, start.zone) : wall;
      if (s > until || s >= opts.rangeEnd) break;
      add(s, instanceEnd(s));
    }
  }

  for (const { value, params } of listValues(master, 'RDATE')) {
    const [from, to] = value.split('/');
    const s = parseTimeValue(from, params, tz);
    if (!s) continue;
    // VALUE=PERIOD: start/end or start/duration.
    const periodEnd = to ? (parseTimeValue(to, params, tz)?.epoch ?? s.epoch + (parseDuration(to) ?? NaN)) : NaN;
    add(s.epoch, Number.isFinite(periodEnd) ? periodEnd : instanceEnd(s.epoch));
  }
  return out;
}

function singleInstance(props: Props, timezone: string): Instance | null {
  const timing = eventTiming(props, timezone);
  return timing && { start: timing.start.epoch, end: timing.end, allDay: timing.start.allDay, props };
}

/** Top-level VEVENTs of a calendar object, each property kept with all its occurrences. */
function parseEvents(ics: string): Props[] {
  const events: Props[] = [];
  const stack: string[] = [];
  let props: Props | null = null;

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
        events.push(props);
        props = null;
      }
      stack.pop();
    } else if (props && stack[stack.length - 1] === 'VEVENT') {
      const list = props.get(name);
      if (list) list.push(prop);
      else props.set(name, [prop]);
    }
  }
  return events;
}

/** Each master (no RECURRENCE-ID) and its overrides; events without a UID stand alone. */
function groupByUid(events: Props[]): { master?: Props; overrides: Props[] }[] {
  const groups = new Map<string | Props, { master?: Props; overrides: Props[] }>();
  for (const props of events) {
    const key = first(props, 'UID')?.value.trim() || props;
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { overrides: [] }));
    if (props.has('RECURRENCE-ID')) group.overrides.push(props);
    else if (!group.master) group.master = props;
  }
  return [...groups.values()];
}

export function extractBusy(ics: string, opts: ExtractOptions): BusyInterval[] {
  const instances: Instance[] = [];
  for (const { master, overrides } of groupByUid(parseEvents(ics))) {
    // An override replaces its instance wherever it moved to, so it counts on its own.
    const overridden = new Set<number>();
    for (const o of overrides) {
      const rid = parseTime(first(o, 'RECURRENCE-ID')!, opts.timezone);
      if (rid) overridden.add(rid.epoch);
      const instance = singleInstance(o, opts.timezone);
      if (instance) instances.push(instance);
    }
    if (!master) continue;
    if (master.has('RRULE') || master.has('RDATE')) instances.push(...expandMaster(master, overridden, opts));
    else {
      const instance = singleInstance(master, opts.timezone);
      if (instance) instances.push(instance);
    }
  }

  const result: BusyInterval[] = [];
  for (const i of instances) {
    // Zero-length instances overlap when they start inside the range.
    if (i.start >= opts.rangeEnd || Math.max(i.end, i.start + 1) <= opts.rangeStart) continue;
    if (opts.stats) opts.stats.instances++;
    if (upper(i.props, 'TRANSP') === 'TRANSPARENT' || upper(i.props, 'STATUS') === 'CANCELLED') continue;
    if (i.allDay && !opts.countAllDay) continue;
    if (i.end > i.start) result.push({ start: i.start, end: i.end });
  }
  return result;
}
