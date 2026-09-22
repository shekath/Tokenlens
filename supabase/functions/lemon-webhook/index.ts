/**
 * Lemon Squeezy webhook -> profile tier.
 *
 * Deployed with `supabase functions deploy lemon-webhook --no-verify-jwt`: Lemon
 * Squeezy signs with HMAC rather than carrying a Supabase JWT, so the platform's
 * own auth must be off and this function does the verifying.
 *
 * This file is the runtime shell only: verify, claim, apply, answer. Every
 * decision about what an event means lives in decide.ts, which is pure and
 * tested in tests/lemonWebhook.test.mjs - the money path cannot be exercised by
 * clicking around, so it has to be exercised by tests.
 *
 * Differences from the blueprint's draft, each load-bearing:
 *
 *  - Idempotency is real. The draft called itself idempotent but kept no record,
 *    so a retry (Lemon Squeezy retries any non-2xx) re-applied the update. Each
 *    event id is claimed in billing_events first; a duplicate claim returns 200
 *    without touching the profile.
 *
 *  - A missing custom_data.user_id is a hard 400. The draft passed undefined
 *    into `.eq("id", ...)`, which matches nothing and returns success, so a
 *    payment would be taken with no upgrade and no alert.
 *
 *  - An update that matches no row is an error, not a success. PostgREST
 *    reports no error for an UPDATE that hits nothing, so a wrong user id or an
 *    unknown subscription id would have been acknowledged and lost.
 *
 *  - Failures return 5xx so Lemon Squeezy retries instead of dropping the event.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decide, parseVariantMap } from './decide.ts';
import { eventIdFor, verifySignature } from './signature.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  // Service role: bypasses RLS, which is exactly what a billing writer needs and
  // exactly why this key must never reach the browser bundle.
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const secret = Deno.env.get('LEMON_SQUEEZY_WEBHOOK_SECRET');
  if (!secret) {
    console.error('LEMON_SQUEEZY_WEBHOOK_SECRET is not set');
    return new Response('Server misconfigured', { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-signature') ?? '';

  if (!(await verifySignature(rawBody, signature, secret))) {
    return new Response('Invalid signature', { status: 401 });
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Malformed JSON', { status: 400 });
  }

  const eventName: string = payload?.meta?.event_name ?? '';
  const subscriptionId = String(payload?.data?.id ?? '');
  const eventId = await eventIdFor(eventName, subscriptionId, rawBody);

  const decision = decide(
    payload,
    parseVariantMap(Deno.env.get('LEMON_PRO_VARIANT_IDS'), Deno.env.get('LEMON_TEAM_VARIANT_IDS')),
  );

  if (decision.kind === 'reject') {
    // Nothing is claimed in the ledger: a retry must be able to do real work
    // once the cause is fixed, rather than short-circuit as a duplicate.
    console.error('Refusing event', { eventId, eventName, why: decision.why });
    return new Response(decision.why, { status: decision.status });
  }

  const { error: claimError } = await supabase
    .from('billing_events')
    .insert({ event_id: eventId, event_name: eventName, payload });

  if (claimError) {
    // 23505 is unique_violation: this delivery was already applied.
    if ((claimError as { code?: string }).code === '23505') {
      return Response.json({ received: true, duplicate: true });
    }
    console.error('Could not record billing event', claimError);
    return new Response('Ledger write failed', { status: 500 });
  }

  if (decision.kind === 'ignore') {
    return Response.json({ received: true, ignored: decision.why });
  }

  try {
    const query = supabase.from('profiles').update(decision.patch);
    const { data, error } =
      decision.kind === 'applyToUser'
        ? await query.eq('id', decision.userId).select('id')
        : await query.eq('lemon_subscription_id', decision.subscriptionId).select('id');

    if (error) throw error;

    // An UPDATE matching nothing is not an error to PostgREST, so without this
    // check it would be acknowledged and forgotten. What a miss MEANS differs
    // by how the row was addressed, and so does what to do about it.
    if (!data || data.length === 0) {
      if (decision.kind === 'applyToUser') {
        // A payment whose custom_data names an account that does not exist.
        // Money has been taken and nobody upgraded, and a retry genuinely can
        // fix it once the cause is found, so fail loudly.
        throw new Error(`no profile with id ${decision.userId}`);
      }

      // A subscription this deployment does not track: one refused at creation,
      // one superseded because a profile holds a single subscription id, or one
      // belonging to another environment sharing the store. Retrying cannot
      // make it match, and returning 5xx only buys a retry storm - four of
      // them, for two cancelled duplicates, is how this was found. Acknowledge
      // it and keep the ledger row, which holds the whole payload if anyone
      // needs to reconstruct what happened.
      console.warn('Event for an untracked subscription', {
        eventId,
        eventName,
        subscriptionId: decision.subscriptionId,
      });
      return Response.json({ received: true, untrackedSubscription: decision.subscriptionId });
    }
  } catch (err) {
    // Release the claim so the retry can do real work rather than short-circuit
    // on a ledger row for an update that never landed.
    await supabase.from('billing_events').delete().eq('event_id', eventId);
    console.error('Failed to apply billing event', { eventId, eventName, err });
    return new Response('Failed to apply event', { status: 500 });
  }

  return Response.json({ received: true });
});
