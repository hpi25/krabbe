import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { buildManifest, TARGETS } from './src/manifest.ts';

// `node build.mjs` builds every target; `--target=chrome` builds one.
const arg = process.argv.find((a) => a.startsWith('--target='));
const targets = arg ? [arg.slice('--target='.length)] : TARGETS;
for (const t of targets) if (!TARGETS.includes(t)) throw new Error(`Unknown target: ${t}`);

for (const target of targets) {
  const out = `dist/${target}`;
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  // IIFE everywhere: content.js is injected as a classic script, and the
  // background and options page don't need modules once bundled.
  await build({
    entryPoints: {
      background: 'src/background/index.ts',
      content: 'src/content/bridge.ts',
      options: 'src/options/options.ts',
    },
    outdir: out,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: target === 'firefox' ? 'firefox128' : 'chrome121',
    logLevel: 'info',
  });

  cpSync('src/options/options.html', `${out}/options.html`);
  cpSync('src/options/options.css', `${out}/options.css`);
  cpSync('res', `${out}/res`, { recursive: true });
  writeFileSync(`${out}/manifest.json`, JSON.stringify(buildManifest(target), null, 2) + '\n');
}
