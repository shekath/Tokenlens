/**
 * The cost sum run backwards: given a monthly budget, how many calls a day it
 * buys on each model for this prompt and these assumptions.
 *
 * A month is 30 days here, the same as every "per month" figure in the app, so
 * a budget that buys N calls a day costs exactly the budget in the Per 30 days
 * tile at N calls a day.
 */

export const DAYS_PER_MONTH = 30;

export interface BudgetRow<T> {
  item: T;
  /** Whole calls a day the budget covers. 0 when one call a day is already over budget. */
  callsPerDay: number;
  /** Share of the budget the planned volume uses: 1 = exactly on budget, above 1 = over it. */
  planShare: number;
}

/** Whole calls a day that `monthlyBudget` pays for at `perCall` dollars a call. */
export function callsForBudget(monthlyBudget: number, perCall: number): number {
  if (!(monthlyBudget > 0) || !Number.isFinite(monthlyBudget)) return 0;
  if (!(perCall > 0)) return Number.POSITIVE_INFINITY;
  // Round down: a budget covers whole calls, and the last partial call is over it.
  // The tiny epsilon keeps float noise (e.g. 999.9999999) from losing a call.
  return Math.floor(monthlyBudget / DAYS_PER_MONTH / perCall + 1e-9);
}

/** Share of the monthly budget that `plannedCallsPerDay` would spend. */
export function budgetShare(monthlyBudget: number, perCall: number, plannedCallsPerDay: number): number {
  if (!(monthlyBudget > 0)) return Number.POSITIVE_INFINITY;
  return (perCall * plannedCallsPerDay * DAYS_PER_MONTH) / monthlyBudget;
}

/**
 * Every item with what the budget buys, most calls first. Ties keep their input
 * order, so the table does not reshuffle between renders.
 */
export function rankByBudget<T>(
  items: readonly T[],
  perCall: (item: T) => number,
  monthlyBudget: number,
  plannedCallsPerDay: number,
): BudgetRow<T>[] {
  return items
    .map((item, i) => {
      const c = perCall(item);
      return {
        i,
        row: {
          item,
          callsPerDay: callsForBudget(monthlyBudget, c),
          planShare: budgetShare(monthlyBudget, c, plannedCallsPerDay),
        },
      };
    })
    .sort((a, b) => b.row.callsPerDay - a.row.callsPerDay || a.i - b.i)
    .map((x) => x.row);
}
