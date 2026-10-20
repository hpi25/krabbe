import { ext } from '../platform.ts';
import { getSettings, saveSettings, originPattern, type Account } from '../storage.ts';
import type { DiscoverRequest, DiscoverResponse } from '../messages.ts';
import { normalizeKrabbeUrl, mergeRefreshedCalendars, originStillUsed } from './accounts.ts';
import css from './options.css';

const style = document.createElement('style');
style.textContent = css;
document.head.append(style);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function setStatus(el: HTMLElement, text: string, isError = false): void {
  el.textContent = text;
  el.classList.toggle('error', isError);
}

async function discover(account: Pick<Account, 'serverUrl' | 'username' | 'password'>): Promise<DiscoverResponse> {
  const msg: DiscoverRequest = {
    type: 'discover',
    creds: { serverUrl: account.serverUrl, username: account.username, password: account.password },
  };
  return (await ext.runtime.sendMessage(msg)) as DiscoverResponse;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// --- Krabbe URL ---

const krabbeForm = $<HTMLFormElement>('krabbe-form');
const krabbeInput = $<HTMLInputElement>('krabbe-url');
const krabbeStatus = $('krabbe-status');

krabbeForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  // permissions.request must be the first async call: awaiting earlier loses the user gesture.
  let url: string;
  let granted: Promise<boolean>;
  try {
    url = normalizeKrabbeUrl(krabbeInput.value);
    granted = ext.permissions.request({ origins: [originPattern(url)] });
  } catch (e) {
    setStatus(krabbeStatus, errMsg(e), true);
    return;
  }
  void (async () => {
    try {
      if (!(await granted)) {
        setStatus(krabbeStatus, 'Permission denied, URL not changed', true);
        return;
      }
      await saveSettings({ krabbeUrl: url });
      krabbeInput.value = url;
      setStatus(krabbeStatus, 'Saved');
    } catch (e) {
      setStatus(krabbeStatus, errMsg(e), true);
    }
  })();
});

// --- Accounts ---

const accountsEl = $('accounts');
const accountForm = $<HTMLFormElement>('account-form');
const accountStatus = $('account-status');

function renderAccount(account: Account): HTMLElement {
  const root = document.createElement('div');
  root.className = 'account';

  const header = document.createElement('header');
  const titleBox = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = account.label;
  const server = document.createElement('div');
  server.className = 'server';
  server.textContent = `${account.username} @ ${account.serverUrl}`;
  titleBox.append(title, server);

  const actions = document.createElement('div');
  actions.className = 'actions';
  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.textContent = 'Refresh calendars';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remove';
  actions.append(refresh, remove);
  header.append(titleBox, actions);
  root.append(header);

  const status = document.createElement('p');
  status.className = 'status';
  status.setAttribute('role', 'status');

  for (const cal of account.calendars) {
    const row = document.createElement('div');
    row.className = 'calendar';
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    if (cal.color) swatch.style.backgroundColor = cal.color;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = cal.name;
    const label = document.createElement('label');
    label.className = 'allday';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = cal.countAllDay;
    label.append(box, 'count all-day events');
    box.addEventListener('change', () => {
      void (async () => {
        try {
          const { accounts } = await getSettings();
          const a = accounts.find((x) => x.id === account.id);
          const c = a?.calendars.find((x) => x.url === cal.url);
          if (!c) return;
          c.countAllDay = box.checked;
          await saveSettings({ accounts });
        } catch (e) {
          setStatus(status, errMsg(e), true);
        }
      })();
    });
    row.append(swatch, name, label);
    root.append(row);
  }
  root.append(status);

  refresh.addEventListener('click', () => {
    void (async () => {
      try {
        setStatus(status, 'Refreshing...');
        const res = await discover(account);
        if ('error' in res) {
          setStatus(status, res.error, true);
          return;
        }
        const { accounts } = await getSettings();
        const a = accounts.find((x) => x.id === account.id);
        if (!a) return;
        a.calendars = mergeRefreshedCalendars(a.calendars, res.calendars);
        await saveSettings({ accounts });
        await render();
      } catch (e) {
        setStatus(status, errMsg(e), true);
      }
    })();
  });

  remove.addEventListener('click', () => {
    void (async () => {
      try {
        const { accounts, selectedCalendars, krabbeUrl } = await getSettings();
        const urls = new Set(account.calendars.map((c) => c.url));
        const shared = originStillUsed(accounts, account.id, krabbeUrl);
        await saveSettings({
          accounts: accounts.filter((a) => a.id !== account.id),
          selectedCalendars: selectedCalendars.filter((u) => !urls.has(u)),
        });
        try {
          if (!shared) await ext.permissions.remove({ origins: [originPattern(account.serverUrl)] });
        } finally {
          await render();
        }
      } catch (e) {
        setStatus(status, errMsg(e), true);
      }
    })();
  });

  return root;
}

async function render(): Promise<void> {
  const settings = await getSettings();
  krabbeInput.value = settings.krabbeUrl;
  accountsEl.replaceChildren(...settings.accounts.map(renderAccount));
  if (settings.accounts.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'status';
    empty.textContent = 'No accounts yet.';
    accountsEl.append(empty);
  }
}

accountForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const data = new FormData(accountForm);
  const field = (k: string) => String(data.get(k) ?? '');
  const draft = {
    label: field('label').trim(),
    serverUrl: field('serverUrl').trim(),
    username: field('username'),
    password: field('password'),
  };
  // permissions.request must be the first async call: awaiting earlier loses the user gesture.
  let granted: Promise<boolean>;
  try {
    granted = ext.permissions.request({ origins: [originPattern(draft.serverUrl)] });
  } catch (e) {
    setStatus(accountStatus, errMsg(e), true);
    return;
  }
  void (async () => {
    try {
      if (!(await granted)) {
        setStatus(accountStatus, 'Permission denied, account not added', true);
        return;
      }
      setStatus(accountStatus, 'Discovering calendars...');
      const res = await discover(draft);
      if ('error' in res) {
        setStatus(accountStatus, res.error, true);
        return;
      }
      const { accounts } = await getSettings();
      accounts.push({
        id: crypto.randomUUID(),
        ...draft,
        calendars: mergeRefreshedCalendars([], res.calendars),
      });
      await saveSettings({ accounts });
      accountForm.reset();
      setStatus(accountStatus, `Added ${res.calendars.length} calendar(s)`);
      await render();
    } catch (e) {
      setStatus(accountStatus, errMsg(e), true);
    }
  })();
});

void render();
