import { ext } from '../platform.ts';
import type {
  FetchBusyRequest,
  FetchBusyResponse,
  OpenOptionsRequest,
  PickerDataRequest,
  PickerDataResponse,
  SaveSelectionRequest,
} from '../messages.ts';
import { parseApplied, summarize, type ReadyInfo, type Summary } from './bridge.ts';
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

function renderSummary(s: Summary): HTMLElement {
  const out = el('div');
  out.append(el('p', 'headline', s.headline));
  const row = (cells: string[], tag: 'th' | 'td' = 'td') => {
    const tr = el('tr');
    for (const c of cells) tr.append(el(tag, undefined, c));
    return tr;
  };
  const thead = el('thead');
  thead.append(row(['Calendar', 'Events', 'Busy'], 'th'));
  const tbody = el('tbody');
  for (const c of s.calendars) tbody.append(row([c.name, String(c.events), String(c.intervals)]));
  const tfoot = el('tfoot');
  tfoot.append(row(['Total', String(s.total.events), String(s.total.intervals)]));
  const table = el('table');
  table.append(thead, tbody, tfoot);
  out.append(table, el('p', 'muted', `Searched ${s.range}`));
  if (s.hint) out.append(el('p', 'hint', s.hint));
  if (s.errors.length > 0) {
    const list = el('ul', 'errors');
    for (const e of s.errors) list.append(el('li', undefined, e));
    out.append(list);
  }
  return out;
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

/** A closed shadow root under `parent`, styled with the picker CSS; returns its `.root`. */
function shadowRoot(parent: HTMLElement): HTMLDivElement {
  const host = el('div');
  parent.append(host);
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = el('style');
  style.textContent = css;
  const root = el('div', 'root');
  shadow.append(style, root);
  return root;
}

/**
 * Mounts the toggle button into `anchor` and the panel into `panelAnchor`, each in a closed shadow root.
 * The panel sits outside the page's button row so opening it never reflows the buttons; without a
 * `panelAnchor` (older pages) it goes under the button.
 */
export function mountPicker(anchor: HTMLElement, panelAnchor: HTMLElement | null, getReady: () => ReadyInfo): void {
  const root = shadowRoot(anchor);
  const toggle = el('button', 'btn', 'Remove calendar conflicts');
  toggle.type = 'button';
  const panel = el('div', 'panel');
  panel.hidden = true;
  root.append(toggle);
  (panelAnchor ? shadowRoot(panelAnchor) : root).append(panel);

  let busy = false;

  async function loadGroups(): Promise<PickerDataResponse['groups']> {
    const req: PickerDataRequest = { type: 'picker-data' };
    const res = (await ext.runtime.sendMessage(req)) as PickerDataResponse | undefined;
    return Array.isArray(res?.groups) ? res.groups : [];
  }

  async function renderPanel(groups: PickerDataResponse['groups']): Promise<void> {
    panel.replaceChildren();
    const inputs: { url: string; input: HTMLInputElement }[] = [];
    const known = new Map<string, string>();
    for (const group of groups) {
      const g = el('div', 'group');
      g.append(el('div', 'group-label', group.label));
      for (const cal of group.calendars) {
        known.set(cal.url, cal.name);
        const label = el('label', 'cal');
        const input = el('input');
        input.type = 'checkbox';
        input.checked = cal.checked;
        // Like the site's Google import: the checkbox takes the calendar's colour.
        if (cal.color && /^#[0-9a-fA-F]{3,8}$/.test(cal.color)) input.style.accentColor = cal.color;
        label.append(input, el('span', undefined, cal.name));
        inputs.push({ url: cal.url, input });
        g.append(label);
      }
      panel.append(g);
    }
    const status = el('div', 'status');
    status.setAttribute('role', 'status');
    const run = el('button', 'btn small', 'Remove conflicts');
    run.type = 'button';
    const settingsLink = el('button', 'link', 'Extension settings');
    settingsLink.type = 'button';
    settingsLink.addEventListener('click', openOptions);
    const actions = el('div', 'actions');
    actions.append(run, settingsLink);
    panel.append(actions, status);

    const setStatus = (content: string | HTMLElement, isError = false) => {
      status.replaceChildren(content);
      status.classList.toggle('error', isError);
    };

    run.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      run.disabled = true;
      run.classList.add('loading');
      try {
        const calendarUrls = inputs.filter((i) => i.input.checked).map((i) => i.url);
        if (calendarUrls.length === 0) {
          setStatus('Select at least one calendar');
          return;
        }
        setStatus('Fetching events…');
        const save: SaveSelectionRequest = { type: 'save-selection', calendarUrls };
        await ext.runtime.sendMessage(save);
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
        const stats = (res.stats ?? []).map((st) => ({ ...st, name: known.get(st.calendarUrl) ?? 'Calendar' }));
        setStatus(renderSummary(summarize({ timeStart, timeEnd, timezone, stats, errors, removed })));
      } catch (err) {
        setStatus(err instanceof Error ? err.message : 'Something went wrong', true);
      } finally {
        busy = false;
        run.disabled = false;
        run.classList.remove('loading');
      }
    });
  }

  toggle.addEventListener('click', async () => {
    if (!panel.hidden) {
      panel.hidden = true;
      return;
    }
    const groups = await loadGroups();
    if (groups.length === 0) {
      openOptions();
      return;
    }
    await renderPanel(groups);
    panel.hidden = false;
  });
}
