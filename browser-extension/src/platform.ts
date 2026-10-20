import type { Browser } from 'webextension-polyfill';

// The only file allowed to touch `browser`/`chrome`. Resolved lazily on every
// access so tests can install a stub on globalThis after importing.
export const ext: Browser = new Proxy({} as Browser, {
  get(_target, prop) {
    const g = globalThis as unknown as { browser?: Browser; chrome?: Browser };
    const api = g.browser ?? g.chrome;
    if (!api) throw new Error('No WebExtension API available');
    return Reflect.get(api, prop);
  },
});
