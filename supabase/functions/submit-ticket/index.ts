/**
 * Record a support request, and tell support about it.
 *
 * One call does both on purpose. A ticket filed with nobody notified is not
 * support - it is a row in a table waiting to be noticed - and two separate
 * client calls could leave exactly that behind when the second one fails.
 *
 * TWO THINGS COME FROM THE DATABASE, NOT FROM THE REQUEST.
 *
 * The tier and the public id are read from the caller's own profile. The
 * browser sends them so the form can show them, but a ticket that says "team"
 * because the sender typed it is worthless for triage - and the whole point of
 * the tag is deciding who gets answered first.
 *
 * The insert runs as the CALLER, using their token, not as the service role.
 * That is what keeps the row-level policies in force: "Own tickets, five a
 * day" is the rate limit, and a service-role insert would sail straight past
 * it. This function has no power the browser does not already have; it exists
 * for the notification and for reading the tier honestly.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

/** Mirrors the CHECK constraints in migration 0010, for a readable message. */
function problem(subject: string, message: string): string | null {
  const s = subject.trim();
  const m = message.trim();
  if (s.length < 3 || s.length > 200) return 'The subject needs to be 3 to 200 characters.';
  if (m.length < 10 || m.length > 5000) return 'The message needs to be 10 to 5,000 characters.';
  return null;
}

/**
 * Sends the notification. Resend's free tier is 3,000 a month, which is more
 * support than this product will see for a long time.
 *
 * Reply-To is the customer, so answering is one keypress and the reply reaches
 * them rather than the robot.
 */
async function notify(opts: {
  ticketId: string;
  subject: string;
  message: string;
  tier: string;
  publicId: string;
  customerEmail: string;
  context: Record<string, unknown>;
}): Promise<void> {
  const key = Deno.env.get('RESEND_API_KEY');
  const to = Deno.env.get('SUPPORT_EMAIL');
  const from = Deno.env.get('SUPPORT_FROM');
  if (!key || !to || !from) {
    throw new Error('RESEND_API_KEY, SUPPORT_EMAIL and SUPPORT_FROM must all be set');
  }

  const context = Object.entries(opts.context)
    .map(([k, v]) => `${k.padEnd(9)} ${String(v)}`)
    .join('\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: opts.customerEmail,
      // The tag is first and bracketed so a mail rule or a helpdesk view can
      // sort the queue on it with no integration at all.
      subject: `[TokenTicks][${opts.tier}] ${opts.subject} (${opts.publicId})`,
      text: [
        opts.message,
        '',
        '—',
        `Account   ${opts.publicId}`,
        `Plan      ${opts.tier}`,
        `Email     ${opts.customerEmail}`,
        `Ticket    ${opts.ticketId}`,
        context,
      ].join('\n'),
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization) return json({ error: 'Not signed in.' }, 401);

  // The caller's own client: every query below is subject to the same policies
  // the browser is, which is what makes the daily cap real.
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  const { data: auth, error: authError } = await asCaller.auth.getUser();
  if (authError || !auth.user) return json({ error: 'Not signed in.' }, 401);
  const user = auth.user;

  let subject = '';
  let message = '';
  let context: Record<string, unknown> = {};
  try {
    const body = (await req.json()) as Record<string, unknown>;
    subject = String(body?.subject ?? '');
    message = String(body?.message ?? '');
    context = (body?.context as Record<string, unknown>) ?? {};
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }

  const bad = problem(subject, message);
  if (bad) return json({ error: bad }, 400);

  // Read, never trust. See the header.
  const { data: profile, error: profileError } = await asCaller
    .from('profiles')
    .select('tier, public_id, email')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    console.error('Could not read the profile behind a ticket', { userId: user.id, profileError });
    return json({ error: 'Your account is still loading. Try again in a moment.' }, 503);
  }

  const { data: ticket, error: insertError } = await asCaller
    .from('support_tickets')
    .insert({
      user_id: user.id,
      subject: subject.trim(),
      message: message.trim(),
      tier: profile.tier,
      public_id: profile.public_id,
      context,
    })
    .select('id, subject, message, status, created_at')
    .single();

  if (insertError || !ticket) {
    // 42501 is insufficient_privilege: the row-level policy refused it, and
    // the only policy that can refuse a well-formed insert here is the cap.
    if ((insertError as { code?: string })?.code === '42501') {
      return json({ rateLimited: true }, 429);
    }
    console.error('Could not record a ticket', { userId: user.id, insertError });
    return json({ error: 'Your request was not recorded. Nothing was sent.' }, 500);
  }

  try {
    await notify({
      ticketId: ticket.id,
      subject: ticket.subject,
      message: ticket.message,
      tier: String(profile.tier),
      publicId: String(profile.public_id),
      customerEmail: String(profile.email ?? user.email ?? ''),
      context,
    });
  } catch (err) {
    // The ticket is recorded and the sender can see it in their own list, so
    // this is not a failure to report to them as one. It IS a failure for
    // support: nobody has been told. Loud in the logs, and flagged in the
    // response so the interface can say "we have it, chase us if it is quiet".
    console.error('Ticket recorded but support was not notified', { ticketId: ticket.id, err });
    return json({ ticket, notified: false });
  }

  console.log('Ticket recorded', { ticketId: ticket.id, tier: profile.tier });
  return json({ ticket, notified: true });
});
