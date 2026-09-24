/**
 * Search and company filter for the "Every model" table.
 *
 * Model names are written every which way - "GPT-5.4 mini", "gpt-5-4-mini",
 * "gpt5.4" - so matching ignores case and treats dots, dashes, underscores and
 * a letter-digit boundary as the same thing. Every word typed must match
 * somewhere in the model's name, id, API id or company, so "sonnet 4" narrows
 * as a person expects and "anthropic" finds all of one vendor.
 */

import type { Model, Vendor } from './models';

/** "GPT-5.4 mini" -> "gpt 5 4 mini"; "gpt5.4" -> "gpt 5 4". */
export function normaliseName(s: string): string {
  return s
    .toLowerCase()
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function haystack(m: Model): string {
  return ` ${normaliseName(`${m.label} ${m.id} ${m.apiId} ${m.vendor}`)} `;
}

/** True when every word of the query appears in the model's names. */
export function matchesQuery(m: Model, query: string): boolean {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = haystack(m);
  // A word typed as "5.4" or "gpt-5" is a phrase once normalised ("5 4",
  // "gpt 5"): match it as a whole, starting at a word boundary, so "4" does
  // not match "14" but "4" still matches "4 5".
  return words.every((w) => {
    const n = normaliseName(w);
    return n === '' || hay.includes(` ${n}`);
  });
}

export function filterModels<T extends { model: Model }>(
  rows: T[],
  query: string,
  vendors: ReadonlySet<Vendor>,
): T[] {
  return rows.filter(
    (r) => (vendors.size === 0 || vendors.has(r.model.vendor)) && matchesQuery(r.model, query),
  );
}

/** Companies present in the rows, in registry order, with how many models each. */
export function vendorCounts<T extends { model: Model }>(rows: T[], order: readonly Vendor[]): Array<{ vendor: Vendor; count: number }> {
  const counts = new Map<Vendor, number>();
  for (const r of rows) counts.set(r.model.vendor, (counts.get(r.model.vendor) ?? 0) + 1);
  return order.filter((v) => counts.has(v)).map((vendor) => ({ vendor, count: counts.get(vendor)! }));
}
