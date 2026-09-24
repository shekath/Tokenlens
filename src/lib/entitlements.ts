/**
 * The entitlements matrix - the single source of truth for what each tier can do.
 *
 * Every gate in the UI reads from here rather than testing `tier === 'pro'` inline,
 * so a pricing change is one edit and the paywall can never drift from the pricing
 * page. Server-side limits (saved-estimate caps) are mirrored in the Postgres RLS
 * policies; this file is the client's copy, and the database is the authority.
 */

import { MODELS } from './models.ts';

export type Tier = 'free' | 'pro' | 'team';

/**
 * "70+", from the registry - the daily model sync adds rows, so a count typed
 * into the pricing copy would be wrong the day after a launch. Rounded down to
 * a ten so the claim stays true between syncs.
 */
const MODEL_COUNT = `${Math.floor(MODELS.length / 10) * 10}+`;

export type SubscriptionStatus =
  | 'inactive'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'trialing';

/** Features a gate can be attached to. Keep in sync with the pricing table below. */
export type Feature =
  | 'allModels'
  | 'customRateCards'
  | 'cacheSimulator'
  | 'cacheLifecycle'
  | 'batchForecast'
  | 'trimmer'
  | 'trimmerRules'
  | 'pdfProposal'
  | 'csvExport'
  | 'shareLinks'
  | 'whiteLabel'
  /** Volatile-content ordering linter, in the app and in the CLI / MCP server. */
  | 'cacheLinter'
  /** Provider usage export set against saved estimates. */
  | 'usageReconcile'
  /** `tokenticks diff`: the monthly cost delta of a change, for a pull request. */
  | 'ciCostDiff';

export interface Entitlements {
  tier: Tier;
  /** Model ids a free user may price. Empty means every model is available. */
  modelAllowlist: string[] | null;
  /** Saved estimates allowed. Mirrored by an RLS policy in the database. */
  maxSavedEstimates: number;
  /** Rows accepted per batch run. */
  maxBatchRows: number;
  features: Record<Feature, boolean>;
}

/**
 * The five models a free account can price: the OpenAI and Anthropic defaults most
 * people arrive looking for. The token counter itself is never gated - anyone can
 * paste a prompt and get a count without an account.
 */
export const FREE_MODEL_IDS = [
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-haiku-4-5',
  'gpt-5',
  'gpt-4-1',
];

const NONE: Record<Feature, boolean> = {
  allModels: false,
  customRateCards: false,
  cacheSimulator: false,
  cacheLifecycle: false,
  batchForecast: false,
  trimmer: false,
  trimmerRules: false,
  pdfProposal: false,
  csvExport: false,
  shareLinks: false,
  whiteLabel: false,
  cacheLinter: false,
  usageReconcile: false,
  ciCostDiff: false,
};

export const ENTITLEMENTS: Record<Tier, Entitlements> = {
  free: {
    tier: 'free',
    modelAllowlist: FREE_MODEL_IDS,
    maxSavedEstimates: 3,
    maxBatchRows: 0,
    features: { ...NONE },
  },
  pro: {
    tier: 'pro',
    modelAllowlist: null,
    maxSavedEstimates: Number.POSITIVE_INFINITY,
    maxBatchRows: 10_000,
    features: {
      ...NONE,
      allModels: true,
      cacheSimulator: true,
      batchForecast: true,
      trimmer: true,
      cacheLinter: true,
      pdfProposal: true,
      csvExport: true,
    },
  },
  team: {
    tier: 'team',
    modelAllowlist: null,
    maxSavedEstimates: Number.POSITIVE_INFINITY,
    maxBatchRows: Number.POSITIVE_INFINITY,
    features: {
      allModels: true,
      customRateCards: true,
      cacheSimulator: true,
      cacheLifecycle: true,
      batchForecast: true,
      trimmer: true,
      trimmerRules: true,
      pdfProposal: true,
      csvExport: true,
      shareLinks: true,
      whiteLabel: true,
      cacheLinter: true,
      usageReconcile: true,
      ciCostDiff: true,
    },
  },
};

export function entitlementsFor(tier: Tier | null | undefined): Entitlements {
  return ENTITLEMENTS[tier ?? 'free'];
}

/** The lowest tier that unlocks a feature - drives "Upgrade to X" copy. */
export function requiredTier(feature: Feature): Tier {
  if (ENTITLEMENTS.pro.features[feature]) return 'pro';
  return 'team';
}

/* --------------------------------------------------------------- pricing -- */

export interface Plan {
  tier: Tier;
  name: string;
  audience: string;
  monthly: number;
  annual: number | null;
  /** Lemon Squeezy variant ids, read from the environment at runtime. */
  variantEnv: { monthly: string; annual?: string };
  highlights: string[];
}

export const PLANS: Plan[] = [
  {
    tier: 'free',
    name: 'Hobby',
    audience: 'Students and casual experimenters',
    monthly: 0,
    annual: 0,
    variantEnv: { monthly: '' },
    highlights: [
      'Unlimited token counting, no account needed',
      'Five foundational OpenAI and Anthropic models',
      'Baseline uncached cost estimates',
      'Character, word and composition metrics',
      'Up to 3 saved estimates',
    ],
  },
  {
    tier: 'pro',
    name: 'Pro',
    audience: 'Indie hackers, prompt engineers, freelancers',
    monthly: 12,
    annual: 99,
    variantEnv: {
      monthly: 'VITE_LEMON_VARIANT_PRO_MONTHLY',
      annual: 'VITE_LEMON_VARIANT_PRO_ANNUAL',
    },
    highlights: [
      `All ${MODEL_COUNT} commercial models, updated daily`,
      'Cache break-even and ROI simulator',
      'Token Trimmer and cache-order linter',
      'Trimmer and cache checks in CI and your editor (CLI + MCP)',
      'Batch CSV / JSONL forecasting, up to 10,000 rows',
      'Branded PDF cost proposals and CSV export',
      'Unlimited saved estimates',
    ],
  },
  {
    tier: 'team',
    name: 'Team',
    audience: 'Dev shops, SaaS startups, AI consultancies',
    monthly: 39,
    annual: null,
    variantEnv: { monthly: 'VITE_LEMON_VARIANT_TEAM_MONTHLY' },
    highlights: [
      'Everything in Pro',
      'Custom and fine-tuned model rate cards',
      'Cache TTL lifecycle and multi-turn agent modelling',
      'Unlimited batch processing',
      'Team-wide linting rules and pull-request cost diffs',
      'Spend reconciliation against real usage exports',
      'White-label proposals and shareable links',
    ],
  },
];

/**
 * What we advertise this tier at, for the gap before an invoice exists.
 *
 * "Amount: Not recorded" is accurate - no invoice has arrived - but in an
 * account page it reads as a broken field rather than as a fact, and a
 * customer who is being billed sees nothing about what they pay.
 *
 * This is emphatically NOT the charged amount, and must never be labelled as
 * one. A coupon, a currency other than the store's, a proration or tax all
 * move the real figure, which is why the webhook records what Lemon Squeezy
 * actually took rather than what we list. The interval is not guessed either:
 * when a tier sells at two prices, both are shown, because "next renewal:
 * $12/month" would be a specific and possibly wrong claim about a customer who
 * holds the annual price.
 */
export function listPrice(tier: Tier): string | null {
  const plan = PLANS.find((p) => p.tier === tier);
  if (!plan || plan.monthly === 0) return null;
  const monthly = `$${plan.monthly}/month`;
  return plan.annual === null ? monthly : `${monthly} or $${plan.annual}/year`;
}

/** Rows for the comparison table on the pricing page. */
export const COMPARISON: Array<{ label: string; free: string; pro: string; team: string }> = [
  {
    label: 'Model coverage',
    free: 'Top 5 foundational models',
    pro: `All ${MODEL_COUNT} commercial models`,
    team: 'All models plus custom rate cards',
  },
  {
    label: 'Prompt caching maths',
    free: 'Baseline uncached only',
    pro: 'Break-even and ROI simulator',
    team: 'TTL lifecycle and multi-turn agents',
  },
  {
    label: 'Batch ingestion',
    free: 'Single prompt paste',
    pro: 'CSV / JSONL, up to 10,000 rows',
    team: 'Unlimited batch processing',
  },
  {
    label: 'Prompt optimisation',
    free: 'Character and word counts',
    pro: 'Token Trimmer linter with savings',
    team: 'Team-wide standards and rules',
  },
  {
    label: 'Exports and reporting',
    free: 'Copy as Markdown',
    pro: 'Branded PDF proposal and CSV',
    team: 'White-label portal and share links',
  },
  {
    label: 'Developer tools (CLI + MCP)',
    free: 'Token counts and costs, 5 models',
    pro: 'Plus Trimmer and cache-order checks',
    team: 'Plus team rule config and PR cost diffs',
  },
  {
    label: 'Spend tracking',
    free: 'Estimates only',
    pro: 'Estimates only',
    team: 'Reconcile estimates against usage exports',
  },
  {
    label: 'Saved estimates',
    free: '3',
    pro: 'Unlimited',
    team: 'Unlimited',
  },
];
