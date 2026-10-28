import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'

/**
 * Extension bridge
 *
 * Talks to the Krabbe browser extension, which reads the user's CalDAV calendars.
 * The extension does all calendar fetching itself, so calendar credentials and
 * event details never touch this page or the server: it only ever answers with
 * calendar names (for the picker) and the start/end of busy times.
 *
 * Protocol v1, mirrored from `browser-extension/src/protocol.ts`. All messages go
 * through window.postMessage on the page's own origin.
 *
 * page -> extension `{ source: 'krabbe', requestId, type, ...params }`
 *   `hello` | `list-calendars` | `open-settings`
 *   | `fetch-busy { calendarIds, timeStart, timeEnd, timezone }` (ISO 8601 instants)
 * extension -> page
 *   `{ source: 'krabbe-extension', type: 'present', version }` when the extension loads
 *   `{ source: 'krabbe-extension', type: 'response', requestId, ok: true, data }`
 *   `{ source: 'krabbe-extension', type: 'response', requestId, ok: false, error }`
 */

const HANDSHAKE_TIMEOUT_MS = 1500
// CalDAV servers get 20s per request in the extension; leave room for a few
const REQUEST_TIMEOUT_MS = 90_000

const IncomingMessage = z.discriminatedUnion('type', [
  z.object({
    source: z.literal('krabbe-extension'),
    type: z.literal('present'),
    version: z.number(),
  }),
  z.object({
    source: z.literal('krabbe-extension'),
    type: z.literal('response'),
    requestId: z.string(),
    ok: z.boolean(),
    data: z.unknown().optional(),
    error: z.string().optional(),
  }),
])

const HelloData = z.object({ version: z.number() })

const ExtensionCalendar = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional(),
  account: z.string(),
  enabled: z.boolean(),
})
export type ExtensionCalendar = z.infer<typeof ExtensionCalendar>
const CalendarsData = z.object({ calendars: z.array(ExtensionCalendar) })

const CalendarErrorCode = z.enum(['auth', 'not-found', 'timeout', 'network', 'server', 'unknown']).catch('unknown')
export type CalendarErrorCode = z.infer<typeof CalendarErrorCode>
const BusyData = z.object({
  busy: z.array(z.object({ start: z.number(), end: z.number() })),
  errors: z.array(z.object({ calendarId: z.string(), code: CalendarErrorCode })),
  stats: z.array(z.object({ calendarId: z.string(), events: z.number(), intervals: z.number() })),
})
export type BusyData = z.infer<typeof BusyData>

export class ExtensionError extends Error {
  constructor(public code: string) {
    super(`Extension request failed: ${code}`)
    this.name = 'ExtensionError'
  }
}

export type ExtensionStatus = 'checking' | 'present' | 'absent'

let nextRequestId = 0

interface Pending {
  resolve: (data: unknown) => void
  reject: (e: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

export const useExtensionBridge = () => {
  const [status, setStatus] = useState<ExtensionStatus>('checking')
  const pending = useRef(new Map<string, Pending>())

  const request = useCallback((type: string, params: Record<string, unknown> = {}, timeoutMs = REQUEST_TIMEOUT_MS) =>
    new Promise<unknown>((resolve, reject) => {
      // Only needs to be unique within this page; crypto.randomUUID is missing outside secure contexts (plain http)
      const requestId = `${Date.now()}-${nextRequestId++}`
      const timeout = setTimeout(() => {
        pending.current.delete(requestId)
        reject(new ExtensionError('timeout'))
      }, timeoutMs)
      pending.current.set(requestId, { resolve, reject, timeout })
      window.postMessage({ ...params, source: 'krabbe', requestId, type }, window.location.origin)
    }), [])

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin) return
      const parsed = IncomingMessage.safeParse(e.data)
      if (!parsed.success) return
      const message = parsed.data

      // Extension loaded after our hello timed out
      if (message.type === 'present') return setStatus('present')

      const entry = pending.current.get(message.requestId)
      if (!entry) return
      pending.current.delete(message.requestId)
      clearTimeout(entry.timeout)
      if (message.ok) entry.resolve(message.data)
      else entry.reject(new ExtensionError(message.error ?? 'unknown'))
    }
    window.addEventListener('message', handleMessage)

    request('hello', {}, HANDSHAKE_TIMEOUT_MS)
      .then(data => setStatus(HelloData.safeParse(data).success ? 'present' : 'absent'))
      .catch(() => setStatus(s => s === 'present' ? s : 'absent'))

    const requests = pending.current
    return () => {
      window.removeEventListener('message', handleMessage)
      requests.forEach(p => clearTimeout(p.timeout))
      requests.clear()
    }
  }, [request])

  const listCalendars = useCallback(async () =>
    CalendarsData.parse(await request('list-calendars')).calendars, [request])

  const fetchBusy = useCallback(async (params: { calendarIds: string[], timeStart: string, timeEnd: string, timezone: string }) =>
    BusyData.parse(await request('fetch-busy', params)), [request])

  const openSettings = useCallback(async () => { await request('open-settings') }, [request])

  return { status, listCalendars, fetchBusy, openSettings }
}
