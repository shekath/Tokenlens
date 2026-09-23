/**
 * Delete the caller's own account, and everything of theirs behind it.
 *
 * Deployed WITH jwt verification. The user id comes from the verified token and
 * never from the request body - the same rule as manage-subscription, and it
 * matters more here: a body that could name an account would let anyone with a
 * login delete anyone else's, irreversibly.
 *
 * ORDER IS THE WHOLE DESIGN.
 *
 * Live subscriptions are cancelled at Lemon Squeezy FIRST, and a failure there
 * aborts the delete. Deleting the account first would destroy the only record
 * of which subscriptions belonged to this person while Lemon Squeezy - the
 * merchant of record, which has never heard of our profiles table - carries on
 * charging their card every month for a product they can no longer sign in to.
 * There is no recovering from that automatically: the ids are gone. So the
 * account survives a cancellation failure, and the user is told to try again.
 *
 * What gets removed, and why:
 *
 *  - auth.users: the account itself. profiles cascades from it (0001), and
 *    saved_estimates and subscriptions cascade from profiles (0001, 0007). One
 *    delete takes the lot, which is why those cascades exist.
 *
 *  - billing_events rows carrying this user's id. They are the webhook's
 *    idempotency ledger rather than user data, but each payload holds the
 *    buyer's email and name, and "delete my account" has to mean that too.
 *    Lemon Squeezy keeps the authoritative billing record either way - it is
 *    the merchant of record, and its invoices are not ours to erase.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runDeletion } from './plan.ts';

const API = 'https://api.lemonsqueezy.com/v1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

/** The caller, from their own token. Never from anything they sent. */
async function callerId(req: Request): Promise<string | null> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

/**
 * Ask Lemon Squeezy to stop billing a subscription.
 *
 * A 404 is success for our purposes: the subscription is not there to bill, so
 * the thing we are trying to prevent cannot happen. Anything else is a real
 * failure and must stop the delete.
 */
async function cancelAtLemon(subscriptionId: string): Promise<void> {
  const key = Deno.env.get('LEMON_SQUEEZY_API_KEY');
  if (!key) throw new Error('LEMON_SQUEEZY_API_KEY is not set');

  const res = await fetch(`${API}/subscriptions/${subscriptionId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
    },
  });

  if (res.status === 404) {
    console.warn('Subscription already gone at Lemon Squeezy', { subscriptionId });
    return;
  }
  if (!res.ok) {
    const body = await res.text();
    console.error('Lemon Squeezy refused a cancellation', {
      subscriptionId,
      status: res.status,
      body,
    });
    let detail = `Lemon Squeezy returned ${res.status}`;
    try {
      detail = JSON.parse(body)?.errors?.[0]?.detail ?? detail;
    } catch {
      // Not JSON; the status is all there is to say.
    }
    throw new Error(detail);
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const userId = await callerId(req);
  if (!userId) return json({ error: 'Not signed in.' }, 401);

  // The interface already makes the user type this. Requiring it here too
  // means an empty POST to this endpoint - a stray fetch, a replayed request,
  // a curious person with their own token - does not delete anything.
  let confirm = '';
  try {
    const body = (await req.json()) as { confirm?: unknown };
    confirm = String(body?.confirm ?? '').trim();
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }
  if (confirm !== 'delete') {
    return json({ error: 'Type delete to confirm.' }, 400);
  }

  // Read the subscriptions before anything is destroyed. After the delete
  // these ids are unrecoverable, and they are the only handle on a card that
  // would otherwise keep being charged.
  const { data: subs, error: readError } = await admin
    .from('subscriptions')
    .select('lemon_subscription_id, status')
    .eq('user_id', userId);

  if (readError) {
    console.error('Could not read subscriptions before deleting', { userId, readError });
    return json({ error: 'Could not check your subscriptions. Nothing was deleted.' }, 500);
  }

  // The order, the stop-on-failure rule and every message live in plan.ts,
  // where tests/deleteAccountPlan.test.mjs can run them on demand. They cannot
  // be exercised from here: each real deletion destroys its own subject, and
  // the branch that matters most needs Lemon Squeezy to refuse on cue.
  const outcome = await runDeletion(subs ?? [], {
    cancel: cancelAtLemon,
    clearLedger: async () => {
      // Keyed by event rather than by user, so it does not cascade. Each
      // payload holds the buyer's email and name.
      const { error } = await admin
        .from('billing_events')
        .delete()
        .filter('payload->meta->custom_data->>user_id', 'eq', userId);
      if (error) throw error;
    },
    deleteUser: async () => {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
    },
  });

  if (!outcome.ok) {
    console.error('Account deletion did not complete', {
      userId,
      stage: outcome.stage,
      cancelled: outcome.cancelled,
    });
    return json({ error: outcome.message }, outcome.stage === 'cancel' ? 502 : 500);
  }

  const cancelled = outcome.cancelled;

  console.log('Account deleted', { userId, cancelledSubscriptions: cancelled });
  return json({ deleted: true, cancelledSubscriptions: cancelled });
});
