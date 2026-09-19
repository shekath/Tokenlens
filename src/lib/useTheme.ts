import { useCallback, useEffect, useState } from 'react';

export type Theme = 'system' | 'light' | 'dark';

const KEY = 'tokenlens.theme';

/**
 * Theme choice. `system` removes the stamp so the OS media query governs; an
 * explicit choice stamps [data-theme] on <html>, which the token CSS lets win
 * over the media query in both directions.
 */
export function useTheme(): [Theme, (t: Theme) => void, 'light' | 'dark'] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const v = localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : 'system';
    } catch {
      return 'system';
    }
  });

  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    try {
      if (theme === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, theme);
    } catch {
      /* storage can be unavailable in private windows - the stamp still applies */
    }
  }, [theme]);

  const set = useCallback((t: Theme) => setTheme(t), []);
  const resolved: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  return [theme, set, resolved];
}

/** Persisted JSON state, with a shape guard so an old key can never crash boot. */
export function usePersisted<T>(key: string, initial: T, revive?: (v: unknown) => T | null) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return initial;
      const parsed: unknown = JSON.parse(raw);
      if (revive) {
        const ok = revive(parsed);
        return ok === null ? initial : ok;
      }
      return parsed as T;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* non-fatal: the session still works, it just will not be remembered */
    }
  }, [key, value]);

  return [value, setValue] as const;
}
