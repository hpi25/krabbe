import { DEFAULT_INSTANCE, originPattern } from './storage.ts';

export const TARGETS = ['firefox', 'chrome'] as const;
export type Target = (typeof TARGETS)[number];

export const VERSION = '3.0.0';

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
    version: VERSION,
    description: 'Clears times that clash with your CalDAV calendars from your Krabbe availability.',
    author: 'Ben Grant',
    homepage_url: DEFAULT_INSTANCE,
    icons,
    // No popup: clicking the icon opens the settings (handled in the background).
    action: { default_title: 'Krabbe settings', default_icon: icons },
    options_ui: { page: 'options.html', open_in_tab: true },
    permissions: ['storage', 'scripting'],
    // Granted at install, so the default instance works without a trip to the settings page.
    host_permissions: [originPattern(DEFAULT_INSTANCE)],
    // Other Krabbe instances and CalDAV servers, requested from the settings page.
    optional_host_permissions: ['*://*/*'],
  };
  if (target === 'firefox') {
    manifest.background = { scripts: ['background.js'] };
    manifest.browser_specific_settings = {
      gecko: { id: 'krabbe-calendar@hpi.church', strict_min_version: '128.0' },
    };
  } else {
    manifest.background = { service_worker: 'background.js' };
    manifest.minimum_chrome_version = '121';
  }
  return manifest;
}
