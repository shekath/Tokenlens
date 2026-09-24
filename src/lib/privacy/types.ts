/**
 * The shape every language of the privacy policy fills in.
 *
 * Sections are keyed, and every language must supply the same keys in the same
 * order (tests/privacy.test.mjs), so a translation can never silently drop a
 * section - including the terms the policy carries mid-document.
 *
 * Strings may contain placeholders the page fills at render time:
 *   {{operator}}  who runs the service           {{email}}    privacy contact
 *   {{grievance}} India grievance officer         {{address}}  postal address
 *   {{effective}} effective date, in the reader's date format
 */

export type SectionId =
  | 'summary'
  | 'who'
  | 'collect'
  | 'notcollect'
  | 'use'
  | 'providers'
  | 'transfers'
  | 'retention'
  | 'security'
  | 'terms'
  | 'rights-india'
  | 'rights-eu'
  | 'rights-us'
  | 'rights-other'
  | 'storage'
  | 'children'
  | 'changes'
  | 'contact';

export const SECTION_ORDER: SectionId[] = [
  'summary',
  'who',
  'collect',
  'notcollect',
  'use',
  'providers',
  'transfers',
  'retention',
  'security',
  'terms',
  'rights-india',
  'rights-eu',
  'rights-us',
  'rights-other',
  'storage',
  'children',
  'changes',
  'contact',
];

/** A paragraph, a bulleted list, or a table. */
export type Block = string | { list: string[] } | { table: { head: string[]; rows: string[][] } };

export interface PolicySection {
  id: SectionId;
  title: string;
  blocks: Block[];
}

export interface PolicyText {
  /** BCP 47 tag, used for lang= and for formatting the date. */
  locale: string;
  /** The language's own name for itself. */
  label: string;
  dir: 'ltr' | 'rtl';
  ui: {
    eyebrow: string;
    title: string;
    lede: string;
    /** "Effective {{effective}}" */
    effective: string;
    language: string;
    onThisPage: string;
    /** Shown on every translation: the English text governs. */
    translationNote: string;
    /** Stands in for {{grievance}} until a named officer is configured. */
    grievanceFallback: string;
    /** Stands in for {{address}} until a postal address is configured. */
    addressFallback: string;
    /** Stands in for {{email}} when no support address is configured. */
    emailFallback: string;
    back: string;
  };
  sections: PolicySection[];
}
