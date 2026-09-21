/**
 * Building the Lemon Squeezy checkout link.
 *
 * Pure, and separated from the hook, because the ways this can fail are all
 * silent ones: a variable missing from the build, a profile row that has not
 * arrived, a popup blocker. Each used to end in the same place - a dialog that
 * closed and nothing else - and none of them could be told apart afterwards.
 */

import type { Plan } from './entitlements';

export type CheckoutFailure = 'unconfigured' | 'wrong-id-kind' | 'no-account';

/**
 * A Lemon Squeezy checkout link ends in the variant's UUID. The webhook, on the
 * other hand, reports `attributes.variant_id` as a plain number, and that
 * number is what the Edge Function's LEMON_*_VARIANT_IDS secrets hold.
 *
 * The two are easy to swap, they are configured in different places hours
 * apart, and the only symptom of swapping them is a 404 on Lemon Squeezy's own
 * domain after the customer has already decided to pay. An all-digits value
 * here is that mistake, so name it rather than building a link that cannot work.
 */
const NUMERIC_ID = /^\d+$/;

/**
 * The base the variant UUID is appended to. Lemon Squeezy's checkout links are
 * `https://<store>.lemonsqueezy.com/checkout/buy/<uuid>`, so anything else here
 * - the store root, or a whole checkout link with a variant already on the end
 * - builds a path that does not exist.
 */
const CHECKOUT_BASE = /\/checkout\/buy\/?$/;

export type CheckoutTarget =
  | { ok: true; url: string }
  | { ok: false; reason: CheckoutFailure; message: string };

export interface CheckoutInputs {
  plan: Plan;
  period: 'monthly' | 'annual';
  /** VITE_LEMON_CHECKOUT_URL, or undefined when the build has none. */
  base: string | undefined;
  /** Resolves a variant env key to its configured id. */
  variantFor: (envKey: string | undefined) => string | null;
  profile: { id: string; email: string | null } | null;
}

export function checkoutTarget({
  plan,
  period,
  base,
  variantFor,
  profile,
}: CheckoutInputs): CheckoutTarget {
  // An annual variant is optional. Falling back here means a plan priced
  // annually but not yet configured sells at its monthly rate, rather than
  // showing a configuration error to someone holding a card.
  const variant =
    (period === 'annual' ? variantFor(plan.variantEnv.annual) : null) ??
    variantFor(plan.variantEnv.monthly);

  if (variant && NUMERIC_ID.test(variant)) {
    return {
      ok: false,
      reason: 'wrong-id-kind',
      message:
        `The ${plan.name} variant is configured as a number (${variant}). A checkout ` +
        'link needs the variant UUID — the last part of its "Copy checkout URL" in ' +
        'Lemon Squeezy. The number is the one the webhook uses, and belongs in the ' +
        'Edge Function secrets instead.',
    };
  }

  if (base && !CHECKOUT_BASE.test(base)) {
    return {
      ok: false,
      reason: 'wrong-id-kind',
      message:
        `The store URL is set to ${base}, which is not a checkout base. It has to end ` +
        'in /checkout/buy — the variant UUID is appended to it. A whole checkout link ' +
        'with a variant already on the end will not work either.',
    };
  }

  if (!base || !variant) {
    return {
      ok: false,
      reason: 'unconfigured',
      message:
        'Checkout is not set up on this deployment yet. ' +
        (base
          ? `No variant id is configured for ${plan.name}.`
          : 'No Lemon Squeezy store URL was built into this site.'),
    };
  }

  // custom[user_id] is what the webhook reads back to find the account to
  // upgrade. Without it the payment goes through and nothing is provisioned,
  // so there is no checkout worth opening. The row is created by a trigger at
  // sign-up, so the only way here is a click in the moment between signing in
  // and the profile arriving.
  if (!profile?.id) {
    return {
      ok: false,
      reason: 'no-account',
      message: 'Your account is still loading. Try that again in a moment.',
    };
  }

  const url = new URL(`${base.replace(/\/$/, '')}/${variant}`);
  url.searchParams.set('checkout[custom][user_id]', profile.id);
  if (profile.email) url.searchParams.set('checkout[email]', profile.email);
  url.searchParams.set('embed', '0');
  return { ok: true, url: url.toString() };
}

/**
 * Opens the checkout, in a new tab if the browser allows one.
 *
 * window.open returns null when a popup blocker stops it, and that is not rare
 * on mobile even from inside a click handler. Returning early there would be
 * the same dead end as everything else here, so fall back to navigating this
 * tab: leaving the page is a worse experience than a second tab, and it is a
 * far better one than a button that does nothing.
 */
export function openCheckoutWindow(url: string, win: Window = window): void {
  const opened = win.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) win.location.assign(url);
}
