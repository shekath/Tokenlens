/**
 * Bundles the CLI into one ES module: cli/dist/tokenticks.mjs.
 *
 * The engine is compiled in from ../src/lib, so the package and the web app
 * share one implementation. gpt-tokenizer stays an ordinary dependency - its
 * rank tables are megabytes, and npm caches them better than a bundle would.
 *
 *   VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… node cli/build.mjs
 *
 * Without those two variables the build still works; licence checks are then
 * disabled and every command runs on the free tier (it says so).
 */
import { build } from 'esbuild';
import { readFileSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
const out = join(here, 'dist', 'tokenticks.mjs');

await build({
  entryPoints: [join(here, 'src', 'bin.ts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  external: ['gpt-tokenizer', 'gpt-tokenizer/*'],
  banner: { js: '#!/usr/bin/env node' },
  define: {
    __TT_VERSION__: JSON.stringify(pkg.version),
    __TT_SUPABASE_URL__: JSON.stringify(process.env.VITE_SUPABASE_URL ?? ''),
    __TT_SUPABASE_KEY__: JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY ?? ''),
  },
  legalComments: 'none',
  logLevel: 'warning',
});
chmodSync(out, 0o755);
console.log(`built ${out}${process.env.VITE_SUPABASE_URL ? '' : ' (no licence server: free tier only)'}`);
