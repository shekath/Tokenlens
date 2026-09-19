import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_BASE,
  FAMILY_INFO,
  INSPECT_LIMIT,
  countFor,
  encodeBase,
  isExact,
  loadPrimary,
  loadSecondary,
} from '../src/lib/tokenize.ts';
import { MODELS, MODELS_BY_ID } from '../src/lib/models.ts';

const m = (id) => MODELS_BY_ID[id];

// The "encoder not yet loaded" case lives in tokenize-unloaded.test.mjs: a
// file-level `before` hook runs ahead of every test in its own file, so that
// state cannot be observed here.
before(async () => {
  await loadPrimary();
  await loadSecondary();
});

test('an empty prompt yields the empty encoding', () => {
  assert.deepEqual(encodeBase(''), EMPTY_BASE);
});

test('o200k models get the exact count, with a decoded piece per token', () => {
  const base = encodeBase('Hello world! Summarise this article in three bullet points.');
  assert.ok(base.o200k.length > 0);
  assert.equal(base.pieces.length, base.o200k.length);
  assert.equal(countFor(m('gpt-5'), base), base.o200k.length);
  assert.equal(isExact(m('gpt-5'), base), true);
});

test('decoded pieces reassemble into the original text', () => {
  const text = 'const x = 42;\n// note: três 🚀\nreturn x;';
  const base = encodeBase(text);
  assert.equal(base.pieces.map((p) => p.text).join(''), text);
});

test('cl100k models are exact once the second encoder has loaded', () => {
  const base = encodeBase('Hello world, this is a test of the older encoding.');
  assert.notEqual(base.cl100kCount, null);
  assert.equal(countFor(m('gpt-4-turbo'), base), base.cl100kCount);
  assert.equal(isExact(m('gpt-4-turbo'), base), true);
});

test('estimated families scale the o200k count by their published factor', () => {
  const base = encodeBase('The quick brown fox jumps over the lazy dog, repeatedly and at length.');
  for (const model of MODELS) {
    if (model.tokenizer === 'o200k' || model.tokenizer === 'cl100k') continue;
    const expected = Math.round(base.o200k.length * FAMILY_INFO[model.tokenizer].factor);
    assert.equal(countFor(model, base), expected, model.id);
    assert.equal(isExact(model, base), false, model.id);
  }
});

test('every model in the registry produces a positive count for real text', () => {
  const base = encodeBase('Summarise the attached report in five bullet points.');
  for (const model of MODELS) {
    assert.ok(countFor(model, base) > 0, `${model.id} counted zero`);
  }
});

test('piece decoding stops at the inspect limit but the count does not', () => {
  const base = encodeBase('word '.repeat(INSPECT_LIMIT + 500));
  assert.ok(base.o200k.length > INSPECT_LIMIT);
  assert.equal(base.piecesTruncated, true);
  assert.equal(base.pieces.length, INSPECT_LIMIT);
  assert.equal(countFor(m('gpt-5'), base), base.o200k.length);
});

test('non-Latin share counts letters only, ignoring digits and punctuation', () => {
  assert.equal(encodeBase('hello world 123!').nonLatinShare, 0);
  assert.equal(encodeBase('日本語のテキスト').nonLatinShare, 0, 'CJK is calibrated for');
  assert.ok(encodeBase('Переведите текст').nonLatinShare > 0.9, 'Cyrillic is not');
  const mixed = encodeBase('half english Переведите');
  assert.ok(mixed.nonLatinShare > 0.3 && mixed.nonLatinShare < 0.6);
});

test('non-Latin text really does cost more tokens than its Latin equivalent', () => {
  // The claim the UI's script warning rests on.
  const latin = encodeBase('Translate this text while keeping the numbering.');
  const cyrillic = encodeBase('Переведите этот текст, сохраняя нумерацию пунктов.');
  assert.ok(
    cyrillic.o200k.length > latin.o200k.length,
    `expected Cyrillic to cost more: ${cyrillic.o200k.length} vs ${latin.o200k.length}`,
  );
});
