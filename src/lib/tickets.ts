/**
 * Raising a support request from inside the app.
 *
 * The limits here mirror the CHECK constraints in migration 0010, and that
 * duplication is deliberate: the database is the authority, and a form that
 * lets someone write 6,000 characters only to have Postgres reject it has
 * wasted their message. The tests pin both to the same numbers.
 */

import { supabase } from './supabase';
import { rateLimitMessage } from './ticketRules';
import type { Tier } from './entitlements';

export * from './ticketRules';

export interface Ticket {
  id: string;
  subject: string;
  message: string;
  status: 'open' | 'answered' | 'closed';
  createdAt: string;
}


function client() {
  if (!supabase) throw new Error('Support requests need a backend; this deployment has none.');
  return supabase;
}

export interface TicketDraft {
  subject: string;
  message: string;
  tier: Tier;
  publicId: string;
  context: Record<string, string>;
}

/**
 * Submits a ticket and asks the Edge Function to notify support.
 *
 * The insert goes through the function rather than straight from the browser
 * so that one call both records the request and sends the email: a row nobody
 * is told about is not support, and two client calls could leave a ticket
 * filed with nobody notified.
 *
 * The function inserts as the caller, so the row-level policies - including
 * the daily cap - still apply. It has no power the browser does not.
 */
export interface TicketResult {
  ticket: Ticket;
  /**
   * False when the row was recorded but the notification email failed. The
   * request is not lost - it is in the sender's own list - but nobody has been
   * told about it, and saying "sent" would be a promise we have not kept.
   */
  notified: boolean;
}

export async function submitTicket(draft: TicketDraft): Promise<TicketResult> {
  const { data, error } = await client().functions.invoke<{
    ticket?: Ticket;
    notified?: boolean;
    error?: string;
    rateLimited?: boolean;
  }>('submit-ticket', { body: draft });

  if (error) {
    const detail = await readInvokeError(error);
    throw new Error(detail ?? 'Could not send your request. Try again in a moment.');
  }
  if (data?.rateLimited) throw new Error(rateLimitMessage());
  if (!data?.ticket) throw new Error(data?.error ?? 'Your request was not recorded.');
  return { ticket: data.ticket, notified: data.notified !== false };
}

/** The caller's own tickets, newest first. RLS limits this to their own. */
export async function listTickets(): Promise<Ticket[]> {
  const { data, error } = await client()
    .from('support_tickets')
    .select('id, subject, message, status, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    subject: row.subject as string,
    message: row.message as string,
    status: row.status as Ticket['status'],
    createdAt: row.created_at as string,
  }));
}

async function readInvokeError(error: unknown): Promise<string | null> {
  const response = (error as { context?: Response })?.context;
  if (!response || typeof response.json !== 'function') return null;
  try {
    const body = await response.json();
    return typeof body?.error === 'string' ? body.error : null;
  } catch {
    return null;
  }
}
