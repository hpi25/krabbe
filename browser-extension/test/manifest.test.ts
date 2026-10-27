import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildManifest } from '../src/manifest.ts';

test('firefox uses background scripts and a gecko id', () => {
  const m = buildManifest('firefox');
  assert.equal(m.manifest_version, 3);
  assert.deepEqual(m.background, { scripts: ['background.js'] });
  assert.ok((m.browser_specific_settings as { gecko: { id: string } }).gecko.id);
});

test('chrome uses a service worker and no gecko settings', () => {
  const m = buildManifest('chrome');
  assert.deepEqual(m.background, { service_worker: 'background.js' });
  assert.equal(m.browser_specific_settings, undefined);
});

test('both targets: no popup, default instance granted, others optional', () => {
  for (const target of ['firefox', 'chrome'] as const) {
    const m = buildManifest(target);
    assert.equal((m.action as Record<string, unknown>).default_popup, undefined);
    assert.deepEqual(m.host_permissions, ['https://krabbe.hpi.church/*']);
    assert.deepEqual(m.optional_host_permissions, ['*://*/*']);
    assert.deepEqual(m.permissions, ['storage', 'scripting']);
  }
});
