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
 * Columns to write. A key that is absent is deliberately left alone - that is
 * how "cancelled, but paid up until the 30th" keeps its tier.
 */
export interface ProfilePatch {
  tier?: Tier;
  subscription_status?: SubStatus;
  lemon_customer_id?: string | null;
  lemon_subscription_id?: string | null;
  current_period_end?: string | null;
}

export type Decision =
  | { kind: 'ignore'; why: string }
  | { kind: 'reject'; status: number; why: string }
  | { kind: 'applyToUser'; userId: string; patch: ProfilePatch }
  | { kind: 'applyToSubscription'; subscriptionId: string; patch: ProfilePatch };

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

    const plan = statusPlan(String(attributes.status ?? ''));
    const patch: ProfilePatch = {
      subscription_status: plan.status,
      lemon_customer_id: attributes.customer_id ? String(attributes.customer_id) : null,
      lemon_subscription_id: subscriptionId || null,
      current_period_end: periodEnd(attributes),
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
      patch.tier = 'free';
    }
    // 'keep' leaves patch.tier undefined, so the column is not written.

    return { kind: 'applyToUser', userId, patch };
  }

  if (SUBSCRIPTION_EVENTS.has(eventName)) {
    if (!subscriptionId) {
      return { kind: 'reject', status: 400, why: 'event carries no subscription id' };
    }

    if (eventName === 'subscription_payment_failed') {
      return {
        kind: 'applyToSubscription',
        subscriptionId,
        patch: { subscription_status: 'past_due' },
      };
    }

    if (eventName === 'subscription_expired') {
      // The period the customer paid for is over. This is the event that ends
      // access, not the cancellation that scheduled it.
      return {
        kind: 'applyToSubscription',
        subscriptionId,
        patch: {
          tier: 'free',
          subscription_status: 'inactive',
          current_period_end: periodEnd(attributes),
        },
      };
    }

    if (eventName === 'subscription_paused') {
      return {
        kind: 'applyToSubscription',
        subscriptionId,
        patch: {
          tier: 'free',
          subscription_status: 'inactive',
          current_period_end: periodEnd(attributes),
        },
      };
    }

    // subscription_cancelled: scheduled to stop renewing. Keep the tier; the
    // database expires it at current_period_end even if subscription_expired
    // never arrives (see migration 0004).
    return {
      kind: 'applyToSubscription',
      subscriptionId,
      patch: {
        subscription_status: 'cancelled',
        current_period_end: periodEnd(attributes),
      },
    };
  }

  return { kind: 'ignore', why: eventName || 'no event name' };
}
