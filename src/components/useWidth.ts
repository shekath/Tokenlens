import { useLayoutEffect, useRef, useState } from 'react';

/**
 * The measured content width of an element.
 *
 * Charts here are drawn at true pixel size rather than in an abstract viewBox
 * scaled to fit: a non-uniform scale squashes every glyph horizontally and makes
 * label-fit arithmetic meaningless, which is how bars end up running off the edge
 * of their card. Measuring first costs one extra render and makes the geometry exact.
 */
export function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.round(w));
    });
    ro.observe(el);
    setWidth(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  return [ref, width || fallback] as const;
}
