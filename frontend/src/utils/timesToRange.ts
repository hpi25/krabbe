import { Temporal } from '@js-temporal/polyfill'

/**
 * Convert the times of an event back into the dates and time range used to create it.
 * Dates are `YYYY-MM-DD` for specific dates, or the day of the week `1`-`7` for weekly events.
 */
export const timesToRange = (times: string[], timezone: string) => {
  const dates = new Set<string>()
  const hours = new Set<number>()

  times.forEach(time => {
    if (time.includes('~')) {
      // Weekly format `HHmm~d`, already in the event timezone
      const day = Number(time.split('~')[1])
      dates.add((day === 0 ? 7 : day).toString())
      hours.add(Number(time.substring(0, 2)))
    } else {
      // Specific format `HHmm-DDMMYYYY` in UTC
      const dateTime = Temporal.ZonedDateTime.from({
        timeZone: 'UTC',
        hour: Number(time.substring(0, 2)),
        minute: Number(time.substring(2, 4)),
        day: Number(time.substring(5, 7)),
        month: Number(time.substring(7, 9)),
        year: Number(time.substring(9)),
      }).withTimeZone(timezone)
      dates.add(dateTime.toPlainDate().toString())
      hours.add(dateTime.hour)
    }
  })

  if (hours.size === 0 || hours.size === 24) {
    return { dates: [...dates], time: { start: hours.size ? 0 : 9, end: hours.size ? 24 : 17 } }
  }

  // Find the first hour of the range, which can wrap around midnight
  const start = [...hours].find(h => !hours.has((h + 23) % 24)) ?? 0
  let length = 0
  while (hours.has((start + length) % 24)) length++
  const end = start + length > 24 ? start + length - 24 : start + length

  return { dates: [...dates], time: { start, end } }
}
