import { ext } from '../platform.ts';
import { getSettings, saveSettings } from '../storage.ts';
import type { FetchBusyRequest, FetchBusyResponse, OpenOptionsRequest } from '../messages.ts';
import { parseApplied, pickerGroups, type ReadyInfo } from './bridge.ts';
import css from './picker.css';

const APPLIED_TIMEOUT_MS = 5000;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function openOptions(): void {
  const msg: OpenOptionsRequest = { type: 'open-options' };
  void ext.runtime.sendMessage(msg);
}

function waitForApplied(): Promise<number | null> {
  return new Promise((resolve) => {
    const done = (v: number | null) => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(v);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin) return;
      const removed = parseApplied(e.data);
      if (removed !== null) done(removed);
    };
    const timer = setTimeout(() => done(null), APPLIED_TIMEOUT_MS);
    window.addEventListener('message', onMessage);
  });
}

/** Mounts the picker into `anchor` inside a closed shadow root. */
export function mountPicker(anchor: HTMLElement, getReady: () => ReadyInfo): void {
  const host = el('div');
  anchor.append(host);
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = el('style');
  style.textContent = css;
  const root = el('div', 'root');
  const toggle = el('button', undefined, 'Remove calendar conflicts');
  toggle.type = 'button';
  const panel = el('div', 'panel');
  panel.hidden = true;
  root.append(toggle, panel);
  shadow.append(style, root);

  let busy = false;

  async function renderPanel(): Promise<void> {
    const settings = await getSettings();
    panel.replaceChildren();
    const inputs: { url: string; input: HTMLInputElement }[] = [];
    const known = new Map<string, string>();
    for (const group of pickerGroups(settings)) {
      const g = el('div', 'group');
      g.append(el('div', 'group-label', group.label));
      for (const cal of group.calendars) {
        known.set(cal.url, cal.name);
        const label = el('label', 'cal');
        const input = el('input');
        input.type = 'checkbox';
        input.checked = cal.checked;
        const dot = el('span', 'dot');
        if (cal.color && /^#[0-9a-fA-F]{3,8}$/.test(cal.color)) dot.style.background = cal.color;
        label.append(input, dot, el('span', undefined, cal.name));
        inputs.push({ url: cal.url, input });
        g.append(label);
      }
      panel.append(g);
    }
    const status = el('div', 'status');
    status.setAttribute('role', 'status');
    const run = el('button', 'primary', 'Remove conflicts');
    run.type = 'button';
    const settingsLink = el('button', 'link', 'Settings');
    settingsLink.type = 'button';
    settingsLink.addEventListener('click', openOptions);
    const actions = el('div', 'actions');
    actions.append(run, settingsLink);
    panel.append(actions, status);

    const setStatus = (text: string, isError = false) => {
      status.textContent = text;
      status.classList.toggle('error', isError);
    };

    run.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      run.disabled = true;
      try {
        const calendarUrls = inputs.filter((i) => i.input.checked).map((i) => i.url);
        if (calendarUrls.length === 0) {
          setStatus('Select at least one calendar');
          return;
        }
        setStatus('Fetching events…');
        await saveSettings({ selectedCalendars: calendarUrls });
        const { timeStart, timeEnd, timezone } = getReady();
        const req: FetchBusyRequest = { type: 'fetch-busy', calendarUrls, timeStart, timeEnd, timezone };
        const res = (await ext.runtime.sendMessage(req)) as FetchBusyResponse | undefined;
        if (!res || !Array.isArray(res.busy)) {
          setStatus('Could not fetch calendar events', true);
          return;
        }
        // Only { start, end } ever reaches the page.
        const intervals = res.busy.map((b) => ({ start: b.start, end: b.end }));
        const applied = waitForApplied();
        window.postMessage(
          { source: 'krabbe-extension', type: 'calendar-bridge:busy', busy: intervals },
          window.location.origin,
        );
        const removed = await applied;
        const errors = (res.errors ?? []).map((er) => `${known.get(er.calendarUrl) ?? 'Calendar'}: ${er.message}`);
        const main =
          removed === null
            ? `Sent ${intervals.length} busy intervals, page didn't confirm`
            : `Removed ${removed} slots`;
        setStatus([main, ...errors].join('\n'), errors.length > 0);
        status.style.whiteSpace = 'pre-line';
      } catch (err) {
        setStatus(err instanceof Error ? err.message : 'Something went wrong', true);
      } finally {
        busy = false;
        run.disabled = false;
      }
    });
  }

  toggle.addEventListener('click', async () => {
    if (!panel.hidden) {
      panel.hidden = true;
      return;
    }
    const settings = await getSettings();
    if (settings.accounts.length === 0) {
      openOptions();
      return;
    }
    await renderPanel();
    panel.hidden = false;
  });
}
