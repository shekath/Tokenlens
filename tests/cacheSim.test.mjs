/** Cache break-even maths, checked against hand-computed values. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CACHE_INPUTS,
  breakEvenCallCount,
  breakEvenHitRate,
  hitRateCurve,
  simulate,
  supportsCaching,
  volumeCurve,
} from '../src/lib/cacheSim.ts';
import { MODELS, MODELS_BY_ID } from '../src/lib/models.ts';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `expected ${b}, got ${a}`);

// $5/M in, write 1.25x = $6.25/M, read 0.1x = $0.50/M, $25/M out.
const M = MODELS_BY_ID['claude-opus-5'];

test("Anthropic's published multipliers put break-even at 0.25/1.15", () => {
  // h* = (write - base) / (write - read) = (6.25 - 5) / (6.25 - 0.50)
  near(breakEvenHitRate(M), 0.25 / 1.15);
  assert.ok(Math.abs(breakEvenHitRate(M) - 0.2174) < 0.0005, 'about 21.7%');
});

test('break-even is a property of the rates alone, not of volume or prompt size', () => {
  const a = breakEvenHitRate(M);
  for (const invocations of [1, 100, 1_000_000]) {
    for (const cachedTokens of [10, 100_000]) {
      const outcome = simulate(M, { ...DEFAULT_CACHE_INPUTS, invocations, cachedTokens, hitRate: a });
      // At exactly the break-even rate the two totals coincide.
      near(outcome.cached, outcome.uncached, Math.max(1e-9, outcome.uncached * 1e-12));
    }
  }
});

test('two calls per cache entry is enough at these rates', () => {
  // h* = 21.7%, and n calls give a hit rate of (n-1)/n, so n = 2 clears it.
  assert.equal(breakEvenCallCount(M), 2);
});

test('below break-even caching costs more; above it, less', () => {
  const h = breakEvenHitRate(M);
  const below = simulate(M, { ...DEFAULT_CACHE_INPUTS, hitRate: h - 0.1 });
  const above = simulate(M, { ...DEFAULT_CACHE_INPUTS, hitRate: h + 0.1 });
  assert.ok(below.delta > 0, 'below break-even should cost more');
  assert.ok(below.savedFraction < 0, 'and report a negative saving rather than hiding it');
  assert.ok(above.delta < 0, 'above break-even should save');
  assert.ok(above.savedFraction > 0);
});

test('a 0% hit rate pays the write premium on every call', () => {
  const o = simulate(M, {
    freshTokens: 0,
    cachedTokens: 1_000_000,
    outputTokens: 0,
    invocations: 1,
    hitRate: 0,
  });
  near(o.cached, 6.25); // 1M tokens at the $6.25/M write rate
  near(o.uncached, 5);
});

test('a 100% hit rate bills everything at the read rate', () => {
  const o = simulate(M, {
    freshTokens: 0,
    cachedTokens: 1_000_000,
    outputTokens: 0,
    invocations: 1,
    hitRate: 1,
  });
  near(o.cached, 0.5);
  near(o.savedFraction, 0.9);
});

test('output cost is identical on both sides — caching never touches it', () => {
  const o = simulate(M, { ...DEFAULT_CACHE_INPUTS, hitRate: 0.42 });
  const outputOnly =
    (DEFAULT_CACHE_INPUTS.outputTokens * DEFAULT_CACHE_INPUTS.invocations * M.outputPerM) / 1e6;
  near(o.breakdown.output, outputOnly);
});

test('the breakdown sums to the cached total', () => {
  const o = simulate(M, { ...DEFAULT_CACHE_INPUTS, hitRate: 0.6 });
  const sum = o.breakdown.fresh + o.breakdown.writes + o.breakdown.reads + o.breakdown.output;
  near(sum, o.cached, 1e-9);
});

test('a model with no published cache rates simulates as a no-op', () => {
  const noCache = MODELS.find((m) => !supportsCaching(m));
  assert.ok(noCache, 'the registry should contain at least one model without cache rates');
  assert.equal(breakEvenHitRate(noCache), null);
  assert.equal(breakEvenCallCount(noCache), null);
  const o = simulate(noCache, DEFAULT_CACHE_INPUTS);
  near(o.cached, o.uncached);
  near(o.delta, 0);
});

test('the hit-rate curve spans 0 to 1 and the cached line descends', () => {
  const curve = hitRateCurve(M, DEFAULT_CACHE_INPUTS);
  near(curve[0].hitRate, 0);
  near(curve.at(-1).hitRate, 1);
  for (let i = 1; i < curve.length; i += 1) {
    assert.ok(curve[i].cached <= curve[i - 1].cached + 1e-9, 'cached cost must fall as hits rise');
    near(curve[i].uncached, curve[0].uncached, 1e-6);
  }
});

test('cost scales linearly with volume at a fixed hit rate', () => {
  const points = volumeCurve(M, { ...DEFAULT_CACHE_INPUTS, hitRate: 0.8 });
  const first = points[0];
  for (const p of points) {
    const ratio = p.invocations / first.invocations;
    near(p.cached, first.cached * ratio, Math.max(1e-9, first.cached * ratio * 1e-9));
  }
});

test('zero invocations cost nothing and report no saving', () => {
  const o = simulate(M, { ...DEFAULT_CACHE_INPUTS, invocations: 0 });
  near(o.cached, 0);
  near(o.uncached, 0);
  near(o.savedFraction, 0);
});

test('every cacheable model in the registry has a break-even below 100%', () => {
  for (const m of MODELS.filter(supportsCaching)) {
    const h = breakEvenHitRate(m);
    assert.ok(h !== null && h >= 0 && h < 1, `${m.id}: ${h}`);
  }
});
