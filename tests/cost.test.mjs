/**
 * Cost math, checked against hand-computed values.
 * Run with: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  callCost,
  cachedCallCost,
  effectiveCost,
  project,
  utilization,
} from '../src/lib/cost.ts';

const M = {
  id: 'x',
  apiId: 'x',
  label: 'X',
  vendor: 'Anthropic',
  tokenizer: 'claude',
  context: 200_000,
  inputPerM: 5,
  outputPerM: 25,
  cacheReadPerM: 0.5, // 0.1x input
  cacheWritePerM: 6.25, // 1.25x input
  batchDiscount: 0.5,
};

const A = {
  outputTokens: 1_000,
  callsPerDay: 1_000,
  cachedShare: 0,
  cacheHitRate: 0,
  useBatch: false,
};

const near = (a, b, eps = 1e-12) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${b}, got ${a}`);

test('flat call cost is tokens x rate / 1M', () => {
  const c = callCost(M, 100_000, 1_000);
  near(c.input, 0.5); // 100k / 1M * $5
  near(c.output, 0.025); // 1k / 1M * $25
  near(c.total, 0.525);
});

test('no cacheable prefix means no change from the flat cost', () => {
  const c = cachedCallCost(M, 100_000, A);
  near(c.total, callCost(M, 100_000, 1_000).total);
  near(c.savedFraction, 0);
});

test('a 100% prefix at a 100% hit rate bills the whole prompt at the read rate', () => {
  const c = cachedCallCost(M, 100_000, { ...A, cachedShare: 1, cacheHitRate: 1 });
  near(c.input, 0.05); // 100k / 1M * $0.50
  near(c.cached, 0.05);
  near(c.uncached, 0);
  near(c.total, 0.075); // + $0.025 output
});

test('a 100% prefix at a 0% hit rate pays the 1.25x write premium', () => {
  const c = cachedCallCost(M, 100_000, { ...A, cachedShare: 1, cacheHitRate: 0 });
  near(c.input, 0.625); // 100k / 1M * $6.25
  assert.ok(c.total > callCost(M, 100_000, 1_000).total, 'an all-miss cache costs more');
  assert.ok(c.savedFraction < 0, 'and reports a negative saving rather than hiding it');
});

test('partial prefix blends the cached and uncached halves', () => {
  const c = cachedCallCost(M, 100_000, { ...A, cachedShare: 0.5, cacheHitRate: 1 });
  near(c.cached, 0.025); // 50k at $0.50/M
  near(c.uncached, 0.25); // 50k at $5/M
  near(c.input, 0.275);
});

test('cache math is skipped for a model with no published read rate', () => {
  const noCache = { ...M, cacheReadPerM: undefined };
  const c = cachedCallCost(noCache, 100_000, { ...A, cachedShare: 1, cacheHitRate: 1 });
  assert.equal(c.unsupported, true);
  near(c.input, 0.5);
});

test('batch halves every component, cache reads included', () => {
  const plain = effectiveCost(M, 100_000, { ...A, cachedShare: 1, cacheHitRate: 1 });
  const batched = effectiveCost(M, 100_000, { ...A, cachedShare: 1, cacheHitRate: 1, useBatch: true });
  near(batched.total, plain.total / 2);
  near(batched.cached, plain.cached / 2);
  near(batched.output, plain.output / 2);
});

test('batch is a no-op for a model with no batch endpoint', () => {
  const noBatch = { ...M, batchDiscount: undefined };
  const a = effectiveCost(noBatch, 100_000, { ...A, useBatch: true });
  const b = effectiveCost(noBatch, 100_000, { ...A, useBatch: false });
  near(a.total, b.total);
});

test('projection scales per-call cost by volume', () => {
  const p = project(0.5, 1_000);
  near(p.perDay, 500);
  near(p.perMonth, 15_000);
  near(p.perYear, 182_500);
});

test('utilisation severity steps at 70, 90 and 100 percent', () => {
  assert.equal(utilization(1_000, 200_000).severity, 'ok');
  assert.equal(utilization(139_000, 200_000).severity, 'ok');
  assert.equal(utilization(140_000, 200_000).severity, 'warning');
  assert.equal(utilization(180_000, 200_000).severity, 'serious');
  assert.equal(utilization(200_000, 200_000).severity, 'critical');
  assert.equal(utilization(250_000, 200_000).severity, 'critical');
});

test('an empty prompt costs nothing and reports no saving', () => {
  const c = cachedCallCost(M, 0, { ...A, outputTokens: 0, cachedShare: 1, cacheHitRate: 1 });
  near(c.total, 0);
  near(c.savedFraction, 0);
});
