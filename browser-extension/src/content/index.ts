import { parseReady, type ReadyInfo } from './bridge.ts';
import { mountPicker } from './picker.ts';

const SELECTOR = '[data-calendar-bridge]';

let ready: ReadyInfo | null = null;
const mounted = new WeakSet<Element>();

function tryMount(): void {
  if (!ready) return;
  for (const anchor of document.querySelectorAll<HTMLElement>(SELECTOR)) {
    if (mounted.has(anchor)) continue;
    mounted.add(anchor);
    mountPicker(anchor, () => ready as ReadyInfo);
  }
}

window.addEventListener('message', (e) => {
  if (e.source !== window || e.origin !== window.location.origin) return;
  const info = parseReady(e.data);
  if (!info) return;
  ready = info;
  tryMount();
});

// React renders the anchor after hydration and may replace it later; keep watching.
new MutationObserver(tryMount).observe(document.documentElement, { childList: true, subtree: true });

window.postMessage({ source: 'krabbe-extension', type: 'calendar-bridge:ping' }, window.location.origin);
