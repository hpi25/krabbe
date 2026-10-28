import { originPattern } from '../storage.ts';

export const SCRIPT_ID = 'krabbe-bridge';

export interface ScriptingDeps {
  hasOrigin: (pattern: string) => Promise<boolean>;
  getRegistered: () => Promise<{ id: string; matches?: string[] }[]>;
  register: (matches: string[]) => Promise<void>;
  unregister: () => Promise<void>;
}

/** Match patterns of the instances the user has granted host permission for. */
export async function permittedPatterns(instances: string[], hasOrigin: ScriptingDeps['hasOrigin']): Promise<string[]> {
  const patterns = [...new Set(instances.map(originPattern))];
  const granted = await Promise.all(patterns.map(hasOrigin));
  return patterns.filter((_, i) => granted[i]).sort();
}

/** Makes the bridge content script match exactly the permitted instances. Idempotent. */
export async function syncContentScripts(instances: string[], deps: ScriptingDeps): Promise<void> {
  const wanted = await permittedPatterns(instances, deps.hasOrigin);
  const current = (await deps.getRegistered()).find((s) => s.id === SCRIPT_ID);
  const have = [...(current?.matches ?? [])].sort();
  if (current && have.join('\n') === wanted.join('\n')) return;
  if (current) await deps.unregister();
  if (wanted.length > 0) await deps.register(wanted);
}

/** Serializes syncs so overlapping triggers (startup + storage change) can't race register/unregister. */
export function serialized(fn: () => Promise<void>): () => Promise<void> {
  let chain = Promise.resolve();
  return () => {
    chain = chain.then(fn, fn).catch((e) => console.error('Krabbe: content script sync failed', e));
    return chain;
  };
}
