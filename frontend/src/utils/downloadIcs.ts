import { Temporal } from '@js-temporal/polyfill'

interface IcsOptions {
  /** Start of the meeting */
  start: Temporal.ZonedDateTime
  /** Meeting duration in minutes */
  duration: number
  /** Calendar entry title */
  title: string
  /** Repeat every week, keeping the wall-clock time in `start`'s timezone */
  weekly: boolean
}

// Escape text values according to RFC 5545 section 3.3.11
const escapeText = (text: string) => text
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')
  .replace(/\r?\n/g, '\\n')

// Fold lines longer than 75 characters (RFC 5545 section 3.1)
const foldLine = (line: string) => line.length <= 75
  ? line
  : (line.match(/.{1,74}/g) ?? [line]).join('\r\n ')

const pad = (n: number, length = 2) => String(n).padStart(length, '0')

// `YYYYMMDDTHHmmss` in the date-time's own timezone
const formatLocal = (dt: Temporal.ZonedDateTime) =>
  `${pad(dt.year, 4)}${pad(dt.month)}${pad(dt.day)}T${pad(dt.hour)}${pad(dt.minute)}${pad(dt.second)}`

const formatUtc = (dt: Temporal.ZonedDateTime) => `${formatLocal(dt.withTimeZone('UTC'))}Z`

// 128 random bits as hex; crypto.randomUUID is missing outside secure contexts (plain http)
const randomUid = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('')

export const generateIcs = ({ start, duration, title, weekly }: IcsOptions): string => {
  // A weekly meeting starts at its next upcoming occurrence
  let first = start
  if (weekly) {
    const now = Temporal.Now.zonedDateTimeISO(start.timeZoneId)
    while (Temporal.ZonedDateTime.compare(first, now) < 0) {
      first = first.add({ weeks: 1 })
    }
  }
  const end = first.add({ minutes: duration })

  // Weekly meetings use a TZID so the time stays put across DST changes,
  // one-off meetings are pinned to UTC
  const dates = weekly
    ? [
      `DTSTART;TZID=${first.timeZoneId}:${formatLocal(first)}`,
      `DTEND;TZID=${end.timeZoneId}:${formatLocal(end)}`,
      'RRULE:FREQ=WEEKLY',
    ]
    : [
      `DTSTART:${formatUtc(first)}`,
      `DTEND:${formatUtc(end)}`,
    ]

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Krabbe//Best time//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${randomUid()}@krabbe`,
    `DTSTAMP:${formatUtc(Temporal.Now.zonedDateTimeISO('UTC'))}`,
    ...dates,
    `SUMMARY:${escapeText(title)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].map(foldLine).join('\r\n') + '\r\n'
}

export const downloadIcs = (options: IcsOptions) => {
  const blob = new Blob([generateIcs(options)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${options.title.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'event'}.ics`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
