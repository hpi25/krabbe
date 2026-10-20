import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeMessage, type RouterDeps } from '../src/background/router.ts';

const fetchMsg = { type: 'fetch-busy' as const, calendarUrls: [], timeStart: 'a', timeEnd: 'b', timezone: 'UTC' };
const base: RouterDeps = {
  getSettings: async () => ({ krabbeUrl: '', accounts: [], selectedCalendars: [] }),
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
