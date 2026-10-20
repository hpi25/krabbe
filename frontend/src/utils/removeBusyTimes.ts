import { parseSpecificDate } from './convertTimesToDates'
import { TimeScore } from '../config/api'

// Each time in the grid represents a 15 minute slot
const SLOT_MS = 15 * 60 * 1000

export interface BusyInterval {
  /** Epoch milliseconds, inclusive */
  start: number
  /** Epoch milliseconds, exclusive */
  end: number
}

/**
 * Remove every scored time whose 15 minute slot overlaps a busy interval.
 * Only works with specific date (`HHmm-DDMMYYYY`) times.
 */
export const removeBusyTimes = (preferences: TimeScore[], busy: BusyInterval[]): TimeScore[] =>
  preferences.filter(({ time }) => {
    const slotStart = parseSpecificDate(time).epochMilliseconds
    const slotEnd = slotStart + SLOT_MS
    return !busy.some(b => slotStart < b.end && slotEnd > b.start)
  })
