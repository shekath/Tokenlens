/** Chart geometry. The axis-max invariant here is what keeps bars inside their plot. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barPath, clipText, estWidth, niceTicks } from '../src/lib/scale.ts';

test('the top tick always covers the data max', () => {
  // The regression this guards: a top tick below the max scales the longest bar
  // past the end of the plot and its value label off the card.
  const values = [
    0.00766, 0.0132, 1, 3, 7, 13, 25, 99, 100, 101, 212, 1_000, 1_048_576,
    0.000_009_2, 5e-7, 1e9, 2.5, 0.1, 0.9,
  ];
  for (const v of values) {
    const ticks = niceTicks(v);
    assert.ok(ticks.at(-1) >= v, `max ${v}: top tick ${ticks.at(-1)} is below it`);
  }
});

test('ticks start at zero, ascend, and are evenly spaced', () => {
  for (const v of [0.00766, 13, 100, 1_048_576]) {
    const t = niceTicks(v);
    assert.equal(t[0], 0);
    const step = t[1] - t[0];
    for (let i = 1; i < t.length; i += 1) {
      assert.ok(t[i] > t[i - 1], `${v}: not ascending`);
      assert.ok(Math.abs(t[i] - t[i - 1] - step) < step * 1e-9, `${v}: uneven step`);
    }
  }
});

test('steps land on the 1 / 2 / 5 ladder', () => {
  for (const v of [0.00766, 13, 25, 100, 3_000]) {
    const t = niceTicks(v);
    const step = t[1] - t[0];
    const mantissa = step / 10 ** Math.round(Math.log10(step) - 0.5);
    assert.ok(
      [1, 2, 5, 10].some((n) => Math.abs(mantissa - n) < 1e-6),
      `max ${v}: step ${step} has mantissa ${mantissa}`,
    );
  }
});

test('tick counts stay in a readable range', () => {
  for (const v of [0.00766, 1, 13, 25, 99, 100, 1_048_576]) {
    const n = niceTicks(v).length;
    assert.ok(n >= 3 && n <= 9, `max ${v} produced ${n} ticks`);
  }
});

test('ticks do not accumulate floating point drift', () => {
  const t = niceTicks(0.01);
  for (const v of t) {
    assert.equal(v, Number(v.toPrecision(12)), `${v} carries drift`);
  }
});

test('a non-positive or non-finite max degrades to a single zero tick', () => {
  for (const v of [0, -5, NaN, Infinity]) {
    assert.deepEqual(niceTicks(v), [0]);
  }
});

test('bar paths close, and a zero-extent bar draws nothing', () => {
  assert.equal(barPath(0, 0, 0, 20, 'right'), '');
  assert.equal(barPath(0, 0, 20, 0, 'up'), '');
  for (const d of ['right', 'up']) {
    const p = barPath(10, 10, 100, 24, d);
    assert.ok(p.startsWith('M') && p.endsWith('Z'), d);
    assert.ok(p.includes('Q'), `${d}: no rounded data-end`);
  }
});

test('the corner radius never exceeds the bar it rounds', () => {
  // A 2px bar with a 4px radius inverts into a visible artefact.
  assert.ok(barPath(0, 0, 2, 24, 'right').includes('H0Q'), 'radius clamps to the width');
  assert.ok(barPath(0, 0, 24, 2, 'up').length > 0);
});

test('width estimation grows with length and is never negative', () => {
  assert.ok(estWidth('$0.000633') > estWidth('$1.00'));
  assert.equal(estWidth(''), 0);
});

test('labels are truncated to fit, with an ellipsis standing in for the rest', () => {
  assert.equal(clipText('GPT-5', 200), 'GPT-5', 'a short label is left alone');
  const clipped = clipText('Claude Sonnet 4.6', 60);
  assert.ok(clipped.endsWith('\u2026'), `expected an ellipsis, got ${clipped}`);
  assert.ok(clipped.length < 'Claude Sonnet 4.6'.length);
});

test('truncation is pessimistic enough for title case to stay inside its box', () => {
  // The regression this guards: a label rendering outside its own SVG at 320px.
  for (const label of ['Claude Fable 5.1', 'Gemini 2.5 Flash-Lite', 'Llama 4 Maverick']) {
    for (const width of [40, 60, 75, 90, 120]) {
      const out = clipText(label, width);
      assert.ok(out.length * 11 * 0.72 <= width + 11 * 0.72, `${label} @ ${width}px -> ${out}`);
    }
  }
});

test('an impossibly narrow box still yields something rather than an empty string', () => {
  const out = clipText('Claude Opus 5', 4);
  assert.ok(out.length >= 3, out);
});
