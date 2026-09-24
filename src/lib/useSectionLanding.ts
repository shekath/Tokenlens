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

/**
 * Scrolls a section to just below the sticky top bar. The bar is 57px tall on
 * a desktop but wraps to about 175px on a phone, so a fixed CSS scroll margin
 * left headings hidden underneath it there; measure it instead.
 */
export function scrollToSection(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  const bar = document.querySelector('.topbar');
  const covered = bar && getComputedStyle(bar).position === 'sticky' ? bar.getBoundingClientRect().height : 0;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - covered - 16, behavior: 'smooth' });
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
