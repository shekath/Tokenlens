/** Batch dataset parsing and forecasting. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  forecastCost,
  forecastTokens,
  forecastToCsv,
  guessPromptColumn,
  parseCsv,
  parseDataset,
  parseJsonl,
} from '../src/lib/batch.ts';
import { encodeBase, loadPrimary, FAMILY_INFO } from '../src/lib/tokenize.ts';
import { MODELS_BY_ID } from '../src/lib/models.ts';

const count = (s) => (s.length === 0 ? 0 : encodeBase(s).o200k.length);
const scale = (m, n) => Math.round(n * FAMILY_INFO[m.tokenizer].factor);

before(async () => {
  await loadPrimary();
});

const CSV = `id,prompt,notes
1,Summarise this report,first
2,Translate to French,second
3,Extract the entities,third`;

test('CSV headers and rows are parsed', () => {
  const d = parseCsv(CSV, 1000);
  assert.deepEqual(d.columns, ['id', 'prompt', 'notes']);
  assert.equal(d.rows.length, 3);
  assert.equal(d.rows[0].prompt, 'Summarise this report');
});

test('the row cap truncates and reports how many were dropped', () => {
  const d = parseCsv(CSV, 2);
  assert.equal(d.rows.length, 2);
  assert.equal(d.truncated, 1);
});

test('JSONL objects are flattened into columns', () => {
  const jsonl = '{"prompt":"hello","meta":{"lang":"en"}}\n{"prompt":"bonjour","meta":{"lang":"fr"}}';
  const d = parseJsonl(jsonl, 1000);
  assert.equal(d.rows.length, 2);
  assert.ok(d.columns.includes('prompt'));
  assert.ok(d.columns.includes('meta.lang'));
  assert.equal(d.rows[1]['meta.lang'], 'fr');
});

test('malformed JSONL lines are skipped and counted, not fatal', () => {
  const d = parseJsonl('{"prompt":"ok"}\nnot json at all\n{"prompt":"fine"}', 1000);
  assert.equal(d.rows.length, 2);
  assert.equal(d.warnings.length, 1);
  assert.ok(/not valid JSON/.test(d.warnings[0]));
});

test('the format is chosen from the file extension', () => {
  assert.equal(parseDataset('x.jsonl', '{"a":1}', 10).format, 'jsonl');
  assert.equal(parseDataset('x.ndjson', '{"a":1}', 10).format, 'jsonl');
  assert.equal(parseDataset('x.csv', 'a\n1', 10).format, 'csv');
});

test('an obvious prompt column is picked by name', () => {
  assert.equal(guessPromptColumn(parseCsv(CSV, 10)), 'prompt');
  assert.equal(guessPromptColumn(parseCsv('id,question\n1,why', 10)), 'question');
});

test('with no obvious name, the longest text column wins', () => {
  const d = parseCsv('id,label,body\n1,a,"a much longer passage of text here"', 10);
  assert.equal(guessPromptColumn(d), 'body');
});

test('an empty dataset yields no column rather than throwing', () => {
  assert.equal(guessPromptColumn({ columns: [], rows: [], truncated: 0, format: 'csv', warnings: [] }), null);
});

test('token forecasting sums the column and reports the spread', () => {
  const d = parseCsv(CSV, 10);
  const f = forecastTokens(d, 'prompt', count);
  assert.equal(f.rows, 3);
  assert.equal(f.empty, 0);
  assert.ok(f.totalInputTokens > 0);
  assert.ok(f.min <= f.median && f.median <= f.max);
  assert.ok(Math.abs(f.mean - f.totalInputTokens / 3) < 1e-9);
});

test('a blank prompt cell in a populated row is counted, not silently priced', () => {
  const d = parseCsv('id,prompt\n1,hello\n2,\n3,world', 10);
  const f = forecastTokens(d, 'prompt', count);
  assert.equal(f.rows, 3);
  assert.equal(f.empty, 1);
  assert.equal(f.min, 0, 'the blank row contributes a zero, not a skip');
});

test('a wholly blank line is dropped rather than counted as a row', () => {
  // skipEmptyLines: 'greedy' - a trailing newline should not become a priced row.
  const d = parseCsv('prompt\nhello\n\nworld\n', 10);
  assert.equal(d.rows.length, 2);
});

test('cost is computed per model and sorted cheapest first', () => {
  const models = [MODELS_BY_ID['claude-opus-5'], MODELS_BY_ID['gpt-5'], MODELS_BY_ID['claude-haiku-4-5']];
  const costs = forecastCost(100_000, 200, 500, models, scale);
  assert.equal(costs.length, 3);
  for (let i = 1; i < costs.length; i += 1) {
    assert.ok(costs[i - 1].total <= costs[i].total, 'not sorted by total');
  }
});

test('each model is priced against its own vocabulary, not one shared count', () => {
  const opus = MODELS_BY_ID['claude-opus-5'];
  const gpt = MODELS_BY_ID['gpt-5'];
  const costs = forecastCost(100_000, 0, 1, [opus, gpt], scale);
  const byId = Object.fromEntries(costs.map((c) => [c.model.id, c]));
  assert.equal(byId['gpt-5'].inputTokens, 100_000, 'o200k is exact, so unscaled');
  assert.ok(byId['claude-opus-5'].inputTokens > 100_000, 'Claude is estimated upward');
});

test('input plus output equals the total, and batch applies the published discount', () => {
  const m = MODELS_BY_ID['claude-opus-5'];
  const [c] = forecastCost(1_000_000, 100, 1_000, [m], scale);
  assert.ok(Math.abs(c.inputCost + c.outputCost - c.total) < 1e-9);
  assert.ok(Math.abs(c.batchTotal - c.total * (1 - m.batchDiscount)) < 1e-9);
});

test('a model with no batch endpoint reports null rather than a fake discount', () => {
  const m = MODELS_BY_ID['grok-4'];
  const [c] = forecastCost(1000, 10, 10, [m], scale);
  assert.equal(c.batchTotal, null);
});

test('CSV export has a header and one line per model', () => {
  const models = [MODELS_BY_ID['gpt-5'], MODELS_BY_ID['claude-haiku-4-5']];
  const csv = forecastToCsv(forecastCost(1000, 10, 5, models, scale), 5);
  const lines = csv.split('\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith('model,vendor,rows'));
  assert.equal(lines[1].split(',').length, 9);
});
