import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { textMetrics, tokenMetrics } from '../src/lib/metrics.ts';
import { encodeBase, loadPrimary } from '../src/lib/tokenize.ts';

before(async () => {
  await loadPrimary();
});

test('text metrics count what they say they count', () => {
  const t = textMetrics('Hello world.\nSecond line here.');
  assert.equal(t.chars, 30);
  assert.equal(t.words, 5);
  assert.equal(t.lines, 2);
  assert.equal(t.composition.find((c) => c.key === 'whitespace').count, 4);
  assert.equal(t.composition.find((c) => c.key === 'punctuation').count, 2);
});

test('composition buckets sum to the total character count', () => {
  for (const s of ['plain text', 'a1!\t\n', '日本語 123 — ok', '🚀🚀 emoji', '']) {
    const t = textMetrics(s);
    const sum = t.composition.reduce((n, c) => n + c.count, 0);
    assert.equal(sum, t.chars, JSON.stringify(s));
  }
});

test('character counts are by code point, not UTF-16 unit', () => {
  // A naive .length would say 2 here and every per-character figure would drift.
  assert.equal(textMetrics('🚀').chars, 1);
  assert.equal(textMetrics('🚀').bytes, 4);
});

test('an empty string produces zeroes rather than NaN', () => {
  const t = textMetrics('');
  assert.equal(t.chars, 0);
  assert.equal(t.words, 0);
  assert.equal(t.lines, 0);
  assert.equal(t.sentences, 0);
  const tok = tokenMetrics(encodeBase(''), 0, 0, 0);
  for (const v of [tok.vocabRatio, tok.charsPerToken, tok.tokensPerWord, tok.formattingShare]) {
    assert.ok(Number.isFinite(v), 'every ratio stays finite');
    assert.equal(v, 0);
  }
});

test('length bins account for every decoded token exactly once', () => {
  const base = encodeBase('const x = 42;\nreturn someValue + otherValue; // a comment');
  const tok = tokenMetrics(base, base.o200k.length, 9, 56);
  const binned = tok.lengths.reduce((n, b) => n + b.count, 0);
  assert.equal(binned, base.pieces.length);
});

test('repeated tokens are ranked by frequency and exclude one-offs', () => {
  const base = encodeBase('cat cat cat dog dog bird');
  const tok = tokenMetrics(base, base.o200k.length, 6, 24);
  assert.ok(tok.repeated.length > 0);
  assert.ok(tok.repeated[0].count >= tok.repeated.at(-1).count, 'sorted descending');
  assert.ok(tok.repeated.every((r) => r.count > 1), 'no one-offs');
  assert.ok(tok.repeated.every((r) => r.redundant === r.count - 1));
});

test('vocabulary ratio is 1 when nothing repeats', () => {
  const base = encodeBase('alpha beta gamma delta');
  const tok = tokenMetrics(base, base.o200k.length, 4, 22);
  assert.equal(tok.vocabRatio, 1);
});

test('formatting share catches indentation in code and blank lines in prose', () => {
  const code = encodeBase('function a() {\n    if (x) {\n        return 1;\n    }\n}');
  const codeTok = tokenMetrics(code, code.o200k.length, 8, 52);
  assert.ok(codeTok.formattingShare > 0.1, `indented code should score high, got ${codeTok.formattingShare}`);

  const prose = encodeBase('One paragraph.\n\nAnother paragraph.\n\nA third.');
  const proseTok = tokenMetrics(prose, prose.o200k.length, 6, 44);
  assert.ok(proseTok.formattingShare > 0, 'blank lines are not free');

  const flat = encodeBase('one single line of prose with no breaks at all');
  const flatTok = tokenMetrics(flat, flat.o200k.length, 10, 46);
  assert.equal(flatTok.formattingShare, 0, 'and text with no formatting scores zero');
});

test('token totals passed in drive the per-token ratios', () => {
  const base = encodeBase('hello world');
  const tok = tokenMetrics(base, 100, 50, 400);
  assert.equal(tok.total, 100);
  assert.equal(tok.charsPerToken, 4);
  assert.equal(tok.tokensPerWord, 2);
});
