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
 * Remove every scored time where any of its 15 minute slots overlaps a busy interval.
 * `getSlotStarts` returns the epoch milliseconds a time stands for, e.g. one per checked week for weekday times.
 */
export const removeBusyTimes = (
  preferences: TimeScore[],
  busy: BusyInterval[],
  getSlotStarts: (time: string) => number[],
): TimeScore[] =>
  preferences.filter(({ time }) => !getSlotStarts(time).some(slotStart =>
    busy.some(b => slotStart < b.end && slotStart + SLOT_MS > b.start)
  ))
