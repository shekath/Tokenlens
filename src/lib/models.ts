/**
 * Model registry: context windows, per-million-token pricing and tokenizer family.
 *
 * Anthropic rates are first-party Claude API rates. Every other vendor's rates are
 * that vendor's published list price for direct API access; open-weight models
 * (Llama, Qwen) have no single list price, so they carry a representative
 * serverless-host rate and are flagged `hostedRate`.
 *
 * Prices move. PRICING_AS_OF is surfaced in the UI and every rate can be
 * overridden by the user at runtime (see lib/overrides.ts).
 */

import { MODEL_DATA, PRICING_AS_OF } from './models.data.ts';

export { PRICING_AS_OF };

/** Which BPE we run, and whether the result is exact for this model. */
export type TokenizerFamily =
  | 'o200k' // exact - OpenAI GPT-4o / 4.1 / 5 / o-series
  | 'cl100k' // exact - OpenAI GPT-4 / 3.5-turbo
  | 'claude'
  | 'gemini'
  | 'llama'
  | 'mistral'
  | 'deepseek'
  | 'grok'
  | 'cohere'
  | 'qwen';

export type Vendor =
  | 'Anthropic'
  | 'OpenAI'
  | 'Google'
  | 'Meta'
  | 'Mistral'
  | 'DeepSeek'
  | 'xAI'
  | 'Cohere'
  | 'Alibaba';

export interface Model {
  /** Stable key used in URLs and localStorage. */
  id: string;
  /** API model string a developer would actually send. */
  apiId: string;
  label: string;
  vendor: Vendor;
  tokenizer: TokenizerFamily;
  /** Maximum input tokens (the context window). */
  context: number;
  /** Maximum output tokens per response, when the vendor caps it separately. */
  maxOutput?: number;
  /** USD per 1M input tokens. */
  inputPerM: number;
  /** USD per 1M output tokens. */
  outputPerM: number;
  /**
   * USD per 1M tokens read back from the prompt cache. Where a vendor publishes
   * a multiplier rather than a rate we store the resolved rate.
   */
  cacheReadPerM?: number;
  /** USD per 1M tokens written to the prompt cache (5-minute TTL where TTLs differ). */
  cacheWritePerM?: number;
  /** Fraction off the whole request for async/batch processing, e.g. 0.5 = 50% off. */
  batchDiscount?: number;
  /** True when the rate is a third-party host's, not a first-party list price. */
  hostedRate?: boolean;
  note?: string;
}

// The rows live in models.data.ts, which the daily price sync rewrites
// (scripts/sync-models.mjs). Everything that interprets them stays here.
export const MODELS: Model[] = MODEL_DATA;

export const MODELS_BY_ID: Record<string, Model> = Object.fromEntries(
  MODELS.map((m) => [m.id, m]),
);

export const VENDORS: Vendor[] = [
  'Anthropic',
  'OpenAI',
  'Google',
  'xAI',
  'DeepSeek',
  'Mistral',
  'Meta',
  'Cohere',
  'Alibaba',
];

export const DEFAULT_MODEL_ID = 'claude-opus-5';

/** The set shown in the comparison chart before the user narrows it. */
export const DEFAULT_COMPARE_IDS = [
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-haiku-4-5',
  'gpt-5',
  'gpt-4-1',
  'gemini-2-5-pro',
  'gemini-2-5-flash',
  'grok-4',
  'deepseek-v3',
  'llama-4-maverick',
];
