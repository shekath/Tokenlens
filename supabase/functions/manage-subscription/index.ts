/**
 * Cancel or resume the caller's own subscription.
 *
 * Deployed WITH jwt verification, unlike the webhook: this is a user action,
 * and the platform checking the token before the request arrives is one less
 * thing to get wrong here.
 *
 * The rule this is built around: the subscription id never comes from the
 * request. It is read from the caller's own profile row, found by the user id
 * inside their verified token. A body that could name a subscription would let
 * anyone with an account cancel anyone else's, and no amount of checking after
 * the fact is as reliable as never accepting it.
 *
 * Lemon Squeezy is the system of record. It is called first, and the profile is
 * updated from its answer - so a failure there leaves the row untouched rather
 * than telling the user they have cancelled something they have not. The
 * webhook arrives moments later and writes the same thing; it is idempotent, so
 * both landing is harmless, and this exists only so the UI is right immediately
 * instead of after a round trip through Lemon Squeezy's queue.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

async function lemon(path: string, init: RequestInit): Promise<Record<string, any>> {
  const key = Deno.env.get('LEMON_SQUEEZY_API_KEY');
  if (!key) throw new Error('LEMON_SQUEEZY_API_KEY is not set');

  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  if (!res.ok) {
    // Lemon Squeezy's error bodies are JSON:API `errors` arrays. Log the whole
    // thing; return only the detail, because this reaches a browser.
    console.error('Lemon Squeezy API refused', { path, status: res.status, body: text });
    let detail = `Lemon Squeezy returned ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      detail = parsed?.errors?.[0]?.detail ?? detail;
    } catch {
      // Not JSON; the status is all there is to say.
    }
    throw new Error(detail);
  }
  return JSON.parse(text);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const userId = await callerId(req);
  if (!userId) return json({ error: 'Not signed in.' }, 401);

  let action: string;
  try {
    action = String(((await req.json()) as { action?: unknown })?.action ?? '');
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }
  if (action !== 'cancel' && action !== 'resume' && action !== 'portal') {
    return json({ error: 'Unknown action.' }, 400);
  }

  const { data: profile, error: readError } = await admin
    .from('profiles')
    .select('lemon_subscription_id, subscription_status')
    .eq('id', userId)
    .maybeSingle();

  if (readError) {
    console.error('Could not read profile', { userId, readError });
    return json({ error: 'Could not read your account.' }, 500);
  }
  if (!profile?.lemon_subscription_id) {
    return json({ error: 'There is no subscription on this account.' }, 409);
  }

  const id = profile.lemon_subscription_id;

  // Changing plan belongs to Lemon Squeezy, not to us. It is the merchant of
  // record: it prorates the switch, charges the difference, applies the
  // buyer's tax and keeps one subscription rather than two. Hand-rolling it
  // here would mean mapping every (tier, period) to a numeric variant id in
  // yet another secret - and a wrong variant id is precisely what stranded two
  // paid Pro subscriptions with nothing provisioned.
  //
  // The portal link is short-lived and signed, so it is fetched when asked for
  // rather than stored.
  if (action === 'portal') {
    try {
      const body = await lemon(`/subscriptions/${id}`, { method: 'GET' });
      const url: string | null = body?.data?.attributes?.urls?.customer_portal ?? null;
      if (!url) throw new Error('Lemon Squeezy returned no customer portal link.');
      return json({ ok: true, url });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      console.error('Could not fetch the customer portal', { userId, message });
      return json({ error: message }, 502);
    }
  }

  try {
    const body =
      action === 'cancel'
        ? await lemon(`/subscriptions/${id}`, { method: 'DELETE' })
        : await lemon(`/subscriptions/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              data: { type: 'subscriptions', id: String(id), attributes: { cancelled: false } },
            }),
          });

    const attributes = body?.data?.attributes ?? {};
    const endsAt: string | null = attributes.ends_at ?? null;
    const renewsAt: string | null = attributes.renews_at ?? null;

    // Cancelling does not end access: Lemon Squeezy's `cancelled` means "will
    // not renew", and the customer has paid through ends_at. The tier is left
    // exactly as it is, and lapses on its own (migration 0004).
    const patch =
      action === 'cancel'
        ? { subscription_status: 'cancelled', current_period_end: endsAt ?? renewsAt }
        : { subscription_status: 'active', current_period_end: renewsAt ?? endsAt };

    const { data: updated, error: writeError } = await admin
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select('subscription_status, current_period_end, tier')
      .maybeSingle();

    if (writeError) throw writeError;

    return json({
      ok: true,
      // Lemon Squeezy has already accepted it; if our own write failed we would
      // have thrown above. Reporting its answer, not our request.
      status: updated?.subscription_status ?? patch.subscription_status,
      currentPeriodEnd: updated?.current_period_end ?? patch.current_period_end,
      tier: updated?.tier ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Something went wrong.';
    console.error('Subscription action failed', { userId, action, message });
    return json({ error: message }, 502);
  }
});
