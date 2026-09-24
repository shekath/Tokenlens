/** Search and company filter for the dashboard's model table. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterModels, matchesQuery, normaliseName, vendorCounts } from '../src/lib/modelFilter.ts';
import { MODELS, MODELS_BY_ID, VENDORS } from '../src/lib/models.ts';

const rows = MODELS.map((model) => ({ model }));
const ids = (list) => list.map((r) => r.model.id);
const find = (q, vendors = new Set()) => ids(filterModels(rows, q, vendors));

test('names normalise across the ways people type them', () => {
  assert.equal(normaliseName('GPT-5.4 mini'), 'gpt 5 4 mini');
  assert.equal(normaliseName('gpt5.4'), 'gpt 5 4');
  assert.equal(normaliseName('claude_sonnet-4.6'), 'claude sonnet 4 6');
});

test('every spelling of one model finds it', () => {
  for (const q of ['GPT-5.4 mini', 'gpt-5-4-mini', 'gpt5.4 mini', 'gpt 5.4 mini']) {
    assert.ok(find(q).includes('gpt-5-4-mini'), q);
  }
});

test('every word must match: "sonnet 4" narrows to Sonnet 4.x, not every Claude 4', () => {
  const found = find('sonnet 4');
  assert.ok(found.length > 0);
  for (const id of found) assert.match(id, /sonnet-4/);
});

test('a number matches whole, so "4" does not match 14', () => {
  const m = { ...MODELS_BY_ID['gpt-4o'], id: 'x-14', apiId: 'x-14', label: 'X 14', vendor: 'OpenAI' };
  assert.equal(matchesQuery(m, '4'), false);
  assert.equal(matchesQuery(MODELS_BY_ID['claude-sonnet-4-6'], '4'), true);
});

test('the company name finds all of its models', () => {
  const google = find('google');
  assert.ok(google.length >= 3);
  assert.ok(google.every((id) => MODELS_BY_ID[id].vendor === 'Google'));
});

test('an empty query and no company chosen show everything', () => {
  assert.equal(find('').length, MODELS.length);
  assert.equal(find('   ').length, MODELS.length);
});

test('company filter, alone and combined with search', () => {
  const both = find('', new Set(['Anthropic', 'xAI']));
  assert.ok(both.every((id) => ['Anthropic', 'xAI'].includes(MODELS_BY_ID[id].vendor)));
  assert.equal(both.length, MODELS.filter((m) => m.vendor === 'Anthropic' || m.vendor === 'xAI').length);
  assert.deepEqual(find('opus', new Set(['OpenAI'])), [], 'a search outside the chosen company finds nothing');
});

test('nothing matching returns an empty list, not an error', () => {
  assert.deepEqual(find('no such model zzz'), []);
});

test('company counts follow registry order and cover every row', () => {
  const counts = vendorCounts(rows, VENDORS);
  assert.deepEqual(counts.map((c) => c.vendor), VENDORS.filter((v) => MODELS.some((m) => m.vendor === v)));
  assert.equal(counts.reduce((s, c) => s + c.count, 0), MODELS.length);
  // A free account's shortlist only offers the companies it actually has.
  const free = vendorCounts(rows.filter((r) => ['gpt-5', 'claude-opus-5'].includes(r.model.id)), VENDORS);
  assert.deepEqual(free, [{ vendor: 'Anthropic', count: 1 }, { vendor: 'OpenAI', count: 1 }]);
});
