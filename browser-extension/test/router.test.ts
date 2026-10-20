import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeMessage, type RouterDeps } from '../src/background/router.ts';

const fetchMsg = { type: 'fetch-busy' as const, calendarUrls: [], timeStart: 'a', timeEnd: 'b', timezone: 'UTC' };
const base: RouterDeps = {
  getSettings: async () => ({ krabbeUrl: '', accounts: [], selectedCalendars: [] }),
  saveSettings: async () => undefined,
  fetchBusy: async () => ({ busy: [], errors: [] }),
  discoverCalendars: async () => [{ url: 'u', name: 'n' }],
  openOptionsPage: () => undefined,
  extensionBaseUrl: 'moz-extension://abc/',
};
const once = (msg: Parameters<typeof routeMessage>[0], sender: { tab?: unknown; url?: string }, deps: RouterDeps) =>
  new Promise<unknown>((resolve) => {
    assert.equal(routeMessage(msg, sender, resolve, deps), true);
  });

test('rejecting getSettings still replies', async () => {
  const r = await once(fetchMsg, {}, { ...base, getSettings: async () => { throw new Error('storage down'); } });
  assert.deepEqual(r, { busy: [], errors: [{ calendarUrl: '', message: 'storage down' }] });
});

const discover = { type: 'discover' as const, creds: { serverUrl: 'x', username: 'u', password: 'p' } };
const refused = { error: 'discover is only available from the settings page' };

test('discover from content script (web url + tab) is refused', async () => {
  assert.deepEqual(await once(discover, { tab: {}, url: 'https://krabbe.hpi.church/xyz' }, base), refused);
});

test('discover with no sender url is refused', async () => {
  assert.deepEqual(await once(discover, {}, base), refused);
});

test('discover from options page opened in a tab works', async () => {
  const r = await once(discover, { tab: {}, url: 'moz-extension://abc/options.html' }, base);
  assert.deepEqual(r, { calendars: [{ url: 'u', name: 'n' }] });
});

test('synchronously throwing getSettings still replies', async () => {
  const r = await once(fetchMsg, {}, { ...base, getSettings: () => { throw new Error('sync'); } });
  assert.deepEqual(r, { busy: [], errors: [{ calendarUrl: '', message: 'sync' }] });
});

test('unknown message is not handled', () => {
  assert.equal(routeMessage({ type: 'nope' } as never, {}, () => {}, base), false);
});

test('picker-data replies with groups only, no credentials', async () => {
  const settings = {
    krabbeUrl: 'https://k',
    selectedCalendars: ['u1', 'gone'],
    accounts: [
      { id: 'a', label: 'Work', serverUrl: 'https://secret.example', username: 'alice', password: 'hunter2', calendars: [
        { url: 'u1', name: 'Main', color: '#f00', countAllDay: false },
        { url: 'u2', name: 'Other', countAllDay: false },
      ] },
      { id: 'b', label: 'Home', serverUrl: 's', username: 'u', password: 'p', calendars: [] },
    ],
  };
  const r = await once({ type: 'picker-data' }, { tab: {}, url: 'https://k/x' }, { ...base, getSettings: async () => settings });
  assert.deepEqual(r, {
    groups: [
      { label: 'Work', calendars: [
        { url: 'u1', name: 'Main', color: '#f00', checked: true },
        { url: 'u2', name: 'Other', checked: false },
      ] },
      { label: 'Home', calendars: [] },
    ],
  });
  assert.ok(!/hunter2|alice|secret\.example/.test(JSON.stringify(r)));
});

test('picker-data with failing storage replies with empty groups', async () => {
  const r = await once({ type: 'picker-data' }, {}, { ...base, getSettings: async () => { throw new Error('x'); } });
  assert.deepEqual(r, { groups: [] });
});

test('save-selection persists only selectedCalendars', async () => {
  const saved: unknown[] = [];
  const r = await once({ type: 'save-selection', calendarUrls: ['a', 'b'] }, {}, { ...base, saveSettings: async (p) => { saved.push(p); } });
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(saved, [{ selectedCalendars: ['a', 'b'] }]);
});

test('save-selection reports storage errors', async () => {
  const r = await once({ type: 'save-selection', calendarUrls: [] }, {}, { ...base, saveSettings: async () => { throw new Error('full'); } });
  assert.deepEqual(r, { ok: false, error: 'full' });
});
