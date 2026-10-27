import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCRIPT_ID, serialized, syncContentScripts, type ScriptingDeps } from '../src/background/contentScripts.ts';

function fake(granted: string[], registered?: string[]) {
  const log: string[] = [];
  let current = registered;
  const deps: ScriptingDeps = {
    hasOrigin: async (p) => granted.includes(p),
    getRegistered: async () => (current ? [{ id: SCRIPT_ID, matches: current }] : []),
    register: async (m) => {
      log.push(`register ${m.join(',')}`);
      current = m;
    },
    unregister: async () => {
      log.push('unregister');
      current = undefined;
    },
  };
  return { deps, log };
}

test('registers only permitted instances, ports dropped', async () => {
  const { deps, log } = fake(['https://krabbe.hpi.church/*']);
  await syncContentScripts(['https://krabbe.hpi.church', 'http://localhost:3000'], deps);
  assert.deepEqual(log, ['register https://krabbe.hpi.church/*']);
});

test('is a no-op when already in sync', async () => {
  const { deps, log } = fake(['https://a/*', 'https://b/*'], ['https://b/*', 'https://a/*']);
  await syncContentScripts(['https://a', 'https://b'], deps);
  assert.deepEqual(log, []);
});

test('re-registers on change and unregisters when nothing is left', async () => {
  const { deps, log } = fake(['https://a/*', 'https://b/*'], ['https://a/*']);
  await syncContentScripts(['https://a', 'https://b'], deps);
  await syncContentScripts([], deps);
  assert.deepEqual(log, ['unregister', 'register https://a/*,https://b/*', 'unregister']);
});

test('serialized runs one at a time and survives failures', async () => {
  const order: string[] = [];
  let n = 0;
  const run = serialized(async () => {
    const i = n++;
    order.push(`start ${i}`);
    await new Promise((r) => setTimeout(r, 5));
    order.push(`end ${i}`);
    if (i === 0) throw new Error('boom');
  });
  const errors = console.error;
  console.error = () => {};
  await Promise.all([run(), run()]);
  console.error = errors;
  assert.deepEqual(order, ['start 0', 'end 0', 'start 1', 'end 1']);
});
