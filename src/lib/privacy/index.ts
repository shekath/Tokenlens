/**
 * The privacy policy in every language we publish, and the helpers the page
 * uses to choose one and fill it in. Pure, so tests/privacy.test.mjs can check
 * every translation against the English text.
 */

import { ar } from './ar.ts';
import { de } from './de.ts';
import { en } from './en.ts';
import { es } from './es.ts';
import { fr } from './fr.ts';
import { hi } from './hi.ts';
import { ja } from './ja.ts';
import { pt } from './pt.ts';
import type { PolicyText } from './types.ts';

export type { Block, PolicySection, PolicyText, SectionId } from './types.ts';
export { SECTION_ORDER } from './types.ts';

/** In the order the language picker lists them; English first, as it governs. */
export const POLICIES: Record<string, PolicyText> = { en, hi, es, fr, de, pt, ja, ar };

export type PolicyLang = keyof typeof POLICIES;

export const DEFAULT_LANG = 'en';

export const LANG_STORAGE_KEY = 'tokenticks.privacyLang';

/** "pt-BR" -> "pt"; unknown -> null. */
export function langFromTag(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const base = tag.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return base in POLICIES ? base : null;
}

/**
 * Which language to show: an explicit ?lang= in the link, then the reader's
 * last choice, then their browser's preferences, then English.
 */
export function pickLang(opts: { query?: string | null; stored?: string | null; browser?: readonly string[] }): string {
  return (
    langFromTag(opts.query) ??
    langFromTag(opts.stored) ??
    (opts.browser ?? []).map(langFromTag).find((l): l is string => l !== null) ??
    DEFAULT_LANG
  );
}

/** Replaces {{name}} with values[name]; an unknown name is left visible. */
export function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (whole, name: string) => values[name] ?? whole);
}

/** Placeholders a string uses, e.g. ["email", "operator"]. */
export function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!).sort();
}

/** An ISO date in the reader's own format: "24 September 2026", "2026年9月24日". */
export function formatEffective(iso: string, locale: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(date);
  } catch {
    return iso;
  }
}

/**
 * "Refunds. Plan payments are…" -> ["Refunds.", "Plan payments are…"]. The
 * terms items each open with a short heading ended by the language's full stop
 * (".", "。", "।"), which the page sets in bold. Null when there is none.
 */
export function splitLead(item: string): [string, string] | null {
  const m = /^([^.。।]{2,60}[.。।])\s*([\s\S]+)$/u.exec(item);
  return m ? [m[1]!, m[2]!] : null;
}
