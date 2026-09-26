/**
 * The budget calculator: the cost sum run backwards.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { budgetShare, callsForBudget, rankByBudget } from '../src/lib/budget.ts';

test('a budget buys whole calls a day over a 30-day month', () => {
  // $300 a month = $10 a day; at $0.01 a call that is 1,000 calls.
  assert.equal(callsForBudget(300, 0.01), 1000);
  // A partial call is not bought.
  assert.equal(callsForBudget(300, 0.0101), 990);
  // Float noise does not lose a call: 0.03 / 30 / 0.000142857142857143 is 6.999...
  assert.equal(callsForBudget(0.03, 0.000142857142857143), 7);
});

test('edge cases: no budget, free calls, bad input', () => {
  assert.equal(callsForBudget(0, 0.01), 0);
  assert.equal(callsForBudget(-5, 0.01), 0);
  assert.equal(callsForBudget(Number.NaN, 0.01), 0);
  assert.equal(callsForBudget(100, 0), Number.POSITIVE_INFINITY);
});

test('budget share of the planned volume', () => {
  // 1,000 calls a day at $0.01 = $300 a month.
  assert.equal(budgetShare(600, 0.01, 1000), 0.5);
  assert.equal(budgetShare(300, 0.01, 1000), 1);
  assert.ok(budgetShare(150, 0.01, 1000) > 1);
});

test('ranking puts the cheapest model first and keeps ties in order', () => {
  const items = [{ id: 'a', c: 0.02 }, { id: 'b', c: 0.01 }, { id: 'c', c: 0.02 }];
  const ranked = rankByBudget(items, (x) => x.c, 600, 1000);
  assert.deepEqual(ranked.map((r) => r.item.id), ['b', 'a', 'c']);
  assert.equal(ranked[0].callsPerDay, 2000);
  assert.equal(ranked[0].planShare, 0.5);
});
