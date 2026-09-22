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

/**
 * A charged amount, in the currency it was charged in.
 *
 * Lemon Squeezy reports minor units. Dividing by 100 is right for the
 * currencies this store sells in, and wrong for the zero-decimal ones (JPY,
 * KRW) and the three-decimal ones (BHD, KWD) - so the divisor comes from Intl
 * rather than from an assumption, and a currency nobody expected still prints
 * a correct figure.
 */
export function formatAmount(cents: number | null, currency: string | null): string | null {
  if (cents === null || !Number.isFinite(cents) || !currency) return null;
  try {
    const format = new Intl.NumberFormat(undefined, { style: 'currency', currency });
    const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
    return format.format(cents / 10 ** digits);
  } catch {
    // An unknown currency code: better a bare number with the code than nothing.
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** "visa ending 4242", or null when no card is on file. */
export function formatCard(brand: string | null, lastFour: string | null): string | null {
  if (!lastFour) return null;
  return brand ? `${brand} ending ${lastFour}` : `card ending ${lastFour}`;
}

/** Enum values are lower case in the database; a person reading them is not. */
export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** "Past due", not "past_due". */
export function statusLabel(status: string): string {
  return titleCase(status.replace(/_/g, ' '));
}

/**
 * What to call the plan.
 *
 * Lemon Squeezy names the only variant of a single-variant product "Default",
 * and it reports that in every webhook. Showing someone "Default" where their
 * plan should be is worse than showing nothing, so fall back to our own name
 * for the tier they are actually on.
 */
export function planLabel(planName: string | null, tier: string): string {
  const name = planName?.trim();
  if (!name || /^default$/i.test(name)) return titleCase(tier);
  return name;
}
