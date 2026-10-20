import { useEffect, useRef, useState } from 'react'
import { Temporal } from '@js-temporal/polyfill'
import { z } from 'zod'

import { TimeScore } from '/src/config/api'
import { removeBusyTimes } from '/src/utils/removeBusyTimes'

/**
 * Calendar bridge
 *
 * Lets a browser extension clear availability that conflicts with the user's
 * calendar. The extension does all calendar fetching itself, so calendar
 * credentials never touch this page or the server.
 *
 * Protocol (all messages via window.postMessage on the page's own origin):
 *
 * 1. page -> extension `{ source: 'krabbe', type: 'calendar-bridge:ready', timeStart, timeEnd, timezone }`
 *    Sent when the editor mounts, and in reply to a ping. Times are ISO 8601 instants.
 * 2. extension -> page `{ source: 'krabbe-extension', type: 'calendar-bridge:ping' }`
 *    Asks the page to resend `ready` (e.g. if the content script loaded late).
 * 3. extension -> page `{ source: 'krabbe-extension', type: 'calendar-bridge:busy', busy: [{ start, end }] }`
 *    `start`/`end` are ISO 8601 strings or epoch milliseconds.
 * 4. page -> extension `{ source: 'krabbe', type: 'calendar-bridge:applied', removed }`
 *    Number of scored times that were cleared.
 * 5. extension -> page `{ source: 'krabbe-extension', type: 'calendar-bridge:mounted' }`
 *    The extension's picker is on the page, so the page hides its install fallback.
 */

const instant = z.union([z.number(), z.string()])
  .transform(v => typeof v === 'number' ? v : Date.parse(v))
  .refine(v => Number.isFinite(v), 'Invalid date')

const IncomingMessage = z.discriminatedUnion('type', [
  z.object({
    source: z.literal('krabbe-extension'),
    type: z.literal('calendar-bridge:ping'),
  }),
  z.object({
    source: z.literal('krabbe-extension'),
    type: z.literal('calendar-bridge:mounted'),
  }),
  z.object({
    source: z.literal('krabbe-extension'),
    type: z.literal('calendar-bridge:busy'),
    busy: z.array(z.object({ start: instant, end: instant })),
  }),
])

interface UseCalendarBridgeProps {
  timezone: string
  timeStart?: Temporal.ZonedDateTime
  timeEnd?: Temporal.ZonedDateTime
  preferences: TimeScore[]
  onImport: (availability: TimeScore[]) => void
}

/**
 * Only active when `timeStart`/`timeEnd` are given, i.e. for specific date events.
 * Returns whether the extension has made itself known on this page.
 */
export const useCalendarBridge = ({ timezone, timeStart, timeEnd, preferences, onImport }: UseCalendarBridgeProps) => {
  // Keep latest values for the message listener without re-subscribing on every change
  const [hasExtension, setHasExtension] = useState(false)
  const latest = useRef({ preferences, onImport })
  latest.current = { preferences, onImport }

  const start = timeStart?.toInstant().toString()
  const end = timeEnd?.toInstant().toString()

  useEffect(() => {
    if (!start || !end) return

    const post = (message: Record<string, unknown>) =>
      window.postMessage({ source: 'krabbe', ...message }, window.location.origin)
    const announce = () => post({ type: 'calendar-bridge:ready', timeStart: start, timeEnd: end, timezone })

    const handleMessage = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin) return
      const parsed = IncomingMessage.safeParse(e.data)
      if (!parsed.success) return

      setHasExtension(true)
      if (parsed.data.type === 'calendar-bridge:mounted') return
      if (parsed.data.type === 'calendar-bridge:ping') return announce()

      const { preferences, onImport } = latest.current
      const remaining = removeBusyTimes(preferences, parsed.data.busy)
      onImport(remaining)
      post({ type: 'calendar-bridge:applied', removed: preferences.length - remaining.length })
    }

    window.addEventListener('message', handleMessage)
    announce()
    return () => window.removeEventListener('message', handleMessage)
  }, [start, end, timezone])

  return hasExtension
}
