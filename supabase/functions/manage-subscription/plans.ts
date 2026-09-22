/**
 * Choosing which variant a plan switch should move to.
 *
 * Pure, and tested from node in tests/planSwitch.test.mjs, because getting this
 * wrong moves a paying customer onto the wrong price and the only way to find
 * out is their next invoice.
 */

export type Period = 'monthly' | 'annual';

export interface VariantChoice {
  id: string;
  /** Lemon Squeezy reports 'month' or 'year' on the variant. */
  interval: string | null;
}

/**
 * The variant to switch to, or null when the answer is not obvious.
 *
 * Order matters: an exact interval match wins. Where there is no exact match
 * but only one candidate, that one is it - a plan sold monthly only is still
 * the right plan when someone asks for it with the annual toggle on, which is
 * the same fallback the checkout makes. Where there are several and none
 * match, this returns null rather than guessing, because the guess would be a
 * price the customer did not choose.
 */
export function chooseVariant(candidates: VariantChoice[], period: Period): string | null {
  if (candidates.length === 0) return null;

  const wanted = period === 'annual' ? 'year' : 'month';
  const exact = candidates.find((c) => (c.interval ?? '').toLowerCase() === wanted);
  if (exact) return exact.id;

  if (candidates.length === 1) return candidates[0]!.id;

  return null;
}
