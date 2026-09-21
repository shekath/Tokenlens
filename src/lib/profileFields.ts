/**
 * Profile field rules.
 *
 * These mirror the check constraints in migrations/0003_profile_details.sql.
 * The constraint is the rule - RLS lets the client write these columns straight
 * to Postgres, so a form that only pretended to validate would simply turn a
 * clear message into a raw constraint-violation error. Its job is to say what
 * is wrong before the round trip, in the same terms the column will.
 *
 * No React or browser API here, so the rules can be tested against the SQL.
 */

export const MAX_FULL_NAME = 80;
export const MAX_DISPLAY_NAME = 40;

/** Mirrors profiles_phone_shape. */
export const PHONE_SHAPE = /^\+?[0-9][0-9 ()./-]{5,24}$/;
/** Mirrors profiles_country_shape. */
export const COUNTRY_SHAPE = /^[A-Z]{2}$/;
/** Mirrors profiles_public_id_shape. */
export const PUBLIC_ID_SHAPE = /^TT-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/;

/** Trims and collapses runs of whitespace; empty becomes null, not ''. */
export function tidy(value: string): string | null {
  const t = value.trim().replace(/\s+/g, ' ');
  return t === '' ? null : t;
}

export function fullNameProblem(value: string): string | null {
  const v = tidy(value);
  if (v === null) return null; // Optional: an account is identified by its email.
  if (v.length > MAX_FULL_NAME) return `Keep it to ${MAX_FULL_NAME} characters.`;
  return null;
}

export function displayNameProblem(value: string): string | null {
  const v = tidy(value);
  if (v === null) return null;
  if (v.length > MAX_DISPLAY_NAME) return `Keep it to ${MAX_DISPLAY_NAME} characters.`;
  return null;
}

export function phoneProblem(value: string): string | null {
  const v = tidy(value);
  if (v === null) return null;
  if (!PHONE_SHAPE.test(v)) {
    return 'Digits, spaces and ( ) . / - only, starting with a digit or +. Six digits at least.';
  }
  return null;
}

export function countryProblem(value: string): string | null {
  const v = tidy(value);
  if (v === null) return null;
  if (!COUNTRY_SHAPE.test(v)) return 'Pick a country from the list.';
  return null;
}

/**
 * What to call the user, in the order a person would expect: the name they
 * chose, then the name they gave, then the part of the address before the @.
 * Never the uuid, and never an empty string.
 */
export function greetingName(p: {
  displayName?: string | null;
  fullName?: string | null;
  email?: string | null;
}): string {
  return (
    tidy(p.displayName ?? '') ??
    tidy((p.fullName ?? '').split(' ')[0] ?? '') ??
    tidy((p.email ?? '').split('@')[0] ?? '') ??
    'Account'
  );
}

/**
 * One or two letters for the avatar. Built from code points rather than
 * `charAt`, so a name that begins with an emoji or an astral-plane character
 * yields that character instead of half of it.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = [...(words[0] ?? '')][0] ?? '?';
  const second = words.length > 1 ? ([...(words.at(-1) ?? '')][0] ?? '') : '';
  return (first + second).toUpperCase();
}
