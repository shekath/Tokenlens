/**
 * The price history: a baseline plus a change log that rebuilds any day's prices.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pricesOn, recordHistory, renderHistory } from '../scripts/priceHistory.ts';
import { MODEL_DATA } from '../src/lib/models.data.ts';

const m = (id, inputPerM, outputPerM, extra = {}) => ({ id, apiId: id, label: id, vendor: 'OpenAI', tokenizer: 'o200k', context: 1000, inputPerM, outputPerM, ...extra });

test('the first run takes a baseline and records no events', () => {
  const { history, added } = recordHistory(null, [m('b', 2, 8), m('a', 1, 4, { cacheReadPerM: 0.1 })], '2026-09-26');
  assert.equal(history.startedOn, '2026-09-26');
  assert.deepEqual(Object.keys(history.baseline), ['a', 'b']);
  assert.deepEqual(history.baseline.a, { inputPerM: 1, outputPerM: 4, cacheReadPerM: 0.1 });
  assert.equal(added.length, 0);
});

test('price changes, new models, dropped cache rates and removals are logged and rebuilt', () => {
  let { history } = recordHistory(null, [m('a', 1, 4, { cacheReadPerM: 0.1 }), m('b', 2, 8)], '2026-09-26');
  ({ history } = recordHistory(history, [m('a', 0.8, 4), m('b', 2, 8), m('c', 3, 9)], '2026-09-27'));
  assert.deepEqual(history.events, [
    { date: '2026-09-27', model: 'a', kind: 'price', field: 'inputPerM', from: 1, to: 0.8 },
    { date: '2026-09-27', model: 'a', kind: 'price', field: 'cacheReadPerM', from: 0.1, to: null },
    { date: '2026-09-27', model: 'c', kind: 'added', prices: { inputPerM: 3, outputPerM: 9 } },
  ]);
  ({ history } = recordHistory(history, [m('a', 0.8, 4), m('c', 3, 9)], '2026-09-28'));
  assert.deepEqual(history.events.at(-1), { date: '2026-09-28', model: 'b', kind: 'removed' });

  assert.deepEqual(pricesOn(history, '2026-09-26').a, { inputPerM: 1, outputPerM: 4, cacheReadPerM: 0.1 });
  assert.deepEqual(pricesOn(history, '2026-09-27').a, { inputPerM: 0.8, outputPerM: 4 });
  assert.equal(pricesOn(history, '2026-09-26').c, undefined);
  assert.ok(pricesOn(history, '2026-09-27').b);
  assert.equal(pricesOn(history).b, undefined);
});

test('an unchanged registry adds nothing, and the log cannot go back in time', () => {
  const models = [m('a', 1, 4)];
  const { history } = recordHistory(null, models, '2026-09-26');
  const again = recordHistory(history, models, '2026-09-27');
  assert.equal(again.added.length, 0);
  assert.equal(again.history, history);
  assert.throws(() => recordHistory(history, models, '2026-09-25'), /already runs to/);
  assert.throws(() => recordHistory(history, models, '26/09/2026'), /YYYY-MM-DD/);
});

test('rendered history is valid JSON that round-trips', () => {
  let { history } = recordHistory(null, [m('a', 1, 4)], '2026-09-26');
  ({ history } = recordHistory(history, [m('a', 2, 4)], '2026-09-27'));
  assert.deepEqual(JSON.parse(renderHistory(history)), history);
});

test('the published history parses and only names known models', () => {
  const h = JSON.parse(readFileSync(new URL('../public/price-history.json', import.meta.url), 'utf8'));
  assert.match(h.startedOn, /^\d{4}-\d{2}-\d{2}$/);
  const ids = new Set(MODEL_DATA.map((x) => x.id));
  for (const id of Object.keys(pricesOn(h))) assert.ok(ids.has(id), `${id} is not in the registry`);
});
