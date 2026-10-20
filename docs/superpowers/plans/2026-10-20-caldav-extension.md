# CalDAV Conflict Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `browser-extension/` into a Manifest V3 extension that removes availability slots conflicting with the user's CalDAV calendars, via the existing page bridge.

**Architecture:** TypeScript sources in `browser-extension/src/`, bundled by esbuild per browser target. A service-worker-safe background script does all CalDAV traffic; a runtime-registered content script on the configured krabbe origin mounts a shadow-DOM picker into `[data-calendar-bridge]` and talks to the page over the `calendar-bridge:*` postMessage protocol (already implemented in `frontend/src/components/AvailabilityEditor/useCalendarBridge.ts`).

**Tech Stack:** Node 26, Yarn berry 4, TypeScript 6, esbuild, fast-xml-parser, `@types/webextension-polyfill` (types only), `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-20-caldav-extension-design.md`

## Global Constraints

- No bun anywhere (scripts, lockfiles, docs). Node 26 + Yarn berry; `browser-extension/package.json` has `"packageManager": "yarn@4.14.1"` and `.yarnrc.yml` with `nodeLinker: node-modules`.
- Only `src/platform.ts` references `browser`/`chrome`; everything else imports `ext` from it.
- Background code (`src/background/**`, `src/calendar/**`) must not use `window`, `document` or `DOMParser`.
- Default krabbe URL: `https://krabbe.hpi.church`. Gecko id: `krabbe-calendar@hpi.church`, `strict_min_version: "128.0"`. Extension name: `Krabbe`, version `2.0.0`.
- Credentials and calendar data live only in `ext.storage.local` and the background script; only `{ start, end }` busy intervals reach the page.
- Frontend changes stay within `AvailabilityEditor.tsx`; the frontend keeps its own yarn setup.
- Commit messages follow the repo owner's style: funny but informative, with the `Co-Authored-By` trailer.

## Review Focus

- **Server ignores `<C:expand>`** and returns a master VEVENT with `RRULE`: count the first occurrence, never throw. (Task 2)
- **Windows or unknown `TZID`** such as `W. Europe Standard Time`: fall back to the poll timezone; the event is not dropped. (Task 2)
- **One calendar fails** (401, network error, permission revoked): the other calendars' busy intervals are still applied, and the failure is shown next to that calendar. (Task 4)
- **Changing the krabbe URL:** the old content-script registration and the old host permission are removed. If the user denies permission for the new origin, the old URL stays in effect. (Tasks 4, 5)
- **Relative and redirected hrefs** (server URL given as `https://host/` that redirects via `/.well-known/caldav`, hrefs like `/remote.php/dav/calendars/u/work/`): every URL is resolved against the *response* URL. (Task 3)

---

### Task 1: Toolchain, MV3 manifest, platform shim, settings storage, popup

**Files:**
- Create: `browser-extension/package.json`, `.yarnrc.yml`, `tsconfig.json`, `build.mjs`
- Create: `browser-extension/src/platform.ts`, `src/manifest.ts`, `src/storage.ts`, `src/popup/popup.html`, `src/popup/popup.ts`
- Delete: `browser-extension/manifest.json`, `browser-extension/popup.html` (moved into `src/`)
- Modify: `browser-extension/.gitignore` (add `dist/`, `node_modules/`, `.yarn/`)
- Test: `browser-extension/test/manifest.test.ts`, `test/storage.test.ts`

**Interfaces:**
- Produces:
  - `ext` (`typeof import('webextension-polyfill')`) from `src/platform.ts`.
  - `buildManifest(target: 'firefox'): Record<string, unknown>` from `src/manifest.ts`.
  - From `src/storage.ts`:
    - `DEFAULT_KRABBE_URL = 'https://krabbe.hpi.church'`
    - `CalendarSettings { url: string; name: string; color?: string; countAllDay: boolean }`
    - `Account { id: string; label: string; serverUrl: string; username: string; password: string; calendars: CalendarSettings[] }`
    - `Settings { krabbeUrl: string; accounts: Account[]; selectedCalendars: string[] }`
    - `getSettings(): Promise<Settings>` (fills defaults) and `saveSettings(patch: Partial<Settings>): Promise<void>`
    - `originPattern(url: string): string`, e.g. `'https://krabbe.hpi.church/*'`; throws on non-http(s) URLs.
  - Scripts:
    - `yarn build` writes `dist/firefox/`.
    - `yarn test` runs `node --test test/`.
    - `yarn typecheck` runs `tsc --noEmit`.

- [ ] **Step 1:** Make sure you're on Node 26 (`node -v` prints `v26.*`; install with `fnm install 26 && fnm use 26` if needed). Run `corepack enable`, then `yarn init -2` in `browser-extension/` and add the deps: `typescript esbuild fast-xml-parser @types/webextension-polyfill @types/node`.
- [ ] **Step 2: Write failing tests**
  - `manifest.test.ts`, for `buildManifest('firefox')`:
    - `manifest_version === 3`
    - `background.scripts` deep-equals `['background.js']`
    - `browser_specific_settings.gecko.id === 'krabbe-calendar@hpi.church'`
    - `options_ui` deep-equals `{ page: 'options.html', open_in_tab: true }`
    - `optional_host_permissions` deep-equals `['*://*/*']`
    - `permissions` includes `'storage'` and `'scripting'`
    - no `content_scripts` key
  - `storage.test.ts`, for `originPattern`:
    - `'http://localhost:1234/create'` gives `'http://localhost:1234/*'`
    - `'ftp://x'` throws
- [ ] **Step 3:** Run `yarn test`. Expected: FAIL (modules missing).
- [ ] **Step 4:** Implement the files listed under Produces.
  - `build.mjs` takes `--target=firefox` (the default). It bundles these entries as ESM, with esbuild `platform: 'browser'` and `loader: { '.css': 'text' }` (the content script places its CSS inside a shadow root):
    - `background.ts`
    - `content/index.ts`
    - `options/options.ts`
    - `popup/popup.ts`
  - It also writes `manifest.json` from `buildManifest`, copies the HTML files and `res/` icons, and outputs to `dist/<target>/`.
  - `popup.ts` sets the iframe `src` to `${krabbeUrl}/create` from `getSettings()`.
  - `storage.ts` reads and writes through `ext.storage.local`.
- [ ] **Step 5:** Run `yarn test && yarn typecheck && yarn build`. Expected: all pass. `dist/firefox/manifest.json` exists, and `web-ext lint`, if you choose to run it, shows no errors.
- [ ] **Step 6:** Commit.

### Task 2: iCalendar → busy intervals

**Files:**
- Create: `browser-extension/src/calendar/ical.ts`, `src/calendar/types.ts`
- Test: `browser-extension/test/ical.test.ts`

**Interfaces:**
- Produces:
  - In `types.ts`: `BusyInterval { start: number; end: number }`, epoch ms with `end` exclusive, the same shape as the frontend's `BusyInterval`.
  - `extractBusy(ics: string, opts: { countAllDay: boolean; timezone: string }): BusyInterval[]`. Here `timezone` is the poll's IANA zone, used for floating times, all-day events and unknown TZIDs.

- [ ] **Step 1: Write failing tests.** Inline ICS fixtures, one per case:
  - `UTC event`: `DTSTART:20261020T090000Z`/`DTEND:…T100000Z` gives `[{start: Date.UTC(2026,9,20,9), end: Date.UTC(2026,9,20,10)}]`
  - `folded lines` (`DTSTART:2026102\r\n 0T090000Z`) parse the same as the unfolded version
  - `DURATION`: `DTSTART …T090000Z` + `DURATION:PT1H30M` gives an end at 10:30Z
  - `TZID`: `DTSTART;TZID=Europe/Berlin:20261020T110000` gives a start at `Date.UTC(2026,9,20,9)` (CEST, UTC+2)
  - `unknown TZID` `W. Europe Standard Time` with `timezone: 'Europe/Berlin'` gives the same result as the `TZID` case
  - `floating` `DTSTART:20261020T110000` with `timezone: 'Europe/Berlin'` gives 09:00Z
  - `TRANSP:TRANSPARENT` and `STATUS:CANCELLED` give `[]`
  - `all-day` `DTSTART;VALUE=DATE:20261020` (no DTEND):
    - with `countAllDay: false`, gives `[]`
    - with `countAllDay: true` and `timezone: 'Europe/Berlin'`, gives 2026-10-19T22:00Z to 2026-10-20T22:00Z
  - `unexpanded RRULE` master: exactly one interval, for the first occurrence
  - `multiple VEVENTs` in one VCALENDAR give all of their intervals
  - `VTIMEZONE`/`VALARM` blocks are ignored and don't produce events
- [ ] **Step 2:** Run `yarn test`. Expected: the ical tests FAIL.
- [ ] **Step 3:** Implement `extractBusy`. Unfold lines (CRLF or LF followed by a space or tab), then walk the `BEGIN:`/`END:` nesting and only read properties at VEVENT depth. To convert a wall-clock time to an epoch, guess with `Date.UTC`, then correct by the offset that `Intl.DateTimeFormat(…, { timeZone })` reports for that guess (two iterations handle DST edges). If `Intl` throws on an unknown zone, use `opts.timezone`.
- [ ] **Step 4:** Run `yarn test`. Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 3: CalDAV client (discovery + event fetch)

**Files:**
- Create: `browser-extension/src/calendar/caldav.ts`
- Test: `browser-extension/test/caldav.test.ts`, `test/fixtures/` (Nextcloud-style and Radicale-style multistatus XML)

**Interfaces:**
- Consumes: `Account` and `CalendarSettings` (Task 1).
- Produces:
  - `type Credentials = Pick<Account, 'serverUrl' | 'username' | 'password'>`
  - `discoverCalendars(creds: Credentials, fetchFn?: typeof fetch): Promise<Omit<CalendarSettings, 'countAllDay'>[]>`
  - `fetchCalendarData(creds: Credentials, calendarUrl: string, start: Date, end: Date, fetchFn?: typeof fetch): Promise<string[]>`: the raw `calendar-data` strings
  - `class CalDavError extends Error { status?: number }`

- [ ] **Step 1: Write failing tests.** Use a fake `fetchFn` that records requests and answers from fixtures based on method and URL.
  - Discovery on `https://cloud.example/` calls, in order:
    1. `PROPFIND /.well-known/caldav`. The fake returns a response whose `url` is `https://cloud.example/remote.php/dav/`.
    2. `PROPFIND` for the principal, then the home set, then the home-set collection with `Depth: 1`.
  - The result lists only VEVENT calendars, with absolute URLs resolved against the response URL. The fixture has a VTODO-only list and the home collection itself; both are excluded.
  - Displayname and `calendar-color` are mapped to `name`/`color`, and a missing color stays `undefined`.
  - Every request carries `Authorization: Basic <base64(user:pass)>` and uses `credentials: 'omit'`.
  - A 401 rejects with `CalDavError` whose `status === 401`.
  - The `fetchCalendarData` REPORT body contains:
    - `<c:time-range start="20261020T000000Z" end="20261027T000000Z"/>`
    - `<c:expand start="20261020T000000Z" end="20261027T000000Z"/>`
    - the `Depth: 1` header

    It returns each `calendar-data` text, including CDATA-wrapped ones.
- [ ] **Step 2:** Run `yarn test`. Expected: FAIL.
- [ ] **Step 3:** Implement it with `fast-xml-parser` (`removeNSPrefix: true`, `ignoreAttributes: false`). If `/.well-known/caldav` fails, fall back to `serverUrl` itself. Encode the Basic auth with `btoa` on UTF-8 bytes; don't use `Buffer`, which doesn't exist in a service worker.
- [ ] **Step 4:** Run `yarn test`. Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 4: Background — busy aggregation, messaging, content script registration

**Files:**
- Create: `browser-extension/src/background.ts`, `src/background/fetchBusy.ts`, `src/background/contentScript.ts`, `src/messages.ts`
- Test: `browser-extension/test/fetchBusy.test.ts`, `test/contentScript.test.ts`

**Interfaces:**
- Consumes: `getSettings`, `originPattern` (Task 1), `extractBusy` (Task 2), `discoverCalendars`, `fetchCalendarData` (Task 3).
- Produces:
  - `src/messages.ts`: the runtime message union `Message` and its replies, exporting `FetchBusyRequest` and `FetchBusyResponse` for the `fetch-busy` pair.
    - `{ type: 'discover'; creds: Credentials }` replies `{ calendars } | { error: string }`
    - `{ type: 'fetch-busy'; calendarUrls: string[]; timeStart: string; timeEnd: string; timezone: string }` replies `{ busy: BusyInterval[]; errors: { calendarUrl: string; message: string }[] }`
    - `{ type: 'open-options' }` replies `void`
  - `fetchBusy(settings: Settings, req: FetchBusyRequest, deps?: { fetchCalendarData, extractBusy }): Promise<FetchBusyResponse>`
  - `syncContentScript(krabbeUrl: string, previousUrl?: string): Promise<void>`. It unregisters the `id: 'krabbe-bridge'` registration and registers it again for `originPattern(krabbeUrl)`. If the previous origin differs, it calls `ext.permissions.remove` for it.

- [ ] **Step 1: Write failing tests.** Inject `deps` and a stubbed `ext`.
  - `fetchBusy` resolves each `calendarUrl` to its account and calendar. A URL that is no longer in the settings is skipped silently.
  - It passes each calendar's own `countAllDay` to `extractBusy`.
  - When one of two calendars rejects, the result has the other's intervals plus one entry in `errors` with that `calendarUrl` and the error message.
  - `syncContentScript('https://new.example', 'https://krabbe.hpi.church')` calls `unregisterContentScripts({ ids: ['krabbe-bridge'] })`, then `registerContentScripts([{ id: 'krabbe-bridge', matches: ['https://new.example/*'], js: ['content.js'], runAt: 'document_idle' }])`, then `permissions.remove({ origins: ['https://krabbe.hpi.church/*'] })`.
- [ ] **Step 2:** Run `yarn test`. Expected: FAIL.
- [ ] **Step 3:** Implement the functions. `background.ts` does the following:
  - Routes `ext.runtime.onMessage` by `type`.
  - On `runtime.onStartup` and `onInstalled`, calls `syncContentScript` for the current `krabbeUrl`, but only if `permissions.contains` for that origin returns true.
  - On `storage.onChanged`, when `krabbeUrl` changes, calls `syncContentScript(newValue, oldValue)`.
- [ ] **Step 4:** Run `yarn test && yarn typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 5: Settings tab

**Files:**
- Create: `browser-extension/src/options/options.html`, `src/options/options.ts`, `src/options/options.css`

**Interfaces:**
- Consumes: `getSettings`, `saveSettings`, `originPattern` (Task 1), the `discover` message (Task 4), `ext.permissions`.

- [ ] **Step 1: Krabbe URL.** The settings tab has a field for it. On save:
  - Normalize the value to its origin and call `ext.permissions.request({ origins: [originPattern(url)] })`. This must run directly inside the click handler, because Firefox only allows the request during a user action.
  - If granted, call `saveSettings({ krabbeUrl })`. Task 4's `storage.onChanged` then re-registers the content script.
  - If denied, show "Permission denied, URL not changed" and leave the stored value alone.
- [ ] **Step 2: Add account.**
  - The form has label, server URL, username and password fields.
  - Submitting requests permission for the server origin, then sends `discover`.
  - On success, save the account with a `crypto.randomUUID()` id and every calendar with `countAllDay: false`. On an error, show the message and don't save.
- [ ] **Step 3: Account list.**
  - Each calendar shows a colour swatch, its name and a "count all-day events" checkbox, which saves immediately.
  - "Refresh calendars" re-runs `discover`, keeping `countAllDay` for URLs that still exist.
  - "Remove" deletes the account and calls `permissions.remove` for its origin, unless another account still uses that origin.
- [ ] **Step 4: Manual check.**
  1. Run `yarn build` and load `dist/firefox/manifest.json` via `about:debugging` → This Firefox → Load Temporary Add-on.
  2. Set the krabbe URL to `http://localhost:1234`.
  3. Add a local Radicale account (`docker run -p 5232:5232 tomsquest/docker-radicale`). Its calendars should be listed.
  4. Turn on one all-day checkbox and reload the tab. The setting should still be on.
- [ ] **Step 5:** Commit.

### Task 6: Frontend anchor + in-page picker

**Files:**
- Modify: `frontend/src/components/AvailabilityEditor/AvailabilityEditor.tsx` (the integrations row with `<GoogleCalendar>`/`<RecentEvents>`, around line 105)
- Create: `browser-extension/src/content/index.ts`, `src/content/picker.ts`, `src/content/picker.css` (imported as text and placed inside the shadow root)

**Interfaces:**
- Consumes: the page protocol from `useCalendarBridge.ts` (`calendar-bridge:ready` / `ping` / `busy` / `applied`), `getSettings`/`saveSettings` (Task 1), and the `fetch-busy` and `open-options` messages (Task 4).

- [ ] **Step 1: Frontend anchor.** Add `<div data-calendar-bridge />` after `<RecentEvents …/>`. Then, in `frontend/`, run `yarn tsc && yarn lint --max-warnings 0`. Expected: both pass.
- [ ] **Step 2: Content script, `index.ts`.**
  - Listen for `message` events where `e.source === window`, `e.data.source === 'krabbe'` and `type === 'calendar-bridge:ready'`, and store `{ timeStart, timeEnd, timezone }`.
  - On load, post `{ source: 'krabbe-extension', type: 'calendar-bridge:ping' }`.
  - Once ready, find `[data-calendar-bridge]`. Use a `MutationObserver` until it appears, because React renders it after hydration. Mount the picker into it once, using `attachShadow({ mode: 'closed' })`.
- [ ] **Step 3: Picker, `picker.ts`.**
  - The button reads "Remove calendar conflicts".
  - With no accounts configured, clicking it sends `open-options`.
  - Otherwise clicking opens a list of checkboxes grouped by account label. They are pre-checked from `selectedCalendars`; selected URLs that no longer exist are ignored.
  - "Remove conflicts" does the following:
    1. Calls `saveSettings({ selectedCalendars })`.
    2. Sends `fetch-busy` with the stored range.
    3. Posts `{ source: 'krabbe-extension', type: 'calendar-bridge:busy', busy }` to the page.
    4. Waits up to 5 s for `calendar-bridge:applied`.
    5. Shows "Removed N slots", plus each entry in `errors` as `<calendar name>: <message>`.
  - Include a "Settings" link that sends `open-options`.
- [ ] **Step 4: Manual check** with the frontend dev server (`yarn dev` in `frontend/`) and the API running:
  1. Create a poll with specific dates and open the editor.
  2. Fill all slots with Ctrl+A.
  3. Remove conflicts with a Radicale calendar that has an event from 9:10 to 9:20. The 9:00 and 9:15 slots are both cleared (15-minute slots, and the event overlaps both) and the other slots stay.
  4. Open a weekly poll. No button appears there.
- [ ] **Step 5:** Commit.

### Task 7: CI + docs

**Files:**
- Create: `.github/workflows/check_extension.yml`
- Modify: `CONTRIBUTING.md` (the "Browser Extension" section)

- [ ] **Step 1: CI workflow.**
  - Trigger on `pull_request`/`push` to `main` with paths `browser-extension/**`.
  - Use `actions/setup-node` with `node-version: 26`, then `corepack enable`.
  - In `browser-extension`, run `yarn install --immutable`, `yarn typecheck`, `yarn test`, `yarn build`.
- [ ] **Step 2: CONTRIBUTING.md.** Replace the iframe-only instructions with:
  - the build command, `yarn build`
  - loading `dist/firefox` through `about:debugging`
  - setting the krabbe URL to `http://localhost:1234` in the settings tab
  - adding a test Radicale account
- [ ] **Step 3:** Push the branch and check that the `Extension Checks` workflow is green on PR #1.
- [ ] **Step 4:** Commit.
