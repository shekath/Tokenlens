/**
 * The billing decisions.
 *
 * This is the one path in the product that cannot be checked by using the
 * product: checking it for real means charging a card. So every branch is
 * exercised here against the payload shapes Lemon Squeezy actually sends,
 * before any variant exists.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decide,
  parseVariantMap,
  resolveTier,
  statusPlan,
} from '../supabase/functions/lemon-webhook/decide.ts';
import {
  eventIdFor,
  hexToBytes,
  verifySignature,
} from '../supabase/functions/lemon-webhook/signature.ts';

const VARIANTS = parseVariantMap('111,112', '113');
const USER = '11111111-1111-1111-1111-111111111111';

/** A subscription webhook body, shaped as Lemon Squeezy sends one. */
const event = (name, attributes, { userId = USER, id = '987654' } = {}) => ({
  meta: { event_name: name, custom_data: userId ? { user_id: userId } : undefined },
  data: { type: 'subscriptions', id, attributes },
});

const active = (variant = '111') => ({
  status: 'active',
  variant_id: Number(variant),
  customer_id: 424242,
  renews_at: '2026-10-21T17:00:00.000000Z',
  ends_at: null,
  test_mode: false,
});

// --------------------------------------------------------------- purchases --

test('a Pro purchase grants Pro', () => {
  const d = decide(event('subscription_created', active('111')), VARIANTS);
  assert.equal(d.kind, 'upsert');
  assert.equal(d.userId, USER);
  assert.equal(d.patch.tier, 'pro');
  assert.equal(d.patch.status, 'active');
  assert.equal(d.subscriptionId, '987654');
  assert.equal(d.patch.lemon_customer_id, '424242');
  assert.equal(d.patch.current_period_end, '2026-10-21T17:00:00.000000Z');
});

test('a Team purchase grants Team, not Pro', () => {
  // The bug this replaces: anything not in the Team list defaulted to Pro, so
  // a $39 subscription bought $12 of product and nothing said so.
  const d = decide(event('subscription_created', active('113')), VARIANTS);
  assert.equal(d.patch.tier, 'team');
});

test('an unmapped variant is refused loudly rather than guessed', () => {
  const d = decide(event('subscription_created', active('999')), VARIANTS);
  assert.equal(d.kind, 'reject');
  assert.equal(d.status, 500, 'a 5xx makes Lemon Squeezy retry once the config is fixed');
  assert.match(d.why, /LEMON_TEAM_VARIANT_IDS/);
});

test('a purchase with no user id is refused before anything is written', () => {
  const d = decide(event('subscription_created', active(), { userId: null }), VARIANTS);
  assert.equal(d.kind, 'reject');
  assert.equal(d.status, 400);
});

test('a trial grants the tier and reads as trialing', () => {
  const d = decide(event('subscription_created', { ...active(), status: 'on_trial' }), VARIANTS);
  assert.equal(d.patch.tier, 'pro');
  assert.equal(d.patch.status, 'trialing');
});

test('an upgrade from Pro to Team is just an update', () => {
  const d = decide(event('subscription_updated', active('113')), VARIANTS);
  assert.equal(d.patch.tier, 'team');
});

// ------------------------------------------------------------ cancellation --

test('cancelling keeps the tier until the period the customer paid for ends', () => {
  const d = decide(
    event('subscription_cancelled', {
      status: 'cancelled',
      variant_id: 111,
      ends_at: '2026-10-21T17:00:00.000000Z',
    }),
    VARIANTS,
  );
  assert.equal(d.kind, 'update');
  assert.equal(d.subscriptionId, '987654');
  assert.equal(d.patch.status, 'cancelled');
  assert.equal(d.patch.current_period_end, '2026-10-21T17:00:00.000000Z');
  assert.ok(!('tier' in d.patch), 'the tier must be left alone, not set to free');
});

test('expiry is what actually ends access', () => {
  const d = decide(
    event('subscription_expired', { status: 'expired', ends_at: '2026-10-21T17:00:00.000000Z' }),
    VARIANTS,
  );
  // The STATUS ends it, not a rewrite of the tier. The subscription still
  // grants Pro on paper; private.subscription_is_live() is what stops counting
  // it, and leaving the tier alone keeps the row honest about what was bought.
  assert.equal(d.patch.status, 'inactive');
  assert.ok(!('tier' in d.patch));
});

test('a cancelled status arriving on an update event also keeps the tier', () => {
  const d = decide(
    event('subscription_updated', { ...active(), status: 'cancelled', ends_at: '2026-11-01T00:00:00Z' }),
    VARIANTS,
  );
  assert.equal(d.kind, 'upsert');
  assert.ok(!('tier' in d.patch));
  assert.equal(d.patch.status, 'cancelled');
  assert.equal(d.patch.current_period_end, '2026-11-01T00:00:00Z');
});

test('pausing stops access', () => {
  const d = decide(event('subscription_paused', { status: 'paused' }), VARIANTS);
  assert.equal(d.patch.status, 'inactive');
  assert.ok(!('tier' in d.patch), 'a pause is not a change of plan');
});

test('resuming restores it', () => {
  const d = decide(event('subscription_resumed', active('111')), VARIANTS);
  assert.equal(d.patch.tier, 'pro');
  assert.equal(d.patch.status, 'active');
});

// ------------------------------------------------------------- failed pay --

test('a failed payment marks past due without locking anyone out', () => {
  // Lemon Squeezy retries the card for days. A first failed retry is not a
  // reason to take the product away.
  const d = decide(event('subscription_payment_failed', { status: 'past_due' }), VARIANTS);
  assert.equal(d.kind, 'update');
  assert.equal(d.patch.status, 'past_due');
  assert.ok(!('tier' in d.patch));
});

test('a past_due status on an update event keeps the tier too', () => {
  const d = decide(event('subscription_updated', { ...active(), status: 'past_due' }), VARIANTS);
  assert.ok(!('tier' in d.patch));
  assert.equal(d.patch.status, 'past_due');
});

// ------------------------------------------------------------------ other --

test('an event with no subscription id is refused', () => {
  const d = decide(event('subscription_cancelled', { status: 'cancelled' }, { id: '' }), VARIANTS);
  assert.equal(d.kind, 'reject');
  assert.equal(d.status, 400);
});

test('an upsert that keeps the tier omits the column entirely', () => {
  // Not `tier: 'free'`. The upsert spreads this patch over an existing row, so
  // naming the column at all would flatten a live Pro subscription to free on
  // the way past. Absent means "leave it alone"; the column's own default
  // fills a row being created.
  const d = decide(
    event('subscription_updated', { ...active(), status: 'cancelled', ends_at: '2026-11-01T00:00:00Z' }),
    VARIANTS,
  );
  assert.ok(!('tier' in d.patch), 'tier must not appear in the payload');
  assert.equal(Object.prototype.hasOwnProperty.call(d.patch, 'tier'), false);
});

test('an expiry names no account, so it can only update a row that exists', () => {
  // These carry no custom_data, so there is nothing to create a row from - and
  // creating one would invent a subscription for nobody.
  const d = decide(event('subscription_expired', { status: 'expired' }), VARIANTS);
  assert.equal(d.kind, 'update');
  assert.ok(!('userId' in d));
});

test('a claiming event with no subscription id is refused', () => {
  const d = decide(event('subscription_created', active(), { id: '' }), VARIANTS);
  assert.equal(d.kind, 'reject');
  assert.equal(d.status, 400);
});

test('anything else is acknowledged and ignored', () => {
  for (const name of ['order_created', 'license_key_created', '']) {
    assert.equal(decide(event(name, {}), VARIANTS).kind, 'ignore');
  }
});

// ---------------------------------------------------------------- invoices --

/** A subscription-invoice body. Note data.id is the INVOICE, not the sub. */
const invoice = (over = {}) => ({
  meta: { event_name: 'subscription_payment_success' },
  data: {
    type: 'subscription-invoices',
    id: '55551111',
    attributes: {
      subscription_id: 987654,
      currency: 'USD',
      status: 'paid',
      refunded: false,
      subtotal: 1200,
      tax: 240,
      total: 1440,
      total_formatted: '$14.40',
      card_brand: 'visa',
      card_last_four: '4242',
      ...over,
    },
  },
});

test('a paid invoice records what was actually charged', () => {
  const d = decide(invoice(), VARIANTS);
  assert.equal(d.kind, 'update');
  // The subscription, not the invoice id: matching on data.id would update
  // nobody, and "no row matched" is a 500.
  assert.equal(d.subscriptionId, '987654');
  // Tax included, because that is what leaves the customer's account.
  assert.equal(d.patch.renewal_amount_cents, 1440);
  assert.equal(d.patch.renewal_currency, 'USD');
  assert.equal(d.patch.card_last_four, '4242');
  assert.ok(!('tier' in d.patch), 'an invoice must not move anyone between tiers');
});

test('a refunded invoice is not what the next renewal will cost', () => {
  assert.equal(decide(invoice({ refunded: true }), VARIANTS).kind, 'ignore');
});

test('an invoice with no subscription is refused rather than applied to nobody', () => {
  const d = decide(invoice({ subscription_id: null }), VARIANTS);
  assert.equal(d.kind, 'reject');
  assert.equal(d.status, 400);
});

test('a card the database would refuse is stored as no card, not as a 500', () => {
  // Lemon Squeezy sends "" for a subscription with no card on file - PayPal,
  // or a trial that has not taken a payment yet. profiles.card_last_four is
  // constrained to exactly four digits, and the subscriptions -> profiles sync
  // trigger means a value it rejects aborts the whole webhook transaction:
  // a 500, and a permanent retry for an event that can never succeed.
  for (const bad of ['', '   ', '42', '4242 extra', null, undefined, 4242]) {
    assert.equal(
      decide(invoice({ card_last_four: bad }), VARIANTS).patch.card_last_four,
      null,
      `card_last_four ${JSON.stringify(bad)} must not reach the database`,
    );
  }
  assert.equal(decide(invoice({ card_last_four: ' 4242 ' }), VARIANTS).patch.card_last_four, '4242');
  assert.equal(decide(invoice({ card_brand: '' }), VARIANTS).patch.card_brand, null);
});

test('the currency is normalised to what the column accepts', () => {
  // profiles.renewal_currency is checked against ^[A-Z]{3}$.
  assert.equal(decide(invoice({ currency: 'usd' }), VARIANTS).patch.renewal_currency, 'USD');
  assert.equal(decide(invoice({ currency: ' eur ' }), VARIANTS).patch.renewal_currency, 'EUR');
  for (const bad of ['', 'US', 'DOLLAR', null, 840]) {
    assert.equal(
      decide(invoice({ currency: bad }), VARIANTS).patch.renewal_currency,
      null,
      `currency ${JSON.stringify(bad)} must not reach the database`,
    );
  }
});

test('the same normalising applies to a purchase, not just an invoice', () => {
  const d = decide(
    event('subscription_created', {
      variant_id: 111,
      status: 'active',
      card_brand: '',
      card_last_four: '',
      variant_name: '',
    }),
    VARIANTS,
  );
  assert.equal(d.patch.card_brand, null);
  assert.equal(d.patch.card_last_four, null);
  assert.equal(d.patch.lemon_variant_name, null);
});

test('a nonsense total is stored as nothing rather than a wrong number', () => {
  assert.equal(decide(invoice({ total: 'free' }), VARIANTS).patch.renewal_amount_cents, null);
  assert.equal(decide(invoice({ total: -5 }), VARIANTS).patch.renewal_amount_cents, null);
});

test('a purchase records the plan name and card for the account page', () => {
  const d = decide(
    event('subscription_created', {
      ...active('113'),
      variant_name: 'Team Monthly',
      card_brand: 'mastercard',
      card_last_four: '1881',
    }),
    VARIANTS,
  );
  assert.equal(d.patch.lemon_variant_id, '113');
  assert.equal(d.patch.lemon_variant_name, 'Team Monthly');
  assert.equal(d.patch.card_brand, 'mastercard');
  assert.equal(d.patch.card_last_four, '1881');
});

test('the variant map is parsed forgivingly but matched exactly', () => {
  const v = parseVariantMap(' 111 , 112 ,', '113,');
  assert.deepEqual(v, { pro: ['111', '112'], team: ['113'] });
  assert.equal(resolveTier(111, v), 'pro', 'a numeric id from JSON still matches');
  assert.equal(resolveTier('113', v), 'team');
  assert.equal(resolveTier('11', v), null, 'no prefix or substring matching');
  assert.equal(resolveTier(null, v), null);
  assert.equal(resolveTier('111', parseVariantMap(undefined, undefined)), null);
});

test('unknown statuses fail closed', () => {
  assert.deepEqual(statusPlan('something_new'), { tier: 'free', status: 'inactive' });
});

// -------------------------------------------------------------- signatures --

const SECRET = 'a-test-signing-secret';

async function sign(body, secret = SECRET) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

test('a correctly signed body verifies', async () => {
  const body = JSON.stringify(event('subscription_created', active()));
  assert.equal(await verifySignature(body, await sign(body), SECRET), true);
});

test('a body signed with another secret does not', async () => {
  const body = JSON.stringify(event('subscription_created', active()));
  assert.equal(await verifySignature(body, await sign(body, 'wrong'), SECRET), false);
});

test('a tampered body does not', async () => {
  const body = JSON.stringify(event('subscription_created', active('111')));
  const signature = await sign(body);
  const tampered = body.replace('"variant_id":111', '"variant_id":113');
  assert.notEqual(tampered, body);
  assert.equal(await verifySignature(tampered, signature, SECRET), false);
});

test('a malformed signature header is rejected, not coerced', async () => {
  const body = 'x';
  for (const bad of ['', 'zz', 'abc', 'not-hex-at-all', 'ab'.repeat(16) + 'g']) {
    assert.equal(await verifySignature(body, bad, SECRET), false, `accepted ${bad}`);
  }
  // A short but valid-hex signature must fail on length, not be zero-padded.
  assert.equal(await verifySignature(body, 'abcd', SECRET), false);
});

test('hexToBytes refuses anything that is not whole bytes of hex', () => {
  assert.deepEqual([...hexToBytes('00ff')], [0, 255]);
  assert.equal(hexToBytes('f'), null);
  assert.equal(hexToBytes(''), null);
  assert.equal(hexToBytes('0g'), null);
});

test('the event id repeats for a retry and differs for a real second event', async () => {
  const body = JSON.stringify(event('subscription_updated', active()));
  const again = JSON.stringify(event('subscription_updated', active()));
  const other = JSON.stringify(event('subscription_updated', active('113')));

  assert.equal(await eventIdFor('subscription_updated', '987654', body), await eventIdFor('subscription_updated', '987654', again));
  assert.notEqual(
    await eventIdFor('subscription_updated', '987654', body),
    await eventIdFor('subscription_updated', '987654', other),
  );
});
