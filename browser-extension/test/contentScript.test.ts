import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { syncContentScript } from '../src/background/contentScript.ts';

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
