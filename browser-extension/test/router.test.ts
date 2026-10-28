import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleBridgeMessage, type RouterDeps } from '../src/background/router.ts';
import { defaultSettings, type Settings } from '../src/storage.ts';

const settings: Settings = {
  ...defaultSettings(),
  instances: ['https://krabbe.hpi.church', 'http://localhost:3000'],
  accounts: [
    {
      id: 'a', label: 'Work', serverUrl: 'https://secret.example', username: 'alice', password: 'hunter2',
      calendars: [
        { id: 'c1', url: 'https://secret.example/c1/', name: 'Main', color: '#f00', enabled: true, allDay: 'inherit' },
        { id: 'c2', url: 'https://secret.example/c2/', name: 'Other', enabled: false, allDay: 'count' },
      ],
    },
  ],
};
let opened = 0;
const deps: RouterDeps = {
  getSettings: async () => settings,
  fetchBusy: async () => ({ ok: true, data: { busy: [], errors: [], stats: [] } }),
  openOptionsPage: () => void opened++,
  extensionId: 'me',
};
const tab = { id: 'me', tab: {}, url: 'https://krabbe.hpi.church/some-event-123' };
const msg = (request: unknown) => ({ channel: 'krabbe-bridge', request });

test('hello answers with the protocol version', async () => {
  assert.deepEqual(await handleBridgeMessage(msg({ type: 'hello' }), tab, deps), { ok: true, data: { version: 1 } });
});

test('works for a non-default instance with a port', async () => {
  const r = await handleBridgeMessage(msg({ type: 'hello' }), { ...tab, url: 'http://localhost:3000/abc' }, deps);
  assert.equal(r.ok, true);
});

test('refuses other extensions, non-tab senders and unconfigured origins', async () => {
  const forbidden = { ok: false, error: 'forbidden' };
  assert.deepEqual(await handleBridgeMessage(msg({ type: 'hello' }), { ...tab, id: 'other' }, deps), forbidden);
  assert.deepEqual(await handleBridgeMessage(msg({ type: 'hello' }), { id: 'me', url: tab.url }, deps), forbidden);
  assert.deepEqual(await handleBridgeMessage(msg({ type: 'hello' }), { ...tab, url: 'https://evil.example/' }, deps), forbidden);
  assert.deepEqual(await handleBridgeMessage(msg({ type: 'hello' }), { ...tab, url: 'http://localhost:4000/' }, deps), forbidden);
});

test('list-calendars returns opaque ids and names, never urls or credentials', async () => {
  const r = await handleBridgeMessage(msg({ type: 'list-calendars' }), tab, deps);
  assert.deepEqual(r, {
    ok: true,
    data: {
      calendars: [
        { id: 'c1', name: 'Main', color: '#f00', account: 'Work', enabled: true },
        { id: 'c2', name: 'Other', account: 'Work', enabled: false },
      ],
    },
  });
  assert.ok(!/hunter2|alice|secret\.example/.test(JSON.stringify(r)));
});

test('open-settings opens the options page', async () => {
  const before = opened;
  assert.deepEqual(await handleBridgeMessage(msg({ type: 'open-settings' }), tab, deps), { ok: true, data: {} });
  assert.equal(opened, before + 1);
});

test('malformed requests and storage failures still reply', async () => {
  assert.deepEqual(await handleBridgeMessage(msg({ type: 'discover' }), tab, deps), { ok: false, error: 'bad-request' });
  assert.deepEqual(await handleBridgeMessage(null, tab, deps), { ok: false, error: 'bad-request' });
  const broken = { ...deps, getSettings: async () => { throw new Error('storage down'); } };
  assert.deepEqual(await handleBridgeMessage(msg({ type: 'hello' }), tab, broken), { ok: false, error: 'internal' });
});
