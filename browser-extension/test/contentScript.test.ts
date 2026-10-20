import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { syncContentScript, syncCurrent } from '../src/background/contentScript.ts';

const g = globalThis as unknown as { browser?: unknown };
afterEach(() => {
  delete g.browser;
});

function install(unregisterThrows = false) {
  const calls: [string, unknown][] = [];
  g.browser = {
    scripting: {
      unregisterContentScripts: async (a: unknown) => {
        calls.push(['unregister', a]);
        if (unregisterThrows) throw new Error('nothing registered');
      },
      registerContentScripts: async (a: unknown) => void calls.push(['register', a]),
    },
    permissions: { remove: async (a: unknown) => void calls.push(['remove', a]) },
  };
  return calls;
}

test('re-registers and removes old origin permission', async () => {
  const calls = install();
  await syncContentScript('https://new.example', 'https://krabbe.hpi.church');
  assert.deepEqual(calls, [
    ['unregister', { ids: ['krabbe-bridge'] }],
    ['register', [{ id: 'krabbe-bridge', matches: ['https://new.example/*'], js: ['content.js'], runAt: 'document_idle', persistAcrossSessions: false }]],
    ['remove', { origins: ['https://krabbe.hpi.church/*'] }],
  ]);
});

test('ignores unregister failure; no remove without previous or same origin', async () => {
  const calls = install(true);
  await syncContentScript('https://a.example');
  await syncContentScript('https://a.example/x', 'https://a.example');
  assert.equal(calls.filter((c) => c[0] === 'remove').length, 0);
  assert.equal(calls.filter((c) => c[0] === 'register').length, 2);
});

test('keeps the old origin permission when an account server lives there', async () => {
  const calls = install();
  await syncContentScript('https://new.example', 'https://krabbe.hpi.church', [{ serverUrl: 'https://krabbe.hpi.church/dav' }]);
  assert.equal(calls.filter((c) => c[0] === 'remove').length, 0);
  assert.equal(calls.filter((c) => c[0] === 'register').length, 1);
});

test('syncCurrent registers only when the origin is permitted', async () => {
  for (const permitted of [true, false]) {
    const calls: [string, unknown][] = [];
    g.browser = {
      storage: { local: { get: async () => ({ krabbeUrl: 'https://k.example' }) } },
      permissions: { contains: async () => permitted },
      scripting: {
        unregisterContentScripts: async () => void calls.push(['unregister', null]),
        registerContentScripts: async (a: unknown) => void calls.push(['register', a]),
      },
    };
    await syncCurrent();
    assert.equal(calls.filter((c) => c[0] === 'register').length, permitted ? 1 : 0);
  }
});
