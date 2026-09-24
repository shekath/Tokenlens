/**
 * Syncs the model registry (src/lib/models.data.ts) with LiteLLM's price list.
 * The policy - what is applied, what is held for review - is in modelSync.ts.
 *
 *   node --experimental-strip-types scripts/sync-models.mjs [options]
 *
 *   --mode safe|all     safe: apply only the changes that need no review (default)
 *                       all:  apply everything, for a review pull request
 *   --source <url|file> price list to read (default: LiteLLM on GitHub)
 *   --report <file>     write a Markdown report here
 *   --date YYYY-MM-DD   "prices as of" date to stamp (default: today, UTC)
 *   --max-additions <n> hold new models for review above this many in one run
 *                       (default 12). Raise it only for a deliberate catch-up.
 *   --dry-run           plan and report, write nothing
 *
 * In GitHub Actions it also writes step outputs: changed=true|false,
 * applied=<n>, held=<n>.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { planSync, renderDataFile, renderReport } from './modelSync.ts';

const DEFAULT_SOURCE =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const DATA_FILE = new URL('../src/lib/models.data.ts', import.meta.url);

const { values: opts } = parseArgs({
  options: {
    mode: { type: 'string', default: 'safe' },
    source: { type: 'string', default: DEFAULT_SOURCE },
    report: { type: 'string' },
    date: { type: 'string', default: new Date().toISOString().slice(0, 10) },
    'dry-run': { type: 'boolean', default: false },
    'max-additions': { type: 'string' },
  },
});

if (!['safe', 'all'].includes(opts.mode)) throw new Error('--mode is safe or all');
if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.date)) throw new Error('--date is YYYY-MM-DD');

async function loadSource(src) {
  const text = /^https?:\/\//.test(src)
    ? await fetch(src, { signal: AbortSignal.timeout(30_000) }).then((r) => {
        if (!r.ok) throw new Error(`${src}: HTTP ${r.status}`);
        return r.text();
      })
    : readFileSync(src, 'utf8');
  const data = JSON.parse(text);
  // A truncated or reshaped file must stop the run, not empty the registry of
  // prices: a real copy has thousands of entries and always carries gpt-4o.
  const n = data && typeof data === 'object' ? Object.keys(data).length : 0;
  if (n < 500 || !data['gpt-4o']?.input_cost_per_token) {
    throw new Error(`${src} does not look like the LiteLLM price list (${n} entries); nothing was changed.`);
  }
  return data;
}

const { MODEL_DATA, PRICING_AS_OF } = await import(DATA_FILE.href);
const upstream = await loadSource(opts.source);
const maxAdditions = opts['max-additions'] === undefined ? undefined : Number(opts['max-additions']);
if (maxAdditions !== undefined && !(maxAdditions >= 0)) throw new Error('--max-additions is a number');
const plan = planSync(MODEL_DATA, upstream, opts.date, maxAdditions);
const next = opts.mode === 'all' ? plan.all : plan.safe;
const applied = plan.changes.filter((c) => opts.mode === 'all' || !c.review);
const held = plan.changes.filter((c) => c.review);
const changed = applied.length > 0;

const source = opts.source === DEFAULT_SOURCE ? '[LiteLLM price list](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json)' : opts.source;
const report = renderReport(plan, opts.mode, source);

if (!opts['dry-run']) {
  if (changed) writeFileSync(DATA_FILE, renderDataFile(next, opts.date));
  if (opts.report) writeFileSync(opts.report, `${report}\n`);
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\napplied=${applied.length}\nheld=${held.length}\n`);
}

console.log(
  `${opts.mode === 'all' ? 'All changes' : 'Safe changes'}: ${applied.length} applied${opts['dry-run'] ? ' (dry run)' : ''}, ` +
    `${opts.mode === 'safe' ? `${held.length} held for review, ` : ''}${plan.unmatched.length} unmatched new ids, ` +
    `${plan.missing.length} listed models missing upstream. Prices were as of ${PRICING_AS_OF}.`,
);
if (opts['dry-run']) console.log(`\n${report}`);
