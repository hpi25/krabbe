import { discoverCalendars, type Credentials } from '../caldav/caldav.ts';
import { ext } from '../platform.ts';
import {
  DEFAULT_INSTANCE,
  getSettings,
  mergeDiscovered,
  newId,
  normalizeInstance,
  originPattern,
  saveSettings,
  type Account,
  type AllDayMode,
  type Settings,
} from '../storage.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & Record<string, unknown> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  Object.assign(el, props);
  el.append(...children);
  return el;
}

function status(message: string, kind: 'ok' | 'error' | '' = '') {
  const el = $('status');
  el.textContent = message;
  el.className = kind;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

let settings: Settings;
let updates = Promise.resolve();

/**
 * Applies `change` to fresh settings, saves, re-renders. Reading first avoids clobbering other tabs' edits;
 * queueing avoids two quick clicks reading the same settings and the second save undoing the first.
 */
function update(change: (s: Settings) => void): Promise<void> {
  const run = async () => {
    const s = await getSettings();
    change(s);
    await saveSettings(s);
    settings = s;
    render();
  };
  const next = updates.then(run);
  updates = next.catch((e) => status(errorText(e), 'error'));
  return next;
}

/** Must be called synchronously from a click/submit handler: browsers drop requests without a user gesture. */
function requestOrigin(url: string): Promise<boolean> {
  return ext.permissions.request({ origins: [originPattern(url)] });
}

/** Drops host permission for `url` unless something else still needs it. */
async function releaseOrigin(url: string, s: Settings) {
  const pattern = originPattern(url);
  const inUse = [...s.instances, ...s.accounts.map((a) => a.serverUrl)].some((u) => {
    try {
      return originPattern(u) === pattern;
    } catch {
      return false;
    }
  });
  if (inUse || pattern === originPattern(DEFAULT_INSTANCE)) return;
  await ext.permissions.remove({ origins: [pattern] }).catch(() => undefined);
}

function renderInstances() {
  $('instances').replaceChildren(
    ...settings.instances.map((origin) =>
      h(
        'li',
        {},
        h('span', {}, origin),
        h('button', {
          type: 'button',
          className: 'secondary',
          textContent: 'Remove',
          onclick: () =>
            void update((s) => {
              s.instances = s.instances.filter((i) => i !== origin);
            }).then(() => releaseOrigin(origin, settings)),
        }),
      ),
    ),
  );
  if (settings.instances.length === 0) $('instances').append(h('li', { className: 'muted' }, 'No sites yet.'));
}

function calendarRow(account: Account, index: number) {
  const cal = account.calendars[index]!;
  const set = (change: (c: (typeof account.calendars)[number]) => void) =>
    void update((s) => {
      const c = s.accounts.find((a) => a.id === account.id)?.calendars.find((c) => c.id === cal.id);
      if (c) change(c);
    });

  const dot = h('span', { className: 'dot' });
  if (cal.color) dot.style.background = cal.color.slice(0, 7);
  const allDay = h(
    'select',
    { onchange: (e: Event) => set((c) => (c.allDay = (e.target as HTMLSelectElement).value as AllDayMode)) },
    h('option', { value: 'inherit', textContent: `Default (${settings.defaults.countAllDay ? 'busy' : 'ignore'})` }),
    h('option', { value: 'count', textContent: 'Busy' }),
    h('option', { value: 'ignore', textContent: 'Ignore' }),
  );
  allDay.value = cal.allDay;
  return h(
    'tr',
    {},
    h('td', {}, dot, cal.name),
    h(
      'td',
      {},
      h('input', {
        type: 'checkbox',
        checked: cal.enabled,
        title: 'Checked by default on the website',
        onchange: (e: Event) => set((c) => (c.enabled = (e.target as HTMLInputElement).checked)),
      }),
    ),
    h('td', {}, allDay),
  );
}

function renderAccounts() {
  const container = $('accounts');
  container.replaceChildren(
    ...settings.accounts.map((account) => {
      const refresh = h('button', { type: 'button', className: 'secondary', textContent: 'Refresh calendars' });
      refresh.onclick = async () => {
        refresh.disabled = true;
        status('Looking for calendars…');
        try {
          const found = await discoverCalendars(account);
          await update((s) => {
            const a = s.accounts.find((a) => a.id === account.id);
            if (a) a.calendars = mergeDiscovered(a.calendars, found);
          });
          status(`Found ${found.length} calendar(s).`, 'ok');
        } catch (e) {
          status(errorText(e), 'error');
        } finally {
          refresh.disabled = false;
        }
      };
      const remove = h('button', {
        type: 'button',
        className: 'secondary',
        textContent: 'Remove',
        onclick: () => {
          if (!confirm(`Remove "${account.label}"? Its password is deleted from this browser.`)) return;
          void update((s) => {
            s.accounts = s.accounts.filter((a) => a.id !== account.id);
          }).then(() => releaseOrigin(account.serverUrl, settings));
        },
      });
      const table =
        account.calendars.length === 0
          ? h('p', { className: 'muted' }, 'No calendars with events found.')
          : h(
              'table',
              { className: 'calendars' },
              h('tr', {}, h('th', {}, 'Calendar'), h('th', {}, 'Checked by default'), h('th', {}, 'All-day events')),
              ...account.calendars.map((_, i) => calendarRow(account, i)),
            );
      return h(
        'div',
        { className: 'account' },
        h(
          'div',
          { className: 'account-head' },
          h('div', {}, h('strong', {}, account.label), h('div', { className: 'tag' }, `${account.username} @ ${account.serverUrl}`)),
          h('div', { className: 'actions' }, refresh, remove),
        ),
        table,
      );
    }),
  );
  if (settings.accounts.length === 0) container.append(h('p', { className: 'muted' }, 'No accounts yet.'));
}

function render() {
  $<HTMLInputElement>('count-all-day').checked = settings.defaults.countAllDay;
  renderInstances();
  renderAccounts();
}

$<HTMLInputElement>('count-all-day').addEventListener('change', (e) => {
  const checked = (e.target as HTMLInputElement).checked;
  void update((s) => {
    s.defaults.countAllDay = checked;
  });
});

$<HTMLFormElement>('add-instance').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  let origin: string;
  try {
    origin = normalizeInstance(new FormData(form).get('url') as string);
  } catch (err) {
    return status(errorText(err), 'error');
  }
  requestOrigin(origin).then(
    async (granted) => {
      if (!granted) return status(`Permission for ${origin} was not granted.`, 'error');
      await update((s) => {
        if (!s.instances.includes(origin)) s.instances.push(origin);
      });
      form.reset();
      status(`Added ${origin}. Reload any open Krabbe tabs on it.`, 'ok');
    },
    (err) => status(errorText(err), 'error'),
  );
});

$<HTMLFormElement>('add-account').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const data = new FormData(form);
  const creds: Credentials = {
    serverUrl: String(data.get('serverUrl')).trim(),
    username: String(data.get('username')).trim(),
    password: String(data.get('password')),
  };
  const button = form.querySelector('button')!;
  let label: string;
  try {
    label = String(data.get('label')).trim() || new URL(creds.serverUrl).hostname;
  } catch (err) {
    return status(errorText(err), 'error');
  }
  requestOrigin(creds.serverUrl).then(
    async (granted) => {
      if (!granted) return status('Permission to contact the calendar server was not granted.', 'error');
      button.disabled = true;
      status('Looking for calendars…');
      try {
        const found = await discoverCalendars(creds);
        await update((s) => {
          s.accounts.push({ id: newId(), label, ...creds, calendars: mergeDiscovered([], found) });
        });
        form.reset();
        $<HTMLDetailsElement>('add-account-box').open = false;
        status(`Added ${label} with ${found.length} calendar(s).`, 'ok');
      } catch (err) {
        status(errorText(err), 'error');
      } finally {
        button.disabled = false;
      }
    },
    (err) => status(errorText(err), 'error'),
  );
});

// Another settings tab (or a migration) changed something: show it.
ext.storage.onChanged.addListener((_changes, area) => {
  if (area === 'local') void getSettings().then((s) => ((settings = s), render()));
});

void getSettings().then(
  (s) => {
    settings = s;
    render();
  },
  (e) => status(errorText(e), 'error'),
);
