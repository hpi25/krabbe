# CalDAV conflict extension — design

## Goal

Let a user remove every availability slot that conflicts with an event in their
CalDAV calendars. Calendar credentials and calendar data stay inside the browser
extension: they never reach krabbe's server and are not readable by the page.

## Scope

- New Firefox-only extension (Manifest V3) in `calendar-extension/`, next to the
  existing `browser-extension/` (which stays untouched).
- Works on `https://krabbe.hpi.church/*` and `http://localhost:1234/*` (dev).
- Only polls with specific dates (`HHmm-DDMMYYYY` times). Weekly polls have no
  real dates to compare against; the bridge does not announce itself for them.
- Out of scope: Chrome, writing to calendars, recurrence expansion on the client.

## Already done: page side of the bridge (commit fe38f12)

`useCalendarBridge` in the availability editor speaks this protocol over
`window.postMessage` (same window, same origin):

| Direction | Message |
| --- | --- |
| page → ext | `{ source: 'krabbe', type: 'calendar-bridge:ready', timeStart, timeEnd, timezone }` |
| ext → page | `{ source: 'krabbe-extension', type: 'calendar-bridge:ping' }` |
| ext → page | `{ source: 'krabbe-extension', type: 'calendar-bridge:busy', busy: [{ start, end }] }` |
| page → ext | `{ source: 'krabbe', type: 'calendar-bridge:applied', removed }` |

Any 15-minute slot that overlaps a busy interval is removed.

### Frontend addition

Render `<div data-calendar-bridge />` inside the specific-dates integrations row
of `AvailabilityEditor` (next to the Google/Outlook buttons). It is empty without
the extension and gives the content script a stable place to mount.

## Extension components

### Settings tab (`options_ui`, `open_in_tab: true`)

- List of CalDAV accounts. Add / remove accounts: label, server URL, username,
  password (app password recommended).
- On add: `browser.permissions.request({ origins: [<server origin>/*] })`, then
  calendar discovery. Failure shows the error inline and does not save.
- Per discovered calendar: display name, colour swatch, and a
  "count all-day events" checkbox (default off).
- "Refresh calendars" per account re-runs discovery, keeping existing settings
  for calendars that still exist.
- On removing an account: also release its host permission.

### Storage (`browser.storage.local`)

```ts
accounts: Array<{
  id: string            // random uuid
  label: string
  serverUrl: string
  username: string
  password: string
  calendars: Array<{
    url: string         // absolute calendar collection URL
    name: string
    color?: string
    countAllDay: boolean
  }>
}>
selectedCalendars: string[]   // calendar URLs last chosen in the in-page picker
```

### Background script (event page, `background.scripts`)

Handles runtime messages from the content script and options page:

- `discover({ serverUrl, username, password })` → calendars.
  `PROPFIND` `current-user-principal` → `PROPFIND` `calendar-home-set` →
  `PROPFIND` depth 1 on the home set, keeping collections whose `resourcetype`
  includes `C:calendar` and whose `supported-calendar-component-set` includes
  `VEVENT` (or is absent). Reads `displayname` and `apple:calendar-color`.
- `fetchBusy({ calendarUrls, timeStart, timeEnd })` → `{ busy, errors }`.
  One `REPORT` `calendar-query` per calendar with `comp-filter VEVENT` +
  `time-range`, requesting `calendar-data` with `<C:expand start end/>` so the
  server expands recurrences into UTC instances. Calendars are fetched in
  parallel; one failing calendar is reported in `errors` and does not block the
  rest.
- Requests use `Authorization: Basic …` and `credentials: 'omit'`. Host
  permissions let the extension bypass CORS.

### iCalendar parsing (pure module, unit tested)

From each returned VCALENDAR, for each VEVENT:

- Unfold lines (RFC 5545 §3.1).
- Skip if `STATUS:CANCELLED` or `TRANSP:TRANSPARENT`.
- `DTSTART`/`DTEND` or `DTSTART` + `DURATION`; no end → zero length for
  date-times, one day for dates.
- Date-time values: `…Z` is UTC; `TZID=` values are resolved with
  `Intl.DateTimeFormat` for that zone; floating times use the poll timezone.
- All-day (`VALUE=DATE`) events: only kept when the calendar's `countAllDay`
  is on; they block the whole day in the poll's timezone.

### Content script

- Listens for `calendar-bridge:ready`; sends `calendar-bridge:ping` on load in
  case it missed it.
- When ready and `[data-calendar-bridge]` exists, mounts a shadow-DOM UI there:
  - Button "Remove calendar conflicts".
  - Clicking opens a picker: every calendar from every account, grouped by
    account, pre-checked from `selectedCalendars`, plus a "Remove conflicts"
    confirm button and a link to the settings tab.
  - No accounts configured → the button opens the settings tab instead.
- Confirm saves `selectedCalendars`, asks the background for busy intervals,
  posts `calendar-bridge:busy`, and shows "Removed N slots" from the
  `applied` reply, plus any per-calendar errors.

## Error handling

- Wrong credentials (401) / unreachable server: shown in settings on add, and
  per calendar in the picker on fetch.
- Server that ignores `<C:expand>`: recurring events only count on their first
  occurrence. Documented limitation (Nextcloud, Radicale and iCloud support it).

## Testing

- `bun test` for the iCalendar parser and the CalDAV XML response parser
  (fixtures from Nextcloud / Radicale-style responses).
- Manual: load via `about:debugging` against a local Radicale instance and the
  frontend dev server.
