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
 * exists, it has to be produced before a new one is accepted; signInWithPassword
 * is the check, against the account's own email. Where none exists yet there is
 * nothing to produce, and the session is all there is.
 */
export async function setPassword(
  user: User,
  currentPassword: string | null,
  nextPassword: string,
): Promise<void> {
  const c = client();
  if (hasPassword(user)) {
    if (!currentPassword) throw new Error('Enter your current password.');
    const email = user.email;
    if (!email) throw new Error('This account has no email address to verify against.');
    const { error: checkError } = await c.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (checkError) throw new Error('That is not your current password.');
  }

  const { error } = await c.auth.updateUser({ password: nextPassword });
  if (error) throw error;
}
