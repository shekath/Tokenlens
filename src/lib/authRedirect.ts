/**
 * What an auth redirect leaves in the URL, and what it means.
 *
 * Its own module so it can be tested without a browser: `auth.ts` pulls in React
 * and the Supabase client, and the client reads import.meta.env at import time.
 */

/** Query parameters an auth redirect brings back, stripped once they are read. */
export const REDIRECT_PARAMS = ['code', 'error', 'error_code', 'error_description', 'state'];

/**
 * Turns what an auth redirect left in the URL into something a user can act on.
 *
 * The silent failure this exists for: the sign-in reaches Google, Google returns
 * to Supabase, Supabase creates the account - and then hands the one-time code
 * to whatever the project's URL configuration allows, which is the Site URL when
 * the app's own URL is not on the list. The account exists, the browser is back,
 * and nothing in the app has any idea. A missing session after a redirect is the
 * only signal there is, so say so rather than rendering a signed-out page as if
 * the user had never tried.
 *
 * Exported for the tests; `session` is unknown because only its presence matters.
 */
export function redirectProblem(params: URLSearchParams, session: unknown): string | null {
  const described = params.get('error_description') ?? params.get('error');
  if (described) return described.replace(/\+/g, ' ');
  if (session) return null;
  if (!params.has('code')) return null;
  return (
    'Sign-in came back without a session. The one-time code could not be exchanged - ' +
    'this normally means this address is not in the Supabase project\'s redirect ' +
    'allow list (Authentication -> URL Configuration), or the sign-in was started ' +
    'in a different browser.'
  );
}
