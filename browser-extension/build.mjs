import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { buildManifest } from './src/manifest.ts';

const arg = process.argv.find((a) => a.startsWith('--target='));
const target = arg ? arg.slice('--target='.length) : 'firefox';
if (target !== 'firefox') throw new Error(`Unknown target: ${target}`);

const out = `dist/${target}`;
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// Entries that don't exist yet are skipped so later tasks just drop files in.
const entries = {
  background: 'src/background.ts',
  content: 'src/content/index.ts',
  options: 'src/options/options.ts',
  popup: 'src/popup/popup.ts',
};
const entryPoints = Object.fromEntries(Object.entries(entries).filter(([, p]) => existsSync(p)));

await build({
  entryPoints,
  outdir: out,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'firefox128',
  loader: { '.css': 'text' },
  logLevel: 'info',
});

for (const html of ['src/popup/popup.html', 'src/options/options.html']) {
  if (existsSync(html)) cpSync(html, `${out}/${html.split('/').pop()}`);
}
cpSync('res', `${out}/res`, { recursive: true });
writeFileSync(`${out}/manifest.json`, JSON.stringify(buildManifest(target), null, 2) + '\n');
