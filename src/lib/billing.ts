/**
 * What the subscription columns mean, on the client.
 *
 * Two of these mirror rules the database also enforces, and that duplication is
 * deliberate: the database is the authority, and the UI has to reach the same
 * answer or it will offer a feature Postgres then refuses. Where they could
 * drift, the tests pin them to the same cases as the SQL suite.
 */

import type { SubscriptionStatus, Tier } from './entitlements';

export interface BillingFacts {
  tier: Tier;
  status: SubscriptionStatus;
  /** ISO timestamp, or null. */
  currentPeriodEnd: string | null;
}

/**
 * The tier to act on now.
 *
 * Mirrors private.current_tier() from migration 0004: a cancelled subscription
 * keeps its tier until the period the customer paid for is over, then reverts,
 * whether or not Lemon Squeezy's expiry webhook ever arrives. An *active*
 * subscription past its renewal date is a webhook we have not processed yet,
 * and is left alone - locking out a paying customer over our own missed event
 * is the worse failure.
 */
export function effectiveTier(facts: BillingFacts | null, now: number = Date.now()): Tier {
  if (!facts) return 'free';
  if (facts.status === 'cancelled' && facts.currentPeriodEnd) {
    const end = Date.parse(facts.currentPeriodEnd);
    if (Number.isFinite(end) && end <= now) return 'free';
  }
  return facts.tier;
}

export interface BillingNotice {
  tone: 'ok' | 'warn';
  /**
   * The whole sentence bar the date, which the component appends and formats -
   * a date is the one part of this that has to be rendered in the reader's own
   * locale, and a pure function has no business guessing at that.
   */
  prefix: string;
  /** null when there is no date to show. */
  date: Date | null;
}

/**
 * The one line about billing worth putting in front of someone.
 *
 * Nothing showed the subscription status anywhere before, so a failed card or a
 * cancellation that had already gone through was invisible until the features
 * disappeared.
 */
export function billingNotice(facts: BillingFacts | null, now: number = Date.now()): BillingNotice | null {
  if (!facts) return null;

  const end = facts.currentPeriodEnd ? new Date(facts.currentPeriodEnd) : null;
  const dated = end && Number.isFinite(end.getTime()) ? end : null;

  if (facts.status === 'past_due') {
    return { tone: 'warn', prefix: 'Payment failed — update your card to keep your plan', date: null };
  }

  if (facts.status === 'cancelled') {
    // Once the date has passed the tier is already free; saying "ended" is
    // more honest than "cancels on", which reads as though it has not yet.
    if (dated && dated.getTime() <= now) {
      return { tone: 'warn', prefix: 'Subscription ended', date: dated };
    }
    return { tone: 'warn', prefix: 'Cancels on', date: dated };
  }

  if (facts.tier === 'free') return null;

  if (facts.status === 'trialing') {
    return { tone: 'ok', prefix: 'Trial ends', date: dated };
  }

  if (facts.status === 'active' && dated) {
    return { tone: 'ok', prefix: 'Renews', date: dated };
  }

  return null;
}

/** Short and unambiguous in any locale: 21 Oct 2026, not 10/21/26. */
export function formatBillingDate(date: Date): string {
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
