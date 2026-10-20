import { ext } from '../platform.ts';
import { originPattern } from '../storage.ts';

const SCRIPT_ID = 'krabbe-bridge';

export async function syncContentScript(krabbeUrl: string, previousUrl?: string): Promise<void> {
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
    if (old !== pattern) await ext.permissions.remove({ origins: [old] });
  }
}
