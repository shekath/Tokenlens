/**
 * What a Lemon Squeezy event means for a profile row.
 *
 * Pure: no Deno, no network, no database. That is the point - the money path
 * is the one part of this system that cannot be exercised by clicking around,
 * because exercising it means taking a real payment. Keeping the decisions
 * here lets tests/lemonWebhook.test.mjs run every branch against real payload
 * shapes before a card is ever charged.
 */

export type Tier = 'free' | 'pro' | 'team';
export type SubStatus = 'inactive' | 'active' | 'past_due' | 'cancelled' | 'trialing';

/** Which variants grant which tier. Both are required; see resolveTier. */
export interface VariantMap {
  pro: string[];
  team: string[];
}

/**
 * Columns to write on the SUBSCRIPTION row, not the profile. The account's
 * tier is derived from whichever of its subscriptions are live (migration
 * 0007), so this describes one subscription and never the account.
 *
 * A key that is absent is deliberately left alone - that is how "cancelled,
 * but paid up until the 30th" keeps the tier it grants.
 */
export interface SubscriptionPatch {
  tier?: Tier;
  status?: SubStatus;
  lemon_customer_id?: string | null;
  current_period_end?: string | null;
  lemon_variant_id?: string | null;
  lemon_variant_name?: string | null;
  renewal_amount_cents?: number | null;
  renewal_currency?: string | null;
  card_brand?: string | null;
  card_last_four?: string | null;
}

export type Decision =
  | { kind: 'ignore'; why: string }
  | { kind: 'reject'; status: number; why: string }
  /** The event names its account, so the row can be created if it is new. */
  | { kind: 'upsert'; userId: string; subscriptionId: string; patch: SubscriptionPatch }
  /** The event names only a subscription, so the row must already exist. */
  | { kind: 'update'; subscriptionId: string; patch: SubscriptionPatch };

/** Events that carry custom_data.user_id and therefore identify the account. */
const CLAIMING_EVENTS = new Set([
  'subscription_created',
  'subscription_updated',
  'subscription_resumed',
  'subscription_unpaused',
]);

/** Events that act on a subscription already recorded against a profile. */
const SUBSCRIPTION_EVENTS = new Set([
  'subscription_cancelled',
  'subscription_expired',
  'subscription_paused',
  'subscription_payment_failed',
]);

/**
 * Invoice events. Their `data.id` is the INVOICE id - the subscription is in
 * `attributes.subscription_id`, and matching on the wrong one would update
 * nobody, which the "no row matched" check in index.ts turns into a 500.
 */
const INVOICE_EVENTS = new Set(['subscription_payment_success']);

/**
 * Lemon Squeezy sends "" rather than null for fields it has nothing to put in -
 * a subscription paid by PayPal has no card, one still in trial has no invoice
 * currency. The database is stricter than that: profiles constrains
 * card_last_four to exactly four digits and renewal_currency to three
 * uppercase letters (migration 0005), and because the subscriptions row syncs
 * into profiles by trigger, a value those checks reject does not get quietly
 * dropped - it aborts the whole webhook transaction. That is a 500, and a 500
 * is a retry, forever, for an event that will never succeed.
 *
 * So normalise at the boundary: anything that is not the shape the column
 * accepts becomes null, which every one of these columns allows.
 */
function digits4(value: unknown): string | null {
  const s = typeof value === 'string' ? value.trim() : '';
  return /^[0-9]{4}$/.test(s) ? s : null;
}

function currencyCode(value: unknown): string | null {
  // Lemon Squeezy documents ISO 4217 uppercase, but the column is the contract
  // and upper-casing a code that is already uppercase costs nothing.
  const s = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z]{3}$/.test(s) ? s : null;
}

function nonEmpty(value: unknown): string | null {
  const s = typeof value === 'string' ? value.trim() : '';
  return s === '' ? null : s;
}

export function parseVariantMap(pro: string | undefined, team: string | undefined): VariantMap {
  const list = (s: string | undefined) =>
    (s ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  return { pro: list(pro), team: list(team) };
}

/**
 * Which tier a variant grants.
 *
 * Null means "this variant is in neither list", which the caller turns into a
 * 5xx. The previous version defaulted anything unrecognised to Pro, so a Team
 * purchase made before LEMON_TEAM_VARIANT_IDS was set provisioned Pro: the
 * customer paid $39 for $12 of product, and nothing anywhere said so. A loud
 * failure that Lemon Squeezy retries is worth more than a quiet wrong answer -
 * the retry succeeds the moment the variable is corrected.
 */
export function resolveTier(variantId: unknown, variants: VariantMap): Tier | null {
  const id = String(variantId ?? '');
  if (id === '') return null;
  if (variants.team.includes(id)) return 'team';
  if (variants.pro.includes(id)) return 'pro';
  return null;
}

/**
 * How a Lemon Squeezy subscription status maps onto ours, and whether it
 * changes the tier at all.
 *
 * `tier: 'keep'` is the interesting case. Lemon Squeezy's `cancelled` means
 * "will not renew", not "access ends now" - `ends_at` is in the future and the
 * customer has paid for every day up to it. Dropping them to free on the
 * cancellation event, which is what this did before, takes away what they
 * already bought. `subscription_expired` arrives when the period actually ends
 * and is what drops the tier. `past_due` is the same argument mid-dunning:
 * Lemon Squeezy retries the card for days, and a first failed retry is not a
 * reason to lock someone out.
 */
export function statusPlan(status: string): { tier: 'grant' | 'free' | 'keep'; status: SubStatus } {
  switch (status) {
    case 'active':
      return { tier: 'grant', status: 'active' };
    case 'on_trial':
      return { tier: 'grant', status: 'trialing' };
    case 'past_due':
      return { tier: 'keep', status: 'past_due' };
    case 'cancelled':
      return { tier: 'keep', status: 'cancelled' };
    case 'paused':
    case 'expired':
    case 'unpaid':
      return { tier: 'free', status: 'inactive' };
    default:
      return { tier: 'free', status: 'inactive' };
  }
}

/** When the paid-for period runs out, as the payload reports it. */
function periodEnd(attributes: Record<string, unknown>): string | null {
  return (attributes.ends_at as string | null) ?? (attributes.renews_at as string | null) ?? null;
}

export function decide(payload: Record<string, any>, variants: VariantMap): Decision {
  const eventName: string = payload?.meta?.event_name ?? '';
  const attributes: Record<string, unknown> = payload?.data?.attributes ?? {};
  const subscriptionId = String(payload?.data?.id ?? '');

  if (CLAIMING_EVENTS.has(eventName)) {
    const userId: string | undefined = payload?.meta?.custom_data?.user_id;
    if (!userId) {
      // Without this the payment succeeds and nobody is upgraded, silently.
      return { kind: 'reject', status: 400, why: 'missing custom_data.user_id' };
    }

    if (!subscriptionId) {
      return { kind: 'reject', status: 400, why: 'event carries no subscription id' };
    }

    const plan = statusPlan(String(attributes.status ?? ''));
    const patch: SubscriptionPatch = {
      status: plan.status,
      lemon_customer_id: attributes.customer_id ? String(attributes.customer_id) : null,
      current_period_end: periodEnd(attributes),
      // What the customer sees in their own account, in Lemon Squeezy's words
      // rather than ours: they bought a named plan, not a tier enum.
      lemon_variant_id: attributes.variant_id ? String(attributes.variant_id) : null,
      lemon_variant_name: nonEmpty(attributes.variant_name),
      card_brand: nonEmpty(attributes.card_brand),
      card_last_four: digits4(attributes.card_last_four),
    };

    if (plan.tier === 'grant') {
      const tier = resolveTier(attributes.variant_id, variants);
      if (!tier) {
        return {
          kind: 'reject',
          status: 500,
          why: `variant ${String(attributes.variant_id)} is in neither LEMON_PRO_VARIANT_IDS nor LEMON_TEAM_VARIANT_IDS`,
        };
      }
      patch.tier = tier;
    } else if (plan.tier === 'free') {
      // Not "the account is free" - this subscription grants nothing while it
      // is in this state, and private.subscription_is_live() is what decides
      // whether it counts at all. Other subscriptions on the account are
      // untouched, which is the whole point of 0007.
      patch.tier = 'free';
    }
    // 'keep' leaves patch.tier undefined, so the subscription goes on granting
    // whatever it already grants.

    return { kind: 'upsert', userId, subscriptionId, patch };
  }

  if (SUBSCRIPTION_EVENTS.has(eventName)) {
    if (!subscriptionId) {
      return { kind: 'reject', status: 400, why: 'event carries no subscription id' };
    }

    if (eventName === 'subscription_payment_failed') {
      return { kind: 'update', subscriptionId, patch: { status: 'past_due' } };
    }

    if (eventName === 'subscription_expired') {
      // The period the customer paid for is over. This is the event that ends
      // access, not the cancellation that scheduled it.
      return {
        kind: 'update',
        subscriptionId,
        patch: { status: 'inactive', current_period_end: periodEnd(attributes) },
      };
    }

    if (eventName === 'subscription_paused') {
      return {
        kind: 'update',
        subscriptionId,
        patch: { status: 'inactive', current_period_end: periodEnd(attributes) },
      };
    }

    // subscription_cancelled: scheduled to stop renewing. Keep the tier; the
    // database expires it at current_period_end even if subscription_expired
    // never arrives (see migration 0004).
    return {
      kind: 'update',
      subscriptionId,
      patch: { status: 'cancelled', current_period_end: periodEnd(attributes) },
    };
  }

  if (INVOICE_EVENTS.has(eventName)) {
    const onSubscription = String(attributes.subscription_id ?? '');
    if (!onSubscription) {
      return { kind: 'reject', status: 400, why: 'invoice carries no subscription_id' };
    }
    // A refunded invoice is not what the next renewal will cost.
    if (attributes.refunded === true) {
      return { kind: 'ignore', why: 'refunded invoice' };
    }

    const total = Number(attributes.total);
    return {
      kind: 'update',
      subscriptionId: onSubscription,
      patch: {
        // attributes.total is minor units and includes tax. The only honest
        // answer to "what will I be charged": our own price list is what we
        // advertise, not what this customer holds.
        renewal_amount_cents: Number.isFinite(total) && total >= 0 ? Math.round(total) : null,
        renewal_currency: currencyCode(attributes.currency),
        card_brand: nonEmpty(attributes.card_brand),
        card_last_four: digits4(attributes.card_last_four),
      },
    };
  }

  return { kind: 'ignore', why: eventName || 'no event name' };
}
