/**
 * Brings the price history (public/price-history.json) up to date with the
 * model registry. Run by the daily price sync; safe to run by hand.
 *
 *   node --experimental-strip-types scripts/price-history.mjs [--date YYYY-MM-DD] [--check]
 *
 *   --date   the day to stamp new events with (default: today, UTC)
 *   --check  change nothing; exit 1 if the history is behind the registry
 *
 * The file is published with the site, so it is readable at
 * <site>/price-history.json by the price-change alerts and anyone else.
 */
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { recordHistory, renderHistory } from './priceHistory.ts';

const FILE = new URL('../public/price-history.json', import.meta.url);
const { values: opts } = parseArgs({
  options: {
    date: { type: 'string', default: new Date().toISOString().slice(0, 10) },
    check: { type: 'boolean', default: false },
  },
});

const { MODEL_DATA } = await import(new URL('../src/lib/models.data.ts', import.meta.url).href);
const before = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : null;
const { history, added } = recordHistory(before, MODEL_DATA, opts.date);
const changed = before === null || added.length > 0;

if (opts.check) {
  if (changed) {
    console.error(`Price history is behind the registry by ${added.length} change(s). Run: node --experimental-strip-types scripts/price-history.mjs`);
    process.exit(1);
  }
  console.log('Price history matches the registry.');
} else {
  if (changed) writeFileSync(FILE, renderHistory(history));
  console.log(
    before === null
      ? `Started the price history on ${opts.date} with ${Object.keys(history.baseline).length} models.`
      : `${added.length} price change(s) recorded for ${opts.date}.`,
  );
}
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `history_changed=${changed}\n`);
