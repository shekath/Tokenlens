/**
 * The facts the legal pages need that are not ours to invent.
 *
 * Fill in `grievanceOfficer` and `postalAddress` before relying on the privacy
 * policy: India's DPDP Rules expect a named contact for grievances, and many
 * laws expect a postal address. Until they are set the page shows a neutral
 * fallback ("available on request") rather than a placeholder.
 *
 * `effectiveDate` is ISO (YYYY-MM-DD) and is shown in each reader's own date
 * format. Change it whenever the policy text changes.
 */
export const LEGAL = {
  operator: 'TokenTicks',
  grievanceOfficer: null as string | null,
  postalAddress: null as string | null,
  effectiveDate: '2026-09-24',
} as const;
