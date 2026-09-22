/**
 * Which variant a plan switch moves to.
 *
 * Getting this wrong moves a paying customer onto a price they did not choose,
 * and the way they find out is their next invoice. So the rule is: match the
 * interval exactly, fall back only when there is nothing to choose between,
 * and otherwise refuse.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseVariant } from '../supabase/functions/manage-subscription/plans.ts';

const PRO = [
  { id: '2152668', interval: 'month' },
  { id: '2152671', interval: 'year' },
];
const TEAM = [{ id: '2152674', interval: 'month' }];

test('the interval asked for is the interval chosen', () => {
  assert.equal(chooseVariant(PRO, 'monthly'), '2152668');
  assert.equal(chooseVariant(PRO, 'annual'), '2152671');
});

test('a plan sold monthly only is still that plan with the annual toggle on', () => {
  // The same fallback the checkout makes, rather than refusing a customer who
  // left the toggle where it was.
  assert.equal(chooseVariant(TEAM, 'annual'), '2152674');
  assert.equal(chooseVariant(TEAM, 'monthly'), '2152674');
});

test('several candidates and no interval match is a refusal, not a guess', () => {
  const ambiguous = [
    { id: '1', interval: 'week' },
    { id: '2', interval: 'day' },
  ];
  assert.equal(chooseVariant(ambiguous, 'monthly'), null);
});

test('an unconfigured tier resolves to nothing', () => {
  assert.equal(chooseVariant([], 'monthly'), null);
});

test('a missing or oddly-cased interval does not break the match', () => {
  assert.equal(chooseVariant([{ id: '9', interval: 'Month' }], 'monthly'), '9');
  assert.equal(chooseVariant([{ id: '9', interval: null }], 'monthly'), '9');
  assert.equal(
    chooseVariant([{ id: '9', interval: null }, { id: '10', interval: 'year' }], 'annual'),
    '10',
  );
});
