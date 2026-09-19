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

export const PRICING_AS_OF = '2026-06-24';

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

// Anthropic's published cache multipliers: write 1.25x input (5-minute TTL),
// read 0.1x input. Claude Fable 5.1 reads at a flat $0.25/MTok instead.
const anthropic = (
  m: Omit<Model, 'vendor' | 'tokenizer' | 'cacheReadPerM' | 'cacheWritePerM' | 'batchDiscount'> & {
    cacheReadPerM?: number;
  },
): Model => ({
  vendor: 'Anthropic',
  tokenizer: 'claude',
  cacheReadPerM: m.cacheReadPerM ?? m.inputPerM * 0.1,
  cacheWritePerM: m.inputPerM * 1.25,
  batchDiscount: 0.5,
  ...m,
});

export const MODELS: Model[] = [
  // ---------------------------------------------------------------- Anthropic
  anthropic({
    id: 'claude-fable-5-1',
    apiId: 'claude-fable-5-1',
    label: 'Claude Fable 5.1',
    context: 1_000_000,
    maxOutput: 128_000,
    inputPerM: 10,
    outputPerM: 50,
    cacheReadPerM: 0.25,
    note: 'Cache reads are a flat $0.25/MTok (0.025x input) rather than the usual 0.1x.',
  }),
  anthropic({
    id: 'claude-fable-5',
    apiId: 'claude-fable-5',
    label: 'Claude Fable 5',
    context: 1_000_000,
    maxOutput: 128_000,
    inputPerM: 10,
    outputPerM: 50,
  }),
  anthropic({
    id: 'claude-opus-5',
    apiId: 'claude-opus-5',
    label: 'Claude Opus 5',
    context: 1_000_000,
    maxOutput: 128_000,
    inputPerM: 5,
    outputPerM: 25,
  }),
  anthropic({
    id: 'claude-opus-4-8',
    apiId: 'claude-opus-4-8',
    label: 'Claude Opus 4.8',
    context: 1_000_000,
    maxOutput: 128_000,
    inputPerM: 5,
    outputPerM: 25,
  }),
  anthropic({
    id: 'claude-opus-4-7',
    apiId: 'claude-opus-4-7',
    label: 'Claude Opus 4.7',
    context: 1_000_000,
    maxOutput: 128_000,
    inputPerM: 5,
    outputPerM: 25,
  }),
  anthropic({
    id: 'claude-sonnet-5',
    apiId: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    context: 1_000_000,
    maxOutput: 128_000,
    inputPerM: 2,
    outputPerM: 10,
  }),
  anthropic({
    id: 'claude-sonnet-4-6',
    apiId: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    context: 1_000_000,
    maxOutput: 128_000,
    inputPerM: 3,
    outputPerM: 15,
  }),
  anthropic({
    id: 'claude-haiku-4-5',
    apiId: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    context: 200_000,
    maxOutput: 64_000,
    inputPerM: 1,
    outputPerM: 5,
  }),

  // ------------------------------------------------------------------- OpenAI
  {
    id: 'gpt-5',
    apiId: 'gpt-5',
    label: 'GPT-5',
    vendor: 'OpenAI',
    tokenizer: 'o200k',
    context: 400_000,
    maxOutput: 128_000,
    inputPerM: 1.25,
    outputPerM: 10,
    cacheReadPerM: 0.125,
    batchDiscount: 0.5,
  },
  {
    id: 'gpt-5-mini',
    apiId: 'gpt-5-mini',
    label: 'GPT-5 mini',
    vendor: 'OpenAI',
    tokenizer: 'o200k',
    context: 400_000,
    maxOutput: 128_000,
    inputPerM: 0.25,
    outputPerM: 2,
    cacheReadPerM: 0.025,
    batchDiscount: 0.5,
  },
  {
    id: 'gpt-5-nano',
    apiId: 'gpt-5-nano',
    label: 'GPT-5 nano',
    vendor: 'OpenAI',
    tokenizer: 'o200k',
    context: 400_000,
    maxOutput: 128_000,
    inputPerM: 0.05,
    outputPerM: 0.4,
    cacheReadPerM: 0.005,
    batchDiscount: 0.5,
  },
  {
    id: 'gpt-4-1',
    apiId: 'gpt-4.1',
    label: 'GPT-4.1',
    vendor: 'OpenAI',
    tokenizer: 'o200k',
    context: 1_047_576,
    maxOutput: 32_768,
    inputPerM: 2,
    outputPerM: 8,
    cacheReadPerM: 0.5,
    batchDiscount: 0.5,
  },
  {
    id: 'gpt-4-1-mini',
    apiId: 'gpt-4.1-mini',
    label: 'GPT-4.1 mini',
    vendor: 'OpenAI',
    tokenizer: 'o200k',
    context: 1_047_576,
    maxOutput: 32_768,
    inputPerM: 0.4,
    outputPerM: 1.6,
    cacheReadPerM: 0.1,
    batchDiscount: 0.5,
  },
  {
    id: 'gpt-4-1-nano',
    apiId: 'gpt-4.1-nano',
    label: 'GPT-4.1 nano',
    vendor: 'OpenAI',
    tokenizer: 'o200k',
    context: 1_047_576,
    maxOutput: 32_768,
    inputPerM: 0.1,
    outputPerM: 0.4,
    cacheReadPerM: 0.025,
    batchDiscount: 0.5,
  },
  {
    id: 'o3',
    apiId: 'o3',
    label: 'o3',
    vendor: 'OpenAI',
    tokenizer: 'o200k',
    context: 200_000,
    maxOutput: 100_000,
    inputPerM: 2,
    outputPerM: 8,
    cacheReadPerM: 0.5,
    batchDiscount: 0.5,
  },
  {
    id: 'o4-mini',
    apiId: 'o4-mini',
    label: 'o4-mini',
    vendor: 'OpenAI',
    tokenizer: 'o200k',
    context: 200_000,
    maxOutput: 100_000,
    inputPerM: 1.1,
    outputPerM: 4.4,
    cacheReadPerM: 0.275,
    batchDiscount: 0.5,
  },
  {
    id: 'gpt-4o',
    apiId: 'gpt-4o',
    label: 'GPT-4o',
    vendor: 'OpenAI',
    tokenizer: 'o200k',
    context: 128_000,
    maxOutput: 16_384,
    inputPerM: 2.5,
    outputPerM: 10,
    cacheReadPerM: 1.25,
    batchDiscount: 0.5,
  },
  {
    id: 'gpt-4o-mini',
    apiId: 'gpt-4o-mini',
    label: 'GPT-4o mini',
    vendor: 'OpenAI',
    tokenizer: 'o200k',
    context: 128_000,
    maxOutput: 16_384,
    inputPerM: 0.15,
    outputPerM: 0.6,
    cacheReadPerM: 0.075,
    batchDiscount: 0.5,
  },
  {
    id: 'gpt-4-turbo',
    apiId: 'gpt-4-turbo',
    label: 'GPT-4 Turbo',
    vendor: 'OpenAI',
    tokenizer: 'cl100k',
    context: 128_000,
    maxOutput: 4_096,
    inputPerM: 10,
    outputPerM: 30,
    batchDiscount: 0.5,
    note: 'Uses the older cl100k_base encoding, so the same text costs more tokens here.',
  },
  {
    id: 'gpt-3-5-turbo',
    apiId: 'gpt-3.5-turbo',
    label: 'GPT-3.5 Turbo',
    vendor: 'OpenAI',
    tokenizer: 'cl100k',
    context: 16_385,
    maxOutput: 4_096,
    inputPerM: 0.5,
    outputPerM: 1.5,
    batchDiscount: 0.5,
  },

  // ------------------------------------------------------------------- Google
  {
    id: 'gemini-2-5-pro',
    apiId: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    vendor: 'Google',
    tokenizer: 'gemini',
    context: 1_048_576,
    maxOutput: 65_536,
    inputPerM: 1.25,
    outputPerM: 10,
    cacheReadPerM: 0.31,
    batchDiscount: 0.5,
    note: 'Rate shown is the <=200K-token tier; prompts above 200K tokens bill at $2.50 / $15.',
  },
  {
    id: 'gemini-2-5-flash',
    apiId: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    vendor: 'Google',
    tokenizer: 'gemini',
    context: 1_048_576,
    maxOutput: 65_536,
    inputPerM: 0.3,
    outputPerM: 2.5,
    cacheReadPerM: 0.075,
    batchDiscount: 0.5,
  },
  {
    id: 'gemini-2-5-flash-lite',
    apiId: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash-Lite',
    vendor: 'Google',
    tokenizer: 'gemini',
    context: 1_048_576,
    maxOutput: 65_536,
    inputPerM: 0.1,
    outputPerM: 0.4,
    cacheReadPerM: 0.025,
    batchDiscount: 0.5,
  },

  // ---------------------------------------------------------------------- xAI
  {
    id: 'grok-4',
    apiId: 'grok-4',
    label: 'Grok 4',
    vendor: 'xAI',
    tokenizer: 'grok',
    context: 256_000,
    inputPerM: 3,
    outputPerM: 15,
    cacheReadPerM: 0.75,
  },
  {
    id: 'grok-3-mini',
    apiId: 'grok-3-mini',
    label: 'Grok 3 mini',
    vendor: 'xAI',
    tokenizer: 'grok',
    context: 131_072,
    inputPerM: 0.3,
    outputPerM: 0.5,
  },

  // ----------------------------------------------------------------- DeepSeek
  {
    id: 'deepseek-v3',
    apiId: 'deepseek-chat',
    label: 'DeepSeek V3',
    vendor: 'DeepSeek',
    tokenizer: 'deepseek',
    context: 128_000,
    maxOutput: 8_192,
    inputPerM: 0.27,
    outputPerM: 1.1,
    cacheReadPerM: 0.07,
  },
  {
    id: 'deepseek-r1',
    apiId: 'deepseek-reasoner',
    label: 'DeepSeek R1',
    vendor: 'DeepSeek',
    tokenizer: 'deepseek',
    context: 128_000,
    maxOutput: 65_536,
    inputPerM: 0.55,
    outputPerM: 2.19,
    cacheReadPerM: 0.14,
  },

  // ------------------------------------------------------------------ Mistral
  {
    id: 'mistral-large-2',
    apiId: 'mistral-large-latest',
    label: 'Mistral Large 2',
    vendor: 'Mistral',
    tokenizer: 'mistral',
    context: 131_072,
    inputPerM: 2,
    outputPerM: 6,
    batchDiscount: 0.5,
  },
  {
    id: 'mistral-small-3',
    apiId: 'mistral-small-latest',
    label: 'Mistral Small 3',
    vendor: 'Mistral',
    tokenizer: 'mistral',
    context: 131_072,
    inputPerM: 0.1,
    outputPerM: 0.3,
    batchDiscount: 0.5,
  },

  // --------------------------------------------------------------------- Meta
  {
    id: 'llama-4-maverick',
    apiId: 'llama-4-maverick-17b-128e-instruct',
    label: 'Llama 4 Maverick',
    vendor: 'Meta',
    tokenizer: 'llama',
    context: 1_048_576,
    inputPerM: 0.27,
    outputPerM: 0.85,
    hostedRate: true,
  },
  {
    id: 'llama-4-scout',
    apiId: 'llama-4-scout-17b-16e-instruct',
    label: 'Llama 4 Scout',
    vendor: 'Meta',
    tokenizer: 'llama',
    context: 327_680,
    inputPerM: 0.18,
    outputPerM: 0.59,
    hostedRate: true,
  },
  {
    id: 'llama-3-3-70b',
    apiId: 'llama-3.3-70b-instruct',
    label: 'Llama 3.3 70B',
    vendor: 'Meta',
    tokenizer: 'llama',
    context: 131_072,
    inputPerM: 0.88,
    outputPerM: 0.88,
    hostedRate: true,
  },

  // ------------------------------------------------------------------- Cohere
  {
    id: 'command-a',
    apiId: 'command-a-03-2025',
    label: 'Command A',
    vendor: 'Cohere',
    tokenizer: 'cohere',
    context: 256_000,
    inputPerM: 2.5,
    outputPerM: 10,
  },

  // ------------------------------------------------------------------ Alibaba
  {
    id: 'qwen3-235b',
    apiId: 'qwen3-235b-a22b',
    label: 'Qwen3 235B',
    vendor: 'Alibaba',
    tokenizer: 'qwen',
    context: 131_072,
    inputPerM: 0.22,
    outputPerM: 0.88,
    hostedRate: true,
  },
];

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
