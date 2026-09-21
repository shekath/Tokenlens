/**
 * The client's reading of the subscription columns.
 *
 * effectiveTier duplicates a rule Postgres also enforces (private.current_tier,
 * migration 0004). The duplication is deliberate - the UI must reach the same
 * answer or it offers a feature the database then refuses - so these cases are
 * deliberately the same ones as in supabase/tests/01_rls.sql.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { billingNotice, effectiveTier, formatBillingDate } from '../src/lib/billing.ts';

const NOW = Date.parse('2026-09-21T12:00:00Z');
const inDays = (n) => new Date(NOW + n * 86_400_000).toISOString();

test('no profile is the free tier, not a crash', () => {
  assert.equal(effectiveTier(null, NOW), 'free');
});

test('an active subscription enforces its tier', () => {
  assert.equal(
    effectiveTier({ tier: 'pro', status: 'active', currentPeriodEnd: inDays(10) }, NOW),
    'pro',
  );
});

test('a cancellation keeps the tier until the paid period ends', () => {
  assert.equal(
    effectiveTier({ tier: 'pro', status: 'cancelled', currentPeriodEnd: inDays(10) }, NOW),
    'pro',
  );
});

test('and drops it once that period is over', () => {
  assert.equal(
    effectiveTier({ tier: 'pro', status: 'cancelled', currentPeriodEnd: inDays(-1) }, NOW),
    'free',
  );
});

test('an overdue renewal on an active subscription does not revoke access', () => {
  // A renewal webhook we have not processed yet. Locking out a paying customer
  // over our own missed event is the worse failure.
  assert.equal(
    effectiveTier({ tier: 'team', status: 'active', currentPeriodEnd: inDays(-3) }, NOW),
    'team',
  );
});

test('past_due keeps access while the card is retried', () => {
  assert.equal(
    effectiveTier({ tier: 'pro', status: 'past_due', currentPeriodEnd: inDays(-1) }, NOW),
    'pro',
  );
});

test('a cancelled row with no end date keeps its tier rather than guessing', () => {
  assert.equal(effectiveTier({ tier: 'pro', status: 'cancelled', currentPeriodEnd: null }, NOW), 'pro');
});

test('an unparseable date is ignored rather than treated as expired', () => {
  assert.equal(
    effectiveTier({ tier: 'pro', status: 'cancelled', currentPeriodEnd: 'not a date' }, NOW),
    'pro',
  );
});

// ------------------------------------------------------------------ notice --

test('a free account has nothing to say', () => {
  assert.equal(billingNotice({ tier: 'free', status: 'inactive', currentPeriodEnd: null }, NOW), null);
});

test('an active plan shows its renewal date', () => {
  const n = billingNotice({ tier: 'pro', status: 'active', currentPeriodEnd: inDays(10) }, NOW);
  assert.equal(n.tone, 'ok');
  assert.match(n.prefix, /^Renews/);
  assert.equal(n.date.toISOString(), inDays(10));
});

test('a failed payment is a warning, and says what to do', () => {
  const n = billingNotice({ tier: 'pro', status: 'past_due', currentPeriodEnd: inDays(-1) }, NOW);
  assert.equal(n.tone, 'warn');
  assert.match(n.prefix, /card/i);
  assert.equal(n.date, null, 'a date already passed would only confuse here');
});

test('a pending cancellation says when, in the future tense', () => {
  const n = billingNotice({ tier: 'pro', status: 'cancelled', currentPeriodEnd: inDays(10) }, NOW);
  assert.equal(n.tone, 'warn');
  assert.match(n.prefix, /^Cancels on/);
});

test('a cancellation that has already taken effect does not still say "cancels"', () => {
  const n = billingNotice({ tier: 'pro', status: 'cancelled', currentPeriodEnd: inDays(-2) }, NOW);
  assert.match(n.prefix, /ended/i);
});

test('a trial says it is a trial', () => {
  const n = billingNotice({ tier: 'pro', status: 'trialing', currentPeriodEnd: inDays(7) }, NOW);
  assert.equal(n.tone, 'ok');
  assert.match(n.prefix, /^Trial/);
});

test('the date is unambiguous in any locale', () => {
  // 10/09 is two different days depending on where the reader is.
  const text = formatBillingDate(new Date('2026-10-09T00:00:00Z'));
  assert.match(text, /Oct/i);
  assert.match(text, /2026/);
});
