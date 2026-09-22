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
import { chooseVariant, type Period, type VariantChoice } from './plans.ts';

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
  let wantTier = '';
  let wantPeriod: Period = 'monthly';
  try {
    const body = (await req.json()) as { action?: unknown; tier?: unknown; period?: unknown };
    action = String(body?.action ?? '');
    // A tier, never a variant id. The variant is resolved from the same
    // secrets the webhook trusts, so a caller cannot name an arbitrary price.
    wantTier = String(body?.tier ?? '');
    wantPeriod = body?.period === 'annual' ? 'annual' : 'monthly';
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }
  if (!['cancel', 'resume', 'portal', 'switch'].includes(action)) {
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

  // Lemon Squeezy's own portal: the card on file, the invoices, and plan
  // changes too. It was the whole answer here until it turned out to require
  // an activated store - before activation it answers "This store has not been
  // activated", which is a dead end for anyone still in test mode. So plan
  // changes moved to the API above, which works either way, and this stays for
  // the things only the merchant of record can show.
  //
  // The link is short-lived and signed, so it is fetched when asked for rather
  // than stored.
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

  /**
   * Move the existing subscription to another plan.
   *
   * This rather than a second checkout: buying again while a subscription is
   * active creates a SECOND subscription, and this schema holds one id per
   * profile, so the first would keep billing unreachable from the app.
   * Lemon Squeezy prorates the change and keeps it to one subscription.
   *
   * The customer portal does the same thing, but only for an activated store -
   * before activation it answers "This store has not been activated", which is
   * a dead end for anyone still in test mode. The API works either way.
   */
  if (action === 'switch') {
    const list = (name: string) =>
      (Deno.env.get(name) ?? '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);

    if (wantTier !== 'team' && wantTier !== 'pro') {
      return json({ error: 'Unknown plan.' }, 400);
    }

    const ids = wantTier === 'team' ? list('LEMON_TEAM_VARIANT_IDS') : list('LEMON_PRO_VARIANT_IDS');
    if (ids.length === 0) {
      return json(
        { error: `No variants are configured for ${wantTier}. Set LEMON_${wantTier.toUpperCase()}_VARIANT_IDS.` },
        500,
      );
    }

    try {
      // Ask Lemon Squeezy what each variant's billing interval is rather than
      // encoding that in yet another secret. One wrong id in a secret is what
      // stranded two paid subscriptions already.
      // Named variantId, not id: `id` a few lines up is the SUBSCRIPTION, and
      // the PATCH below addresses it. Shadowing it here would read as though
      // the two were the same thing, in the one place where confusing them
      // would move the wrong customer onto the wrong plan.
      const candidates: VariantChoice[] = [];
      for (const variantId of ids) {
        const v = await lemon(`/variants/${variantId}`, { method: 'GET' });
        candidates.push({ id: variantId, interval: v?.data?.attributes?.interval ?? null });
      }

      const target = chooseVariant(candidates, wantPeriod);
      if (!target) {
        return json({ error: 'No matching plan for that billing period.' }, 409);
      }

      const body = await lemon(`/subscriptions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          data: {
            type: 'subscriptions',
            id: String(id),
            attributes: { variant_id: Number(target) },
          },
        }),
      });

      const attributes = body?.data?.attributes ?? {};
      const { data: updated, error: writeError } = await admin
        .from('profiles')
        .update({
          tier: wantTier,
          subscription_status: 'active',
          current_period_end: attributes.renews_at ?? attributes.ends_at ?? null,
          lemon_variant_id: String(target),
          lemon_variant_name: attributes.variant_name ?? null,
        })
        .eq('id', userId)
        .select('subscription_status, current_period_end, tier')
        .maybeSingle();

      if (writeError) throw writeError;

      return json({
        ok: true,
        status: updated?.subscription_status ?? 'active',
        currentPeriodEnd: updated?.current_period_end ?? null,
        tier: updated?.tier ?? wantTier,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      console.error('Plan switch failed', { userId, wantTier, wantPeriod, message });
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
