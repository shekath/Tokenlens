/**
 * Usage reconciliation. The number that matters is the variance and its split
 * into volume and per-call effects, which must add up exactly; the risks are
 * pricing a row at the wrong model's rate, and double-charging cached input.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import {
  SAMPLE_USAGE_CSV,
  detectColumns,
  explain,
  inputIncludesCache,
  mappingProblems,
  matchModel,
  normaliseHeader,
  parseNumber,
  priceRow,
  reconcile,
  summariseUsage,
  toUsageRows,
} from '../src/lib/reconcile.ts';
import { MODELS, MODELS_BY_ID } from '../src/lib/models.ts';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const fmt = (n) => `$${n.toFixed(2)}`;

test('headers normalise across the spellings exports use', () => {
  assert.equal(normaliseHeader(' Input Tokens '), 'input_tokens');
  assert.equal(normaliseHeader('Cost (USD)'), 'cost');
  assert.equal(normaliseHeader('cache-read-input-tokens'), 'cache_read_input_tokens');
});

test('an Anthropic-shaped export maps every field', () => {
  const map = detectColumns([
    'date',
    'model',
    'uncached_input_tokens',
    'cache_read_input_tokens',
    'cache_creation_input_tokens',
    'output_tokens',
  ]);
  assert.deepEqual(map, {
    date: 'date',
    model: 'model',
    inputTokens: 'uncached_input_tokens',
    cacheReadTokens: 'cache_read_input_tokens',
    cacheWriteTokens: 'cache_creation_input_tokens',
    outputTokens: 'output_tokens',
  });
});

test('an OpenAI-shaped export maps every field', () => {
  const map = detectColumns(['start_time', 'model', 'input_tokens', 'output_tokens', 'input_cached_tokens', 'num_model_requests']);
  assert.equal(map.date, 'start_time');
  assert.equal(map.inputTokens, 'input_tokens');
  assert.equal(map.cacheReadTokens, 'input_cached_tokens');
  assert.equal(map.requests, 'num_model_requests');
});

test('one column is never claimed by two fields', () => {
  const map = detectColumns(['model', 'input', 'output']);
  assert.equal(map.inputTokens, 'input');
  assert.equal(map.outputTokens, 'output');
  assert.equal(new Set(Object.values(map)).size, Object.values(map).length);
});

test('mapping problems name what is missing', () => {
  assert.equal(mappingProblems({ model: 'm', cost: 'c' }).length, 0);
  assert.equal(mappingProblems({ model: 'm', inputTokens: 'i' }).length, 0);
  assert.match(mappingProblems({ cost: 'c' })[0], /model/);
  assert.match(mappingProblems({ model: 'm' })[0], /cost column/);
});

test('numbers parse with currency and separators; junk is NaN', () => {
  assert.equal(parseNumber('$1,234.50'), 1234.5);
  assert.equal(parseNumber('1 234'), 1234);
  assert.equal(parseNumber(''), 0);
  assert.equal(parseNumber('-'), 0);
  assert.ok(Number.isNaN(parseNumber('n/a')));
});

test('model names match through vendor prefixes and snapshot dates, never by prefix', () => {
  assert.equal(matchModel('claude-sonnet-5-20260801', MODELS)?.id, 'claude-sonnet-5');
  assert.equal(matchModel('anthropic/claude-opus-5', MODELS)?.id, 'claude-opus-5');
  assert.equal(matchModel('gpt-4o-mini-2024-07-18', MODELS)?.id, 'gpt-4o-mini');
  assert.equal(matchModel('GPT-4.1', MODELS)?.id, 'gpt-4-1');
  assert.equal(matchModel('claude-haiku-4-5@20251001', MODELS)?.id, 'claude-haiku-4-5');
  // A different product with a shared prefix must not borrow a rate.
  assert.equal(matchModel('gpt-4o-mini-audio-preview', MODELS), null);
  assert.equal(matchModel('', MODELS), null);
});

test('cached input is included for OpenAI and separate for Anthropic unless overridden', () => {
  assert.equal(inputIncludesCache(MODELS_BY_ID['gpt-5'], 'auto'), true);
  assert.equal(inputIncludesCache(MODELS_BY_ID['claude-opus-5'], 'auto'), false);
  assert.equal(inputIncludesCache(MODELS_BY_ID['claude-opus-5'], 'included'), true);
  assert.equal(inputIncludesCache(MODELS_BY_ID['gpt-5'], 'separate'), false);
});

test('pricing never double-charges cached reads', () => {
  const opus = MODELS_BY_ID['claude-opus-5'];
  const row = { date: null, rawModel: 'x', input: 1e6, output: 1e6, cacheRead: 1e6, cacheWrite: 1e6, requests: null, cost: null };
  // Separate: 1M base + 1M out + 1M read + 1M write = 5 + 25 + 0.5 + 6.25.
  close(priceRow(row, opus, 'separate'), 36.75);
  // Included: the 1M input already contains the 1M read, so no base input is left.
  close(priceRow(row, opus, 'included'), 31.75);
});

test('rows with no model or unparseable numbers are skipped and counted', () => {
  const map = { model: 'model', inputTokens: 'in', cost: 'cost' };
  const { rows, skipped } = toUsageRows(
    [
      { model: 'gpt-5', in: '100', cost: '1.00' },
      { model: '', in: '100', cost: '1.00' },
      { model: 'gpt-5', in: 'lots', cost: '1.00' },
      { model: 'gpt-5', in: '0', cost: '' },
    ],
    map,
  );
  assert.equal(rows.length, 1);
  assert.equal(skipped, 3);
});

test('a cost column wins over list rates; unmatched models without cost are unpriced', () => {
  const rows = [
    { date: '2026-08-01', rawModel: 'gpt-5', input: 1e6, output: 0, cacheRead: 0, cacheWrite: 0, requests: 10, cost: 7 },
    { date: '2026-08-03', rawModel: 'gpt-5', input: 1e6, output: 0, cacheRead: 0, cacheWrite: 0, requests: 10, cost: null },
    { date: '2026-08-02', rawModel: 'mystery-model', input: 5, output: 5, cacheRead: 0, cacheWrite: 0, requests: 1, cost: null },
  ];
  const s = summariseUsage(rows, MODELS);
  const gpt = s.byModel.find((g) => g.key === 'gpt-5');
  close(gpt.cost, 7 + MODELS_BY_ID['gpt-5'].inputPerM);
  assert.equal(gpt.costSource, 'mixed');
  assert.equal(gpt.requests, 20);
  const mystery = s.byModel.find((g) => g.key === 'raw:mystery-model');
  assert.equal(mystery.unpricedRows, 1);
  assert.equal(mystery.costSource, 'none');
  assert.equal(s.unpricedRows, 1);
  assert.equal(s.days, 3);
  assert.equal(s.firstDate, '2026-08-01');
  assert.equal(s.lastDate, '2026-08-03');
});

test('a manual override prices an unmatched model', () => {
  const rows = [{ date: null, rawModel: 'my-ft-model', input: 1e6, output: 0, cacheRead: 0, cacheWrite: 0, requests: null, cost: null }];
  const s = summariseUsage(rows, MODELS, { overrides: { 'my-ft-model': 'gpt-4-1' } });
  assert.equal(s.byModel[0].key, 'gpt-4-1');
  close(s.totalCost, MODELS_BY_ID['gpt-4-1'].inputPerM);
  assert.equal(s.days, null);
});

test('volume and per-call effects add up to the variance exactly', () => {
  const summary = {
    byModel: [
      {
        key: 'claude-opus-5',
        model: MODELS_BY_ID['claude-opus-5'],
        rawNames: ['claude-opus-5'],
        rows: 30,
        requests: 42_000,
        inputTokens: 42_000 * 3_000,
        outputTokens: 42_000 * 1_000,
        cacheReadTokens: 0,
        cost: 1_470,
        unpricedRows: 0,
        costSource: 'rates',
      },
    ],
    totalCost: 1_470,
    firstDate: '2026-08-01',
    lastDate: '2026-08-30',
    days: 30,
    rows: 30,
    unpricedRows: 0,
  };
  const plan = { id: 'e1', title: 'Support bot', modelId: 'claude-opus-5', inputTokens: 2_000, outputTokens: 500, costPerCall: 0.0225, callsPerDay: 1_000 };
  const r = reconcile(summary, [plan], 30);
  const line = r.lines[0];
  close(line.estimated, 30_000 * 0.0225);
  close(line.volumeEffect + line.perCallEffect, line.delta, 1e-6);
  close(line.volumeEffect, 12_000 * 0.0225);
  close(line.inputRatio, 1.5);
  close(line.outputRatio, 2);
  close(r.deltaFraction, (1_470 - 675) / 675);

  const why = explain(r, fmt);
  assert.equal(why.length, 2);
  assert.match(why[0], /each call cost more than planned .* input 1\.5× plan, output 2\.0× plan per call/);
  assert.match(why[1], /40% more calls than planned \(\+\$270\.00\)/);
});

test('unplanned models and unused estimates are both reported', () => {
  const summary = summariseUsage(
    [{ date: '2026-08-01', rawModel: 'gpt-5', input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 1, cost: 12 }],
    MODELS,
  );
  const r = reconcile(summary, [{ id: 'e', title: 'Nightly batch', modelId: 'claude-haiku-4-5', inputTokens: 100, outputTokens: 10, costPerCall: 0.001, callsPerDay: 100 }], 1);
  assert.deepEqual(r.lines.map((l) => l.status).sort(), ['unplanned', 'unused']);
  const why = explain(r, fmt).join(' ');
  assert.match(why, /GPT-5 was not in any estimate: \$12\.00/);
  assert.match(why, /Nightly batch was estimated at \$0\.10 but has no usage/);
});

test('without request counts the variance is reported whole, with a pointer to split it', () => {
  const summary = summariseUsage(
    [{ date: null, rawModel: 'gpt-5', input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: null, cost: 50 }],
    MODELS,
  );
  const r = reconcile(summary, [{ id: 'e', title: 'x', modelId: 'gpt-5', inputTokens: 1, outputTokens: 1, costPerCall: 0.01, callsPerDay: 100 }], 30);
  assert.equal(r.lines[0].volumeEffect, null);
  assert.match(explain(r, fmt)[0], /Add a requests column/);
});

test('the bundled sample parses, maps and prices end to end', () => {
  const parsed = Papa.parse(SAMPLE_USAGE_CSV, { header: true, skipEmptyLines: 'greedy' });
  const map = detectColumns(parsed.meta.fields);
  assert.deepEqual(mappingProblems(map), []);
  const { rows, skipped } = toUsageRows(parsed.data, map);
  assert.equal(skipped, 0);
  const s = summariseUsage(rows, MODELS);
  assert.equal(s.days, 30);
  assert.deepEqual(s.byModel.map((g) => g.key).sort(), ['claude-haiku-4-5', 'claude-sonnet-5']);
  assert.equal(s.unpricedRows, 0);
  assert.ok(s.totalCost > 0);
});

test('a bigger but cheaper input is explained by its cached share, not left as a contradiction', () => {
  const parsed = Papa.parse(SAMPLE_USAGE_CSV, { header: true, skipEmptyLines: 'greedy' });
  const { rows } = toUsageRows(parsed.data, detectColumns(parsed.meta.fields));
  const s = summariseUsage(rows, MODELS);
  const r = reconcile(s, [{ id: 'e', title: 'Support bot', modelId: 'claude-sonnet-5', inputTokens: 1_200, outputTokens: 700, costPerCall: 0.012, callsPerDay: 1_000 }], s.days);
  const line = r.lines.find((l) => l.key === 'claude-sonnet-5');
  assert.ok(line.perCallEffect < 0, 'cheaper per call');
  assert.ok(line.inputRatio > 3, 'with far more input');
  const why = explain(r, fmt).find((t) => t.startsWith('Claude Sonnet 5: each call'));
  assert.match(why, /input 3\.6× plan \(\d+% of it cached reads\)/);
});
