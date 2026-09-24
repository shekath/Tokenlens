/**
 * Landing on a section of a long page from a link: "#/docs?s=cache" scrolls
 * to the element with id `${prefix}cache`. The router ignores everything after
 * "?", so the page still matches; this reads the rest.
 */

import { useEffect } from 'react';

export function sectionFromHash(hash: string): string | null {
  const q = hash.split('?')[1];
  return q ? new URLSearchParams(q).get('s') : null;
}

export function scrollToSection(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function useSectionLanding(prefix: string): void {
  useEffect(() => {
    const land = () => {
      const s = sectionFromHash(window.location.hash);
      // A frame's grace so the lazily loaded page has laid out before we measure.
      if (s) window.requestAnimationFrame(() => scrollToSection(`${prefix}${s}`));
    };
    land();
    window.addEventListener('hashchange', land);
    return () => window.removeEventListener('hashchange', land);
  }, [prefix]);
}
