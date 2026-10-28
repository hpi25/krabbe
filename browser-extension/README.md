# Krabbe browser extension

Removes times that clash with your calendar from your Krabbe availability.

On a Krabbe event page, select the times you're free and click **Remove calendar conflicts**. Pick which calendars to check, confirm, and every selected time that overlaps an event in those calendars is cleared.

Works with any CalDAV calendar (Nextcloud, Radicale, mailbox.org, iCloud with an app password, …), on [krabbe.hpi.church](https://krabbe.hpi.church) and any other Krabbe instance you add.

## Privacy

The extension reads your calendars itself, in your browser. The Krabbe website only ever gets:

- the names and colors of your calendars (for the picker), and
- the **start and end** of busy times in the event's range.

Event titles, descriptions, locations, attendees, your CalDAV server address and your password never leave the extension. Your password is stored in the extension's local storage in this browser only.

## Install

There's no store listing yet. Every change on `main` is built and published to the [browser extension release](https://github.com/hpi25/krabbe/releases/tag/browser-extension):

- **Firefox:** download `krabbe.xpi` and drag and drop it into `about:addons`. The build is unsigned, so this only works in Firefox Developer Edition, Nightly or ESR, after setting `xpinstall.signatures.required` to `false` in `about:config`. In regular Firefox, open `about:debugging` → **This Firefox** → **Load Temporary Add-on...** and select `krabbe.xpi` instead. Firefox removes temporary add-ons when it restarts.
- **Chrome / Chromium / Edge:** download `krabbe-chrome.zip` and unzip it into a folder you'll keep. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and select that folder. Don't delete the folder afterwards, because the extension is loaded from it.

To update, download the new build and repeat these steps. In Chrome, you can instead unzip the new build over the old folder and click **Reload** on the extension.

### From source

Building it yourself needs Node 26 (see [CONTRIBUTING.md](../CONTRIBUTING.md#browser-extension)):

```sh
cd browser-extension
corepack enable
yarn install
yarn build
```

- **Firefox:** `about:debugging` → **This Firefox** → **Load Temporary Add-on...** → `dist/firefox/manifest.json`
- **Chrome / Chromium / Edge:** `chrome://extensions` → **Developer mode** → **Load unpacked** → `dist/chrome`

## Set up

Click the Krabbe icon in the toolbar (or **Calendar settings** on an event page):

1. **Krabbe websites:** `https://krabbe.hpi.church` is there by default. Add others by URL.
2. **Calendar accounts:** add your CalDAV server URL, username and password (for Nextcloud, use an app password). The extension finds your calendars.
3. For each calendar, choose whether it's **checked by default** in the picker, and whether its **all-day events** count as busy (or follow the global default).

## How it works

- `src/background/`: the background service worker. It answers the website's requests, fetches calendars over CalDAV and turns events into busy intervals.
- `src/content/bridge.ts`: a tiny content script on Krabbe sites that relays messages between the page and the background, and strips every reply down to the allowed fields.
- `src/protocol.ts`: the website ⇄ extension protocol. It is mirrored in `frontend/src/components/AvailabilityEditor/useExtensionBridge.ts`.
- `src/options/`: the settings page, which is the extension's only UI.
- `src/caldav/`: CalDAV discovery, REPORT queries and iCalendar parsing.
