import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildManifest } from '../src/manifest.ts';

test('firefox manifest is MV3 with the expected shape', () => {
  const m = buildManifest('firefox') as any;
  assert.equal(m.manifest_version, 3);
  assert.deepEqual(m.background.scripts, ['background.js']);
  assert.equal(m.browser_specific_settings.gecko.id, 'krabbe-calendar@hpi.church');
  assert.deepEqual(m.options_ui, { page: 'options.html', open_in_tab: true });
  assert.deepEqual(m.optional_host_permissions, ['*://*/*']);
  assert.ok(m.permissions.includes('storage'));
  assert.ok(m.permissions.includes('scripting'));
  assert.equal('content_scripts' in m, false);
});
