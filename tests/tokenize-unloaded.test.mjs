/**
 * The pre-load state, in its own file: node runs each test file in a fresh
 * process, which is the only way to observe the module before an encoder lands.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_BASE, countFor, encodeBase, isExact } from '../src/lib/tokenize.ts';
import { MODELS_BY_ID } from '../src/lib/models.ts';

test('encoding returns the empty result rather than throwing', () => {
  assert.deepEqual(encodeBase('hello world'), EMPTY_BASE);
  assert.deepEqual(encodeBase(''), EMPTY_BASE);
});

test('counts are zero, not NaN, so no downstream ratio breaks', () => {
  for (const id of ['gpt-5', 'gpt-4-turbo', 'claude-opus-5', 'gemini-2-5-pro']) {
    const n = countFor(MODELS_BY_ID[id], EMPTY_BASE);
    assert.equal(n, 0, id);
  }
});

test('a cl100k model reports as estimated until its encoder has loaded', () => {
  assert.equal(isExact(MODELS_BY_ID['gpt-4-turbo'], EMPTY_BASE), false);
  assert.equal(isExact(MODELS_BY_ID['gpt-5'], EMPTY_BASE), true);
});
