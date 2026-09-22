/**
 * Which page the URL is asking for.
 *
 * The hash, not the path: this deploys to GitHub Pages, which serves static
 * files and cannot rewrite /docs onto index.html. A path-based route would
 * 404 on a reload or a shared link - the two things a documentation page most
 * needs to survive.
 *
 * It does not interfere with auth. Supabase's PKCE flow returns its code in
 * the query string, which lib/authRedirect.ts reads and strips; nothing in
 * either path touches the other.
 */

import { useEffect, useState } from 'react';

export type Route = 'app' | 'docs' | 'faq';

const ROUTES: Route[] = ['app', 'docs', 'faq'];

export function routeFromHash(hash: string): Route {
  const name = hash.replace(/^#\/?/, '').split(/[?&]/)[0]?.toLowerCase() ?? '';
  return (ROUTES as string[]).includes(name) && name !== 'app' ? (name as Route) : 'app';
}

export function hashFor(route: Route): string {
  return route === 'app' ? '#/' : `#/${route}`;
}

export function useHashRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash));

  useEffect(() => {
    const read = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  const go = (next: Route) => {
    window.location.hash = hashFor(next);
    // Landing halfway down a page you have just opened is disorienting, and
    // the browser keeps the old scroll position on a hash change like this.
    window.scrollTo({ top: 0 });
  };

  return [route, go];
}
