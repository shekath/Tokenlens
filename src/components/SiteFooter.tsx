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

export function SiteFooter({
  route,
  onNavigate,
  onPricing,
}: {
  route: Route;
  onNavigate: (route: Route) => void;
  onPricing: () => void;
}) {
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
        </nav>
      </div>
    </footer>
  );
}
