/**
 * Opening a checkout.
 *
 * Every failure here used to look identical from the outside: the pricing
 * dialog closed and nothing happened. The dialog closed unconditionally, and
 * the error the hook recorded was rendered nowhere, so a missing build
 * variable, a profile that had not loaded and a blocked popup were the same
 * event to anyone using the site. These pin them apart.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkoutTarget, openCheckoutWindow } from '../src/lib/checkout.ts';
import { PLANS } from '../src/lib/entitlements.ts';

const pro = PLANS.find((p) => p.tier === 'pro');
const team = PLANS.find((p) => p.tier === 'team');
const BASE = 'https://tokenticks.lemonsqueezy.com/checkout/buy';
const PROFILE = { id: 'aaaaaaaa-1111-2222-3333-444444444444', email: 'buyer@example.com' };

const ids = {
  VITE_LEMON_VARIANT_PRO_MONTHLY: 'var-pro-monthly',
  VITE_LEMON_VARIANT_PRO_ANNUAL: 'var-pro-annual',
  VITE_LEMON_VARIANT_TEAM_MONTHLY: 'var-team-monthly',
};
const variantFor = (key) => (key && ids[key]) || null;

test('a configured monthly plan produces a checkout the webhook can match', () => {
  const r = checkoutTarget({ plan: pro, period: 'monthly', base: BASE, variantFor, profile: PROFILE });
  assert.equal(r.ok, true);
  const url = new URL(r.url);
  assert.equal(url.pathname, '/checkout/buy/var-pro-monthly');
  // Without this the payment succeeds and nothing is provisioned.
  assert.equal(url.searchParams.get('checkout[custom][user_id]'), PROFILE.id);
  assert.equal(url.searchParams.get('checkout[email]'), PROFILE.email);
});

test('the annual variant is used when there is one', () => {
  const r = checkoutTarget({ plan: pro, period: 'annual', base: BASE, variantFor, profile: PROFILE });
  assert.match(r.url, /var-pro-annual/);
});

test('and a plan with no annual variant falls back to monthly rather than failing', () => {
  // Team is monthly-only. A customer holding a card should not meet a
  // configuration error because they left the toggle on "annual".
  const r = checkoutTarget({ plan: team, period: 'annual', base: BASE, variantFor, profile: PROFILE });
  assert.equal(r.ok, true);
  assert.match(r.url, /var-team-monthly/);
});

test('a missing store URL is reported as a deployment problem', () => {
  const r = checkoutTarget({ plan: pro, period: 'monthly', base: undefined, variantFor, profile: PROFILE });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unconfigured');
  assert.match(r.message, /store URL/i);
});

test('a missing variant id names the plan it is missing for', () => {
  const r = checkoutTarget({
    plan: team,
    period: 'monthly',
    base: BASE,
    variantFor: () => null,
    profile: PROFILE,
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unconfigured');
  assert.match(r.message, /Team/);
});

test('no profile is a different failure, and says something a user can act on', () => {
  const r = checkoutTarget({ plan: pro, period: 'monthly', base: BASE, variantFor, profile: null });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no-account');
  assert.match(r.message, /moment/i);
});

test('a profile without an email still checks out', () => {
  const r = checkoutTarget({
    plan: pro,
    period: 'monthly',
    base: BASE,
    variantFor,
    profile: { id: PROFILE.id, email: null },
  });
  assert.equal(r.ok, true);
  assert.equal(new URL(r.url).searchParams.has('checkout[email]'), false);
});

test('a trailing slash on the store URL does not double up', () => {
  const r = checkoutTarget({ plan: pro, period: 'monthly', base: BASE + '/', variantFor, profile: PROFILE });
  assert.equal(new URL(r.url).pathname, '/checkout/buy/var-pro-monthly');
});

test('a blocked popup navigates this tab instead of doing nothing', () => {
  const calls = [];
  const blocked = {
    open: () => null,
    location: { assign: (u) => calls.push(['assign', u]) },
  };
  openCheckoutWindow('https://example.com/c', blocked);
  assert.deepEqual(calls, [['assign', 'https://example.com/c']]);
});

test('and an allowed popup leaves the page alone', () => {
  const calls = [];
  const allowed = {
    open: (u) => {
      calls.push(['open', u]);
      return {};
    },
    location: { assign: () => calls.push(['assign']) },
  };
  openCheckoutWindow('https://example.com/c', allowed);
  assert.deepEqual(calls, [['open', 'https://example.com/c']]);
});
