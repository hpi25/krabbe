import { ext } from '../platform.ts';
import { getSettings, originPattern, type Account } from '../storage.ts';

const SCRIPT_ID = 'krabbe-bridge';

export async function syncContentScript(
  krabbeUrl: string,
  previousUrl?: string,
  accounts: Pick<Account, 'serverUrl'>[] = [],
): Promise<void> {
  try {
    await ext.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  } catch {
    // not registered yet
  }
  const pattern = originPattern(krabbeUrl);
  await ext.scripting.registerContentScripts([
    { id: SCRIPT_ID, matches: [pattern], js: ['content.js'], runAt: 'document_idle', persistAcrossSessions: false },
  ]);
  if (previousUrl) {
    const old = originPattern(previousUrl);
    const usedByAccount = accounts.some((a) => {
      try {
        return originPattern(a.serverUrl) === old;
      } catch {
        return false;
      }
    });
    if (old !== pattern && !usedByAccount) await ext.permissions.remove({ origins: [old] });
  }
}

/** Registers the content script for the saved krabbe URL if (and only if) its origin is permitted. Idempotent. */
export async function syncCurrent(): Promise<void> {
  const { krabbeUrl } = await getSettings();
  if (await ext.permissions.contains({ origins: [originPattern(krabbeUrl)] })) {
    await syncContentScript(krabbeUrl);
  }
}
