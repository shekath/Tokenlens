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

  const variants = parseVariantMap(
    Deno.env.get('LEMON_PRO_VARIANT_IDS'),
    Deno.env.get('LEMON_TEAM_VARIANT_IDS'),
  );

  const decision = decide(payload, variants);

  if (decision.kind === 'reject') {
    // Nothing is claimed in the ledger: a retry must be able to do real work
    // once the cause is fixed, rather than short-circuit as a duplicate.
    //
    // "variant X is in neither list" is unanswerable from outside without
    // knowing what the lists actually hold, and that cost a morning: the
    // secret was corrected, the event was resent, and the refusal came back
    // word for word with no way to tell whether the function was reading a
    // stale value, an empty one, or a correct one that simply lacked the id.
    // It turned out the KEY was named "LEMON_PRO_VARIANT_IDS," - a comma had
    // landed in the name - which no amount of staring at the old message
    // could have revealed.
    //
    // So log the parsed lists. Variant ids are not secret - they are in the
    // public checkout URL every customer sees - and the difference between
    // [] and ['2152674'] is the whole diagnosis: empty means the secret is
    // missing or misnamed, populated-but-wrong means the ids are.
    // Environment values are never logged, only the LEMON_ key names.
    console.error('Refusing event', {
      eventId,
      eventName,
      why: decision.why,
      proVariants: variants.pro,
      teamVariants: variants.team,
      lemonKeysVisible: Object.keys(Deno.env.toObject())
        .filter((k) => k.startsWith('LEMON_'))
        .sort(),
    });
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
    if (decision.kind === 'upsert') {
      // The subscription id is the primary key, so this is exact and repeats
      // harmlessly. A second subscription on the same account is now an
      // ordinary row rather than something that overwrites the first.
      // `tier` is deliberately not defaulted here. The column defaults to
      // 'free' for a new row, and leaving it out of the payload means an
      // upsert that has nothing to say about the tier does not touch it - so a
      // cancellation, which keeps whatever the subscription already grants,
      // cannot flatten a live Pro row to free on its way past.
      const { error } = await supabase.from('subscriptions').upsert(
        {
          lemon_subscription_id: decision.subscriptionId,
          user_id: decision.userId,
          ...decision.patch,
        },
        { onConflict: 'lemon_subscription_id' },
      );
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from('subscriptions')
        .update(decision.patch)
        .eq('lemon_subscription_id', decision.subscriptionId)
        .select('lemon_subscription_id');

      if (error) throw error;

      // These events name no account, so there is nothing to create from. A
      // miss means this deployment has never seen the subscription - one that
      // belongs to another environment sharing the store, or one refused at
      // creation. Retrying on a timer cannot make it match, so answer 200 and
      // let Lemon Squeezy stop.
      //
      // But release the ledger claim on the way out. The claim exists to stop
      // one delivery being APPLIED twice, and nothing was applied here. Left
      // in place it silently makes the event unreplayable: a later resend,
      // once the cause is fixed, hashes to the same id, is dismissed as a
      // duplicate and returns 200 having done nothing.
      //
      // That is not hypothetical. Three subscription_payment_success events
      // were acknowledged this way while their subscription was refused at
      // creation over a misnamed secret. When the secret was fixed and the
      // creation event replayed, the account provisioned correctly - and the
      // amounts stayed null, because those three could no longer be replayed
      // at all. The refusal path above never claims, for exactly this reason;
      // this path should not have either.
      if (!data || data.length === 0) {
        await supabase.from('billing_events').delete().eq('event_id', eventId);
        console.warn('Event for an untracked subscription', {
          eventId,
          eventName,
          subscriptionId: decision.subscriptionId,
        });
        return Response.json({ received: true, untrackedSubscription: decision.subscriptionId });
      }
    }
  } catch (err) {
    // Release the claim so a retry can do real work rather than short-circuit
    // on a ledger row for an update that never landed.
    await supabase.from('billing_events').delete().eq('event_id', eventId);

    // 23503 is foreign_key_violation. On the upsert path it means one thing:
    // custom_data.user_id names an account that no longer exists, so the
    // subscriptions row cannot reference it. That is what a deleted account
    // looks like from here.
    //
    // Lemon Squeezy does not know the account is gone and keeps sending
    // events for the subscription it cancelled on the way out. Answering 500
    // asks it to retry something that can never succeed - the user will not
    // come back - and that is exactly what happened the first time an account
    // was deleted: six 500s in thirty seconds before Lemon Squeezy gave up.
    //
    // So acknowledge it. The subscription was already cancelled by
    // delete-account before the account went, so nothing is left billing.
    if ((err as { code?: string })?.code === '23503') {
      console.warn('Event for a deleted account', {
        eventId,
        eventName,
        detail: (err as { details?: string }).details,
      });
      return Response.json({ received: true, deletedAccount: true });
    }

    console.error('Failed to apply billing event', { eventId, eventName, err });
    return new Response('Failed to apply event', { status: 500 });
  }

  return Response.json({ received: true });
});
