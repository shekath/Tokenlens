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

// ------------------------------------------------------------------ money --

test('an amount prints in the currency it was charged in', async () => {
  const { formatAmount } = await import('../src/lib/billing.ts');
  // 1440 minor units of USD is $14.40, not $1440.
  assert.match(formatAmount(1440, 'USD'), /14\.40/);
  assert.match(formatAmount(9900, 'EUR'), /99/);
});

test('zero-decimal currencies are not divided by a hundred', async () => {
  const { formatAmount } = await import('../src/lib/billing.ts');
  // JPY has no minor unit: 1200 yen is ¥1,200, and ¥12 would be a 100x lie
  // about what someone is paying.
  const yen = formatAmount(1200, 'JPY');
  assert.match(yen, /1,?200/);
  assert.doesNotMatch(yen, /12\.00/);
});

test('an unknown currency still shows a number rather than nothing', async () => {
  const { formatAmount } = await import('../src/lib/billing.ts');
  const out = formatAmount(1200, 'ZZZ');
  assert.ok(out && /12/.test(out) && out.includes('ZZZ'), out);
});

test('a missing amount or currency is absent, not zero', async () => {
  const { formatAmount } = await import('../src/lib/billing.ts');
  assert.equal(formatAmount(null, 'USD'), null);
  assert.equal(formatAmount(1200, null), null);
  assert.equal(formatAmount(Number.NaN, 'USD'), null);
});

test('the card reads as a person would say it', async () => {
  const { formatCard } = await import('../src/lib/billing.ts');
  assert.equal(formatCard('visa', '4242'), 'visa ending 4242');
  assert.equal(formatCard(null, '4242'), 'card ending 4242');
  assert.equal(formatCard('visa', null), null);
});

test('enum values are shown the way a person writes them', async () => {
  const { statusLabel, titleCase } = await import('../src/lib/billing.ts');
  assert.equal(statusLabel('past_due'), 'Past due');
  assert.equal(statusLabel('active'), 'Active');
  assert.equal(titleCase('pro'), 'Pro');
  assert.equal(titleCase(''), '');
});

test('a single-variant product does not show up as "Default"', async () => {
  const { planLabel } = await import('../src/lib/billing.ts');
  // Lemon Squeezy names the only variant of a single-variant product
  // "Default" and reports that in every webhook. It is what this project's
  // own store sends today.
  assert.equal(planLabel('Default', 'team'), 'Team');
  assert.equal(planLabel('default', 'pro'), 'Pro');
  assert.equal(planLabel('  ', 'pro'), 'Pro');
  assert.equal(planLabel(null, 'pro'), 'Pro');
});

test('a real variant name is used as given', async () => {
  const { planLabel } = await import('../src/lib/billing.ts');
  assert.equal(planLabel('Pro Monthly', 'pro'), 'Pro Monthly');
  assert.equal(planLabel('Team Annual (Default rate)', 'team'), 'Team Annual (Default rate)');
});

// ------------------------------------------------------- the list price ----

test('the published price stands in only where there is no charged amount', async () => {
  const { PLANS, listPrice } = await import('../src/lib/entitlements.ts');

  // Read from PLANS rather than retyped, so a price change cannot leave the
  // account page quoting last quarter's number.
  const team = PLANS.find((p) => p.tier === 'team');
  const pro = PLANS.find((p) => p.tier === 'pro');

  assert.equal(listPrice('team'), `$${team.monthly}/month`);

  // Pro sells at two prices and we do not record which one an account holds,
  // so naming one would be a specific claim that is wrong half the time.
  const proText = listPrice('pro');
  assert.ok(proText.includes(`$${pro.monthly}/month`), proText);
  assert.ok(proText.includes(`$${pro.annual}/year`), proText);

  // Free has no price to publish, so there is nothing to stand in with.
  assert.equal(listPrice('free'), null);
});
