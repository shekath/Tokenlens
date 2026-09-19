/** Formatting - every figure in the UI rounds through here. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compact, num, pct, ratio, usd, visibleToken } from '../src/lib/format.ts';

test('money never renders as exponential notation', () => {
  for (const v of [1e-12, 1e-9, 1e-7, 1e-6, 9.2e-6, 0.000_28, 0.0132, 0.5, 12.5, 4949, 1.5e6, 1e12]) {
    assert.ok(!/e/i.test(usd(v)), `${v} -> ${usd(v)}`);
  }
});

test('sub-cent money keeps three significant figures', () => {
  assert.equal(usd(0.0066175), '$0.00662');
  assert.equal(usd(0.000_28), '$0.00028');
  assert.equal(usd(0.000_009_2), '$0.0000092');
});

test('money above a cent uses fixed decimals by magnitude', () => {
  assert.equal(usd(0.0132), '$0.0132');
  assert.equal(usd(12.5), '$12.50');
  assert.equal(usd(0), '$0');
});

test('a figure too small to print says so rather than rounding to zero', () => {
  assert.equal(usd(1e-9), '<$0.000001');
  assert.equal(usd(1e-7), '<$0.000001');
  assert.equal(usd(1e-6), '$0.000001');
});

test('compact shortens only once it needs to', () => {
  assert.equal(compact(1284), '1,284');
  assert.equal(compact(12_900), '12.9K');
  assert.equal(compact(1_048_576), '1.05M');
  assert.equal(compact(200_000), '200K');
});

test('ratios and percentages degrade to an em dash rather than NaN', () => {
  assert.equal(ratio(NaN), '—');
  assert.equal(ratio(0), '—');
  assert.equal(pct(NaN), '—');
  assert.equal(pct(0.5, 0), '50%');
  assert.equal(num(1234.6), '1,235');
});

test('whitespace in a token is made visible', () => {
  assert.equal(visibleToken('a b'), 'a·b');
  assert.equal(visibleToken('.\n\n'), '.⏎⏎');
  assert.equal(visibleToken('\t'), '⇥');
});
