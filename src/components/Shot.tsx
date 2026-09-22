import { useTheme } from '../lib/useTheme';

/**
 * A screenshot of the app, in the theme the reader is actually using.
 *
 * Two files per shot rather than one. A docs page that shows a dark interface
 * to someone reading in light - or the reverse - looks like documentation for
 * a different product, and this app has a theme switch people use.
 *
 * Loaded lazily and given explicit dimensions, so the page does not reflow
 * around them as they arrive and nothing downloads until it is scrolled near.
 */
export function Shot({ name, alt }: { name: string; alt: string }) {
  const [theme] = useTheme();
  const dark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  const src = `${import.meta.env.BASE_URL}docs/${name}-${dark ? 'dark' : 'light'}.png`;

  return (
    <figure className="shot">
      <img src={src} alt={alt} loading="lazy" decoding="async" width={1200} height={760} />
    </figure>
  );
}
