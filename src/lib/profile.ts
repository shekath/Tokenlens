/**
 * Writing the profile, and managing the password.
 *
 * Kept apart from subscription.ts, which reads the same row for a different
 * reason: that hook mirrors billing state the client cannot write, this one
 * carries the handful of columns it can.
 */

import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { tidy } from './profileFields';

export interface ProfilePatch {
  fullName: string;
  displayName: string;
  phone: string;
  country: string;
}

function client() {
  if (!supabase) throw new Error('Accounts are unavailable: this deployment has no Supabase backend.');
  return supabase;
}

/**
 * Saves the editable columns. Everything else on the row - the tier, the email,
 * the public id - is reverted by a database trigger whatever is sent, so this
 * sends only what it is allowed to change.
 */
export async function saveProfile(userId: string, patch: ProfilePatch): Promise<void> {
  const { error } = await client()
    .from('profiles')
    .update({
      full_name: tidy(patch.fullName),
      display_name: tidy(patch.displayName),
      phone: tidy(patch.phone),
      country: tidy(patch.country),
    })
    .eq('id', userId);
  if (error) throw error;
}

/**
 * Whether this account can already be signed into with a password.
 *
 * An account created through Google has only a Google identity: there is no
 * password to change, and asking for the current one would be unanswerable. The
 * same form therefore sets a first password in that case, which is what makes
 * the account reachable without Google afterwards.
 */
export function hasPassword(user: User | null): boolean {
  return (user?.identities ?? []).some((i) => i.provider === 'email');
}

/**
 * Sets or changes the password.
 *
 * A live session is not on its own proof that the person at the keyboard is the
 * account holder - a borrowed laptop has one. So where a password already
 * exists, it has to be produced before a new one is accepted.
 *
 * `current_password` goes to the server rather than being checked here first.
 * The first version called signInWithPassword to validate it and then called
 * updateUser, which is check-then-act: anyone holding a session could skip
 * straight to updateUser and change the password without knowing the old one,
 * because the gate lived in the browser. It also minted a whole new session as
 * a side effect of validating. Handing the old password to updateUser makes
 * GoTrue do both in one call, and turns "Require current password when
 * changing password" in the project's auth settings into real enforcement
 * rather than a promise this form makes on its own.
 *
 * An account created through Google has no password to produce, so the same
 * form sets a first one - which is what makes the account reachable without
 * Google afterwards.
 */
export async function setPassword(
  user: User,
  currentPassword: string | null,
  nextPassword: string,
): Promise<void> {
  const c = client();
  const existing = hasPassword(user);

  if (existing && !currentPassword) throw new Error('Enter your current password.');

  const { error } = await c.auth.updateUser(
    existing && currentPassword
      ? { password: nextPassword, current_password: currentPassword }
      : { password: nextPassword },
  );

  if (error) {
    // GoTrue words this several ways depending on version; all of them mean
    // the old password did not match, and that is worth saying plainly rather
    // than passing through a message about credentials.
    if (/current password|invalid.*credential|password.*incorrect/i.test(error.message)) {
      throw new Error('That is not your current password.');
    }
    throw error;
  }
}


export interface SubscriptionChange {
  status: string;
  currentPeriodEnd: string | null;
  tier: string | null;
}

/**
 * Cancels or resumes the caller's subscription, at Lemon Squeezy.
 *
 * Deliberately sends no subscription id. The Edge Function reads it from the
 * caller's own profile using the user id inside their verified token, so there
 * is nothing here that could name somebody else's subscription.
 *
 * Cancelling does not end access: Lemon Squeezy's "cancelled" means it will not
 * renew, and the paid period runs to current_period_end.
 */
export async function changeSubscription(action: 'cancel' | 'resume'): Promise<SubscriptionChange> {
  const { data, error } = await client().functions.invoke<
    SubscriptionChange & { error?: string }
  >('manage-subscription', { body: { action } });

  if (error) {
    // functions.invoke reports a non-2xx as a FunctionsHttpError whose message
    // is just the status. The function's own explanation is in the body, and
    // that is the part worth showing someone.
    const detail = await readFunctionError(error);
    throw new Error(detail ?? 'Could not reach the billing service. Try again in a moment.');
  }
  if (!data || data.error) throw new Error(data?.error ?? 'The billing service returned nothing.');
  return data;
}

async function readFunctionError(error: unknown): Promise<string | null> {
  const response = (error as { context?: Response })?.context;
  if (!response || typeof response.json !== 'function') return null;
  try {
    const body = await response.json();
    return typeof body?.error === 'string' ? body.error : null;
  } catch {
    return null;
  }
}

/**
 * A fresh link to Lemon Squeezy's customer portal, where a subscriber can
 * change plan, update their card and read their invoices.
 *
 * Changing plan goes here rather than through a second checkout. Buying again
 * while a subscription is active creates a SECOND subscription: the customer
 * pays twice, and this app - which records one subscription id per profile -
 * silently forgets the first, so cancelling from the account page would leave
 * the other billing with no way to reach it. Lemon Squeezy prorates a switch
 * and keeps it to one subscription.
 *
 * The link is signed and short-lived, so it is fetched at the moment it is
 * needed rather than stored.
 */
export async function billingPortalUrl(): Promise<string> {
  const { data, error } = await client().functions.invoke<{ url?: string; error?: string }>(
    'manage-subscription',
    { body: { action: 'portal' } },
  );

  if (error) {
    const detail = await readFunctionError(error);
    throw new Error(detail ?? 'Could not reach the billing service. Try again in a moment.');
  }
  if (!data?.url) throw new Error(data?.error ?? 'No billing portal link was returned.');
  return data.url;
}
