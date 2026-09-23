/**
 * The support link, assembled from whatever the app currently knows.
 *
 * Shared by the profile menu and the footer so the two cannot drift into
 * sending different things - the footer is the route for people who are not
 * signed in, and it would be easy for it to quietly lose the context block.
 *
 * Returns null when no support address was built in. Callers hide their
 * control on null rather than rendering a link to nowhere.
 */

import { browserContext, supportMailto } from './support';
import type { Profile } from './subscription';

const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL as string | undefined;

export function useSupportLink(
  profile: Profile | null,
  email: string | null,
  topic = 'Support request',
): string | null {
  // Read at render rather than memoised: the viewport is part of the context,
  // and a bug report from a phone that says 1440x900 because the value was
  // captured on first paint is worse than no viewport at all.
  return supportMailto(
    {
      accountId: profile?.publicId ?? null,
      tier: profile?.tier ?? null,
      status: profile?.status ?? null,
      email: email ?? null,
      build: typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'unknown',
      ...browserContext(),
    },
    topic,
    SUPPORT_EMAIL,
  );
}
