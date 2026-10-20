import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeMessage, type RouterDeps } from '../src/background/router.ts';

const fetchMsg = { type: 'fetch-busy' as const, calendarUrls: [], timeStart: 'a', timeEnd: 'b', timezone: 'UTC' };
const base: RouterDeps = {
  getSettings: async () => ({ krabbeUrl: '', accounts: [], selectedCalendars: [] }),
  fetchBusy: async () => ({ busy: [], errors: [] }),
  discoverCalendars: async () => [{ url: 'u', name: 'n' }],
  openOptionsPage: () => undefined,
};
const once = (msg: Parameters<typeof routeMessage>[0], sender: { tab?: unknown }, deps: RouterDeps) =>
  new Promise<unknown>((resolve) => {
    assert.equal(routeMessage(msg, sender, resolve, deps), true);
  });

test('rejecting getSettings still replies', async () => {
  const r = await once(fetchMsg, {}, { ...base, getSettings: async () => { throw new Error('storage down'); } });
  assert.deepEqual(r, { busy: [], errors: [{ calendarUrl: '', message: 'storage down' }] });
});

test('discover from a content script is refused', async () => {
  const r = await once({ type: 'discover', creds: { serverUrl: 'x', username: 'u', password: 'p' } }, { tab: {} }, base);
  assert.deepEqual(r, { error: 'discover is only available from the settings page' });
});

test('discover from extension page works', async () => {
  const r = await once({ type: 'discover', creds: { serverUrl: 'x', username: 'u', password: 'p' } }, {}, base);
  assert.deepEqual(r, { calendars: [{ url: 'u', name: 'n' }] });
});

test('unknown message is not handled', () => {
  assert.equal(routeMessage({ type: 'nope' } as never, {}, () => {}, base), false);
});
