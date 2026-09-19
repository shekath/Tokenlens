/**
 * Lemon Squeezy webhook -> profile tier.
 *
 * Deployed with `supabase functions deploy lemon-webhook --no-verify-jwt`: Lemon
 * Squeezy signs with HMAC rather than carrying a Supabase JWT, so the platform's
 * own auth must be off and this function does the verifying.
 *
 * Differences from the blueprint's draft, each load-bearing:
 *
 *  - Idempotency is real. The draft called itself idempotent but kept no record,
 *    so a retry (Lemon Squeezy retries any non-2xx) re-applied the update. Each
 *    event id is claimed in billing_events first; a duplicate claim returns 200
 *    without touching the profile.
 *
 *  - The signature is compared over raw bytes with a length check first.
 *    `parseInt` on a malformed hex header yields NaN bytes, which silently
 *    become 0 and could be compared against a short digest.
 *
 *  - A missing custom_data.user_id is a hard 400. The draft passed undefined
 *    into `.eq("id", ...)`, which matches nothing and returns success, so a
 *    payment would be taken with no upgrade and no alert.
 *
 *  - Failures return 5xx so Lemon Squeezy retries instead of dropping the event.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  // Service role: bypasses RLS, which is exactly what a billing writer needs and
  // exactly why this key must never reach the browser bundle.
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function verify(rawBody: string, signatureHex: string, secret: string): Promise<boolean> {
  const signature = hexToBytes(signatureHex);
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  // SHA-256 digests are 32 bytes; anything else cannot match and importKey/verify
  // should not be asked to reason about it.
  if (signature.length !== 32) return false;
  return crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(rawBody));
}

const ACTIVE_STATUSES = new Set(['active', 'on_trial']);
const UPGRADE_EVENTS = new Set([
  'subscription_created',
  'subscription_updated',
  'subscription_resumed',
  'subscription_unpaused',
]);
const DOWNGRADE_EVENTS = new Set([
  'subscription_cancelled',
  'subscription_expired',
  'subscription_paused',
]);

/** Maps a Lemon Squeezy status onto the sub_status enum. */
function toStatus(status: string): string {
  switch (status) {
    case 'active':
      return 'active';
    case 'on_trial':
      return 'trialing';
    case 'past_due':
      return 'past_due';
    case 'cancelled':
      return 'cancelled';
    case 'expired':
    case 'unpaid':
    case 'paused':
      return 'inactive';
    default:
      return 'inactive';
  }
}

/**
 * Which tier a variant grants. Set LEMON_TEAM_VARIANT_IDS to the comma-separated
 * Team variant ids; everything else that is active resolves to Pro. Without this
 * a Team purchase would silently provision Pro.
 */
function tierForVariant(variantId: string | number | null | undefined): 'pro' | 'team' {
  const teamIds = (Deno.env.get('LEMON_TEAM_VARIANT_IDS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return teamIds.includes(String(variantId)) ? 'team' : 'pro';
}

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

  if (!(await verify(rawBody, signature, secret))) {
    return new Response('Invalid signature', { status: 401 });
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Malformed JSON', { status: 400 });
  }

  const eventName: string = payload?.meta?.event_name ?? '';
  const attributes = payload?.data?.attributes ?? {};
  const subscriptionId = String(payload?.data?.id ?? '');

  // Lemon Squeezy sends no dedicated event id, so the key is derived from the
  // body itself: a retry of one delivery repeats it byte for byte, and two
  // genuinely different events never do. Keying on updated_at alone would
  // collapse to `name:id:` whenever that field is absent, and the second real
  // event of that kind would then be discarded as a duplicate - leaving an
  // account on the wrong tier with no error anywhere.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawBody));
  const bodyHash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
  const eventId = `${eventName}:${subscriptionId}:${bodyHash}`;

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

  try {
    if (UPGRADE_EVENTS.has(eventName)) {
      const userId: string | undefined = payload?.meta?.custom_data?.user_id;
      if (!userId) {
        // Without this the payment succeeds and nobody is upgraded, silently.
        // Release the ledger claim on the way out: leaving it would make every
        // retry of this delivery return 200 as a "duplicate", hiding a paid-for
        // subscription that was never provisioned behind a single 400.
        await supabase.from('billing_events').delete().eq('event_id', eventId);
        console.error('Checkout completed with no custom_data.user_id', { eventId });
        return new Response('Missing custom_data.user_id', { status: 400 });
      }

      const status: string = attributes.status ?? 'inactive';
      const paid = ACTIVE_STATUSES.has(status);

      const { error } = await supabase
        .from('profiles')
        .update({
          tier: paid ? tierForVariant(attributes.variant_id) : 'free',
          subscription_status: toStatus(status),
          lemon_customer_id: attributes.customer_id ? String(attributes.customer_id) : null,
          lemon_subscription_id: subscriptionId || null,
          current_period_end: attributes.renews_at ?? attributes.ends_at ?? null,
        })
        .eq('id', userId);
      if (error) throw error;
    } else if (DOWNGRADE_EVENTS.has(eventName)) {
      const { error } = await supabase
        .from('profiles')
        .update({
          tier: 'free',
          subscription_status: toStatus(attributes.status ?? 'cancelled'),
          current_period_end: attributes.ends_at ?? null,
        })
        .eq('lemon_subscription_id', subscriptionId);
      if (error) throw error;
    } else if (eventName === 'subscription_payment_failed') {
      const { error } = await supabase
        .from('profiles')
        .update({ subscription_status: 'past_due' })
        .eq('lemon_subscription_id', subscriptionId);
      if (error) throw error;
    }
    // Anything else is acknowledged and ignored.
  } catch (err) {
    // Release the claim so the retry can do real work rather than short-circuit
    // on a ledger row for an update that never landed.
    await supabase.from('billing_events').delete().eq('event_id', eventId);
    console.error('Failed to apply billing event', { eventId, err });
    return new Response('Failed to apply event', { status: 500 });
  }

  return Response.json({ received: true });
});
