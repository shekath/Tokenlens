/**
 * Cacheability linter. The claims it makes are specific ("these N tokens can't
 * cache; move lines 4-6"), so the tests pin the measurement and the advice, and
 * hold the detector to not crying wolf on ordinary prose and JSON.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyseCacheability,
  describeMove,
  findVolatile,
  monthlyCacheLoss,
  savingPerCachedToken,
  splitBlocks,
} from '../src/lib/cacheability.ts';
import { MODELS_BY_ID } from '../src/lib/models.ts';
import { encodeBase, loadPrimary } from '../src/lib/tokenize.ts';

const count = (s) => (s.length === 0 ? 0 : encodeBase(s).o200k.length);

before(async () => {
  await loadPrimary();
});

const STABLE = [
  'You review pull requests for a payments service written in Go.',
  'Flag any change that logs card numbers, even partially.',
  'Prefer small, concrete suggestions over rewrites, and cite the line.',
  'Never approve a change that removes a test without replacing it.',
].join('\n');

const PROMPT = [
  'Current time: 2026-09-24T10:15:00Z',
  'Request id: 3f2c9a1e-8b7d-4c6e-9f10-2a3b4c5d6e7f',
  '',
  STABLE,
  '',
  '## Output format',
  'Return a JSON list of findings with file, line and severity.',
].join('\n');

test('finds the kinds of value that change per call', () => {
  const kinds = (t) => findVolatile(t).map((h) => h.kind);
  assert.deepEqual(kinds('Hello {{ user_name }}, welcome back.'), ['templateVar']);
  assert.deepEqual(kinds('Hello ${user.name}.'), ['templateVar']);
  assert.deepEqual(kinds('Hello <%= name %>.'), ['templateVar']);
  assert.deepEqual(kinds('Summarise {document} for {audience}.'), ['templateVar', 'templateVar']);
  assert.deepEqual(kinds('trace 3f2c9a1e-8b7d-4c6e-9f10-2a3b4c5d6e7f'), ['uuid']);
  assert.deepEqual(kinds('It is 2026-09-24 14:03:11 now'), ['timestamp']);
  assert.deepEqual(kinds('Meeting at 9:30 pm today'), ['timestamp']);
  assert.deepEqual(kinds('Today is 2026-09-24.'), ['date']);
  assert.deepEqual(kinds('Today is September 24, 2026.'), ['date']);
  assert.deepEqual(kinds('sent 1727172000 seconds'), ['epoch']);
  assert.deepEqual(kinds('span 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b'), ['hexId']);
});

test('a timestamp is one hit, not a timestamp plus a date', () => {
  const hits = findVolatile('At 2026-09-24T10:15:00Z the job ran.');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, 'timestamp');
});

test('does not flag ordinary prose, JSON or code', () => {
  const clean = [
    'Answer in three bullet points. Use British spelling.',
    '{"format": "json", "max_items": 10}',
    'Version 4.1 supports 128000 tokens of context.',
    'Call the tool get_weather with a city name.',
    'Deadbeef is not an id.',
  ].join('\n');
  assert.deepEqual(findVolatile(clean), []);
});

test('reports each hit on the right line', () => {
  const hits = findVolatile(PROMPT);
  assert.deepEqual(
    hits.map((h) => [h.line, h.kind]),
    [
      [1, 'timestamp'],
      [2, 'uuid'],
    ],
  );
});

test('blocks split on blank lines and never inside a code fence', () => {
  const blocks = splitBlocks(['a', 'b', '', '```', 'x', '', 'y', '```', '', 'c'].join('\n'));
  assert.deepEqual(
    blocks.map((b) => [b.startLine, b.endLine]),
    [
      [1, 2],
      [4, 8],
      [10, 10],
    ],
  );
});

test('volatile header ahead of stable instructions: the loss is measured and the fix is a move', () => {
  const r = analyseCacheability(PROMPT, count);
  assert.equal(r.prefixTokens, count('Current time: '));
  assert.ok(r.reorderedPrefixTokens > r.prefixTokens * 5, 'reordering exposes the stable body');
  assert.equal(r.lostTokens, r.reorderedPrefixTokens - r.prefixTokens);
  assert.ok(r.lostFraction > 0.8);
  assert.equal(r.moves.length, 1);
  assert.deepEqual([r.moves[0].startLine, r.moves[0].endLine], [1, 2]);
  assert.equal(r.lastStableLine, 10);
  assert.equal(describeMove(r.moves[0], r.lastStableLine), 'Move lines 1–2 (date and time, uuid) below line 10');
  // The reordered prompt keeps every line and puts the volatile block last.
  assert.ok(r.reordered.startsWith(STABLE.split('\n')[0]));
  assert.ok(r.reordered.endsWith('Request id: 3f2c9a1e-8b7d-4c6e-9f10-2a3b4c5d6e7f'));
  for (const line of PROMPT.split('\n').filter(Boolean)) assert.ok(r.reordered.includes(line), line);
});

test('volatile content already at the end costs nothing and suggests nothing', () => {
  const tail = `${STABLE}\n\nUser question for {{ ticket_id }}: why was I charged twice?`;
  const r = analyseCacheability(tail, count);
  assert.equal(r.moves.length, 0);
  assert.equal(r.lostTokens, 0);
  assert.equal(r.reordered, tail);
  assert.ok(r.prefixTokens > 0 && r.prefixTokens < r.totalTokens);
});

test('a clean prompt caches in full', () => {
  const r = analyseCacheability(STABLE, count);
  assert.equal(r.hits.length, 0);
  assert.equal(r.prefixTokens, r.totalTokens);
  assert.equal(r.lostTokens, 0);
});

test('a dismissed value stops counting, everywhere it appears', () => {
  const text = `Knowledge cutoff: 2025-01-01\n\n${STABLE}\n\nAgain: 2025-01-01`;
  const before = analyseCacheability(text, count);
  assert.equal(before.hits.length, 2);
  assert.ok(before.lostTokens > 0);
  const after = analyseCacheability(text, count, { dismissed: new Set([before.hits[0].key]) });
  assert.equal(after.hits.length, 0);
  assert.equal(after.lostTokens, 0);
});

test('high-only mode ignores the medium-confidence patterns', () => {
  const r = analyseCacheability(`As of 2025-01-01\n\n${STABLE}`, count, { minConfidence: 'high' });
  assert.equal(r.hits.length, 0);
});

test('an ignore callback (the CLI path) filters hits', () => {
  const r = analyseCacheability(PROMPT, count, { ignore: (h) => h.kind === 'uuid' || h.kind === 'timestamp' });
  assert.equal(r.hits.length, 0);
});

test('CRLF input gives the same line numbers as LF', () => {
  const crlf = findVolatile(PROMPT.replace(/\n/g, '\r\n'));
  const lf = findVolatile(PROMPT);
  assert.deepEqual(
    crlf.map((h) => h.line),
    lf.map((h) => h.line),
  );
});

test('the saving per cached token follows the published rates', () => {
  const opus = MODELS_BY_ID['claude-opus-5'];
  // $5 base, $0.50 read, $6.25 write. At 100% hits: 5 - 0.5 = $4.50 per MTok.
  assert.ok(Math.abs(savingPerCachedToken(opus, 1) - 4.5e-6) < 1e-15);
  // At 0% hits every call writes at 1.25x: no saving, never a negative one.
  assert.equal(savingPerCachedToken(opus, 0), 0);
  // 3,000 lost tokens x 1,000 calls/day x 30 days x $4.50/MTok = $405.
  assert.ok(Math.abs(monthlyCacheLoss(3000, 1000, opus, 1) - 405) < 1e-9);
});

test('a model without cache rates gets null, not zero', () => {
  const noCache = { ...MODELS_BY_ID['claude-opus-5'], cacheReadPerM: undefined, cacheWritePerM: undefined };
  assert.equal(savingPerCachedToken(noCache, 0.9), null);
  assert.equal(monthlyCacheLoss(1000, 1000, noCache, 0.9), null);
});
