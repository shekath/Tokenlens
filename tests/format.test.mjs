/** Formatting - every figure in the UI rounds through here. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compact, num, pct, ratio, usd, usdAxis, visibleToken } from '../src/lib/format.ts';

const usdAxisLabels = (ticks) => ticks.map(usdAxis(ticks));

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

test('an axis uses one money format for every tick', () => {
  // The regression: "$800.00" next to "$1,000" in the same column.
  const ticks = [0, 200, 400, 600, 800, 1000, 1200];
  const f = usdAxis(ticks);
  assert.deepEqual(ticks.map(f), ['$0', '$200', '$400', '$600', '$800', '$1,000', '$1,200']);
});

test('sub-dollar axes get enough decimals to separate adjacent ticks', () => {
  const ticks = [0, 0.005, 0.01, 0.015];
  const labels = ticks.map(usdAxis(ticks));
  assert.equal(new Set(labels).size, labels.length, 'ticks must not collapse to the same label');
  assert.deepEqual(labels, ['$0', '$0.0050', '$0.0100', '$0.0150']);
});

test('large axes pick one unit for the whole axis', () => {
  // The trap: compact() flips to "K" at 10,000, which would render this tick set
  // as "$5,000" next to "$10.0K".
  assert.deepEqual(usdAxisLabels([0, 5000, 10_000, 15_000]), ['$0', '$5K', '$10K', '$15K']);
  assert.deepEqual(usdAxisLabels([0, 1e6, 2e6, 3e6]), ['$0', '$1M', '$2M', '$3M']);
  assert.deepEqual(usdAxisLabels([0, 2500, 5000]), ['$0', '$2,500', '$5,000']);
});

test('no axis mixes two number formats', () => {
  const sets = [
    [0, 200, 400, 600, 800, 1000, 1200],
    [0, 5000, 10_000, 15_000],
    [0, 0.005, 0.01, 0.015],
    [0, 1e6, 2e6],
    [0, 0.25, 0.5, 0.75, 1],
  ];
  for (const ticks of sets) {
    // Compare the format family - suffix and decimal places - not the digit
    // count, which legitimately differs between $200 and $1,000.
    const shapes = new Set(
      usdAxisLabels(ticks)
        .slice(1)
        .map((l) => l.replace(/,/g, '').replace(/\d+/g, '#')),
    );
    assert.equal(shapes.size, 1, `${JSON.stringify(ticks)} produced ${[...shapes].join(' and ')}`);
  }
});

test('a degenerate single-tick axis does not divide by zero', () => {
  assert.equal(usdAxis([0])(0), '$0');
  assert.ok(usdAxis([5])(5).startsWith('$'));
});
