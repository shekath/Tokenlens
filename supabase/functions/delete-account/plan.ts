/**
 * What deleting an account does, as a decision rather than a request handler.
 *
 * Pure but for the effects it is handed. The reason is the same one that put
 * decide.ts beside the webhook: this path cannot be exercised by clicking
 * around. Every run destroys its own subject, so a manual test can be done
 * once per account and never repeated, and the branch that matters most - a
 * cancellation failing - needs Lemon Squeezy to refuse on cue, which is not
 * something a person can arrange reliably.
 *
 * So the orchestration lives here, the effects are injected, and the ordering
 * guarantee is asserted in tests/deleteAccountPlan.test.mjs rather than hoped
 * for. The guarantee is one sentence: if any cancellation fails, the account
 * is not touched.
 */

export interface SubRow {
  lemon_subscription_id: string;
  status: string;
}

/**
 * Statuses that mean Lemon Squeezy will charge this card again.
 *
 * 'cancelled' is already set not to renew and asking twice is an error rather
 * than a no-op; 'inactive' has stopped. Neither needs cancelling, and trying
 * would turn a working delete into a failed one.
 */
export const BILLING_STATUSES = ['active', 'trialing', 'past_due'];

export function subscriptionsToCancel(rows: SubRow[]): string[] {
  return rows
    .filter((r) => BILLING_STATUSES.includes(String(r.status)))
    .map((r) => String(r.lemon_subscription_id));
}

export interface DeletionEffects {
  /** Stop Lemon Squeezy billing this subscription. Throws if it refuses. */
  cancel(subscriptionId: string): Promise<void>;
  /** Remove the ledger rows carrying this user's id. Never fatal. */
  clearLedger(): Promise<void>;
  /** Delete the auth user. Everything of theirs cascades from it. */
  deleteUser(): Promise<void>;
}

export type DeletionOutcome =
  | { ok: true; cancelled: string[] }
  | { ok: false; stage: 'cancel' | 'delete'; cancelled: string[]; message: string };

const reason = (err: unknown) => (err instanceof Error ? err.message : 'unknown error');

/**
 * Cancel first, then delete - and stop at the first cancellation that fails.
 *
 * Deleting before cancelling would destroy the only record of which
 * subscriptions belonged to this person while Lemon Squeezy, which has never
 * heard of our profiles table, carried on charging their card. The ids would
 * be gone and there would be no automatic recovery, so a half-done delete that
 * leaves someone billed is strictly worse than one that has not happened yet.
 */
export async function runDeletion(
  rows: SubRow[],
  effects: DeletionEffects,
): Promise<DeletionOutcome> {
  const cancelled: string[] = [];

  for (const id of subscriptionsToCancel(rows)) {
    try {
      await effects.cancel(id);
      cancelled.push(id);
    } catch (err) {
      return {
        ok: false,
        stage: 'cancel',
        cancelled,
        message:
          `Your subscription could not be cancelled, so nothing was deleted - ` +
          `otherwise you would keep being charged. Try again, or cancel it from ` +
          `the billing portal first. (${reason(err)})`,
      };
    }
  }

  // Not fatal on its own: an event log with no account behind it is untidy,
  // not dangerous, and stranding the user over it would be the worse trade.
  await effects.clearLedger().catch(() => {});

  try {
    await effects.deleteUser();
  } catch (err) {
    return {
      ok: false,
      stage: 'delete',
      cancelled,
      // The distinction matters to whoever reads this: if subscriptions were
      // already cancelled, they are not being billed, but they still have an
      // account. Saying only "could not delete" would hide that.
      message:
        cancelled.length > 0
          ? `Your subscription was cancelled but the account could not be deleted. ` +
            `You are not being charged. Contact support before signing up again. (${reason(err)})`
          : `Your account could not be deleted. Nothing was changed. (${reason(err)})`,
    };
  }

  return { ok: true, cancelled };
}
