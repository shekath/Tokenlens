/**
 * The footer every page shares.
 *
 * It used to live inside the dashboard's <main>, which the router hides when a
 * reference page is open - so the footer, and the links in it, vanished on the
 * two pages that most need a way back. It is a sibling of the pages now, which
 * is also what <footer> means: the footer of the document, not of one section.
 */

import { PRICING_AS_OF } from '../lib/models';
import { NAV, type Route } from '../lib/useHashRoute';
import { useSupportLink } from '../lib/useSupportLink';
import type { Profile } from '../lib/subscription';

export function SiteFooter({
  route,
  onNavigate,
  onPricing,
  profile,
  email,
}: {
  route: Route;
  onNavigate: (route: Route) => void;
  onPricing: () => void;
  /** Null when signed out - the link still works, with less to say. */
  profile: Profile | null;
  email: string | null;
}) {
  // The footer is the only support route for someone who is not signed in and
  // therefore has no profile menu. That is most people with a sign-in problem,
  // which is the one bug report you cannot afford to make hard to send.
  const supportHref = useSupportLink(profile, email);

  return (
    <footer className="footer">
      <div className="footer__inner">
        <span>
          Rates as published on {PRICING_AS_OF}. Verify against the vendor&apos;s pricing page
          before budgeting.
        </span>
        <span>
          Exact counts: OpenAI (<code>o200k_base</code>, <code>cl100k_base</code>). Every other
          vendor is estimated — see the badge on each figure.
        </span>
        <span>Your prompt stays in this browser. Nothing is uploaded.</span>

        <nav className="footer__links" aria-label="Footer">
          {NAV.map((item) => (
            <button
              key={item.route}
              type="button"
              className="linkish"
              aria-current={route === item.route ? 'page' : undefined}
              onClick={() => onNavigate(item.route)}
            >
              {item.label}
            </button>
          ))}
          <button type="button" className="linkish" onClick={onPricing}>
            Plans and pricing
          </button>
          <button
            type="button"
            className="linkish"
            aria-current={route === 'privacy' ? 'page' : undefined}
            onClick={() => onNavigate('privacy')}
          >
            Privacy Policy
          </button>
          {supportHref ? (
            <a className="linkish" href={supportHref}>
              Contact support
            </a>
          ) : null}
        </nav>
      </div>
    </footer>
  );
}
