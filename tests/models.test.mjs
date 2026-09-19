/** Invariants over the pricing registry - the kind of thing a typo silently breaks. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_COMPARE_IDS,
  DEFAULT_MODEL_ID,
  MODELS,
  MODELS_BY_ID,
  VENDORS,
} from '../src/lib/models.ts';
import { FAMILY_INFO } from '../src/lib/tokenize.ts';

test('model ids are unique', () => {
  const ids = MODELS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every default selection resolves to a real model', () => {
  assert.ok(MODELS_BY_ID[DEFAULT_MODEL_ID], DEFAULT_MODEL_ID);
  for (const id of DEFAULT_COMPARE_IDS) assert.ok(MODELS_BY_ID[id], id);
});

test('every vendor in the registry has a group in the picker', () => {
  for (const m of MODELS) {
    assert.ok(VENDORS.includes(m.vendor), `${m.vendor} is missing from VENDORS`);
  }
});

test('every model names a tokenizer family that exists', () => {
  for (const m of MODELS) {
    assert.ok(FAMILY_INFO[m.tokenizer], `${m.id}: unknown family ${m.tokenizer}`);
  }
});

test('rates and context windows are positive', () => {
  for (const m of MODELS) {
    assert.ok(m.inputPerM > 0, `${m.id} input`);
    assert.ok(m.outputPerM > 0, `${m.id} output`);
    assert.ok(m.context > 0, `${m.id} context`);
    if (m.maxOutput !== undefined) assert.ok(m.maxOutput > 0, `${m.id} maxOutput`);
  }
});

test('output is never cheaper than input', () => {
  for (const m of MODELS) {
    assert.ok(m.outputPerM >= m.inputPerM, `${m.id}: output ${m.outputPerM} < input ${m.inputPerM}`);
  }
});

test('a cache read always undercuts a fresh read, and a write never does', () => {
  for (const m of MODELS) {
    if (m.cacheReadPerM !== undefined) {
      assert.ok(m.cacheReadPerM < m.inputPerM, `${m.id}: cache read is not a discount`);
      assert.ok(m.cacheReadPerM > 0, `${m.id}: cache read is not free`);
    }
    if (m.cacheWritePerM !== undefined) {
      assert.ok(m.cacheWritePerM >= m.inputPerM, `${m.id}: cache write is not a premium`);
    }
  }
});

test('batch discounts are a fraction strictly between 0 and 1', () => {
  for (const m of MODELS) {
    if (m.batchDiscount === undefined) continue;
    assert.ok(m.batchDiscount > 0 && m.batchDiscount < 1, `${m.id}: ${m.batchDiscount}`);
  }
});

test("Anthropic's published multipliers are applied as documented", () => {
  // Write is 1.25x input; read is 0.1x input, except Claude Fable 5.1's flat $0.25.
  for (const m of MODELS.filter((x) => x.vendor === 'Anthropic')) {
    assert.ok(Math.abs(m.cacheWritePerM - m.inputPerM * 1.25) < 1e-9, `${m.id} write`);
    const expectedRead = m.id === 'claude-fable-5-1' ? 0.25 : m.inputPerM * 0.1;
    assert.ok(Math.abs(m.cacheReadPerM - expectedRead) < 1e-9, `${m.id} read`);
    assert.equal(m.batchDiscount, 0.5, `${m.id} batch`);
  }
});

test('estimate factors are plausible multipliers, and exact families are 1', () => {
  for (const [family, info] of Object.entries(FAMILY_INFO)) {
    if (family === 'o200k') assert.equal(info.factor, 1);
    assert.ok(info.factor >= 1 && info.factor <= 1.5, `${family}: ${info.factor}`);
    assert.ok(info.basis.length > 10, `${family} has no stated basis`);
  }
});
