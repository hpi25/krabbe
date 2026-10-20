export type Target = 'firefox';

export function buildManifest(target: Target): Record<string, unknown> {
  const icons = {
    '16': 'res/icon16.png',
    '32': 'res/icon32.png',
    '48': 'res/icon48.png',
    '128': 'res/icon128.png',
  };
  const manifest: Record<string, unknown> = {
    manifest_version: 3,
    name: 'Krabbe',
    version: '2.0.0',
    description: 'Enter your availability to find a time that works for everyone!',
    author: 'Ben Grant',
    homepage_url: 'https://krabbe.hpi.church',
    icons,
    action: { default_popup: 'popup.html', default_icon: icons },
    background: { scripts: ['background.js'] },
    options_ui: { page: 'options.html', open_in_tab: true },
    permissions: ['storage', 'scripting'],
    optional_host_permissions: ['*://*/*'],
  };
  if (target === 'firefox') {
    manifest.browser_specific_settings = {
      gecko: { id: 'krabbe-calendar@hpi.church', strict_min_version: '128.0' },
    };
  }
  return manifest;
}
