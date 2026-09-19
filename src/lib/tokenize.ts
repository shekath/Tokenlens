/**
 * Token counting.
 *
 * Two of the families we support publish their BPE, so we run it and the count is
 * exact. For everyone else the tokenizer is either unpublished (Claude, Grok) or a
 * SentencePiece/Tekken vocabulary we would have to ship megabytes of ranks for
 * (Gemini, Mistral, Qwen). Rather than fall back to `length / 4` - which is blind
 * to code, punctuation density and script, the three things that actually move a
 * token count - we run the real o200k BPE and scale by a per-family factor.
 * Structure is preserved; only vocabulary efficiency is approximated.
 *
 * Exact counts carry an "exact" badge in the UI; everything else reads "~".
 *
 * Loading: the rank tables are ~2.4MB (o200k) and ~1.2MB (cl100k), so both are
 * dynamic imports. o200k is the critical path - nothing can be counted without it.
 * cl100k is only needed by two legacy OpenAI models, so it follows in the
 * background and those two counts upgrade from estimate to exact when it lands.
 */

import type { Model, TokenizerFamily } from './models';

interface Encoder {
  encode(text: string): number[];
  decodeGenerator(ids: number[]): Generator<string, void, undefined>;
}

let o200k: Encoder | null = null;
let cl100k: Encoder | null = null;
let o200kLoad: Promise<void> | null = null;
let cl100kLoad: Promise<void> | null = null;

export function loadPrimary(): Promise<void> {
  o200kLoad ??= import('gpt-tokenizer/encoding/o200k_base').then((m) => {
    o200k = m as unknown as Encoder;
  });
  return o200kLoad;
}

export function loadSecondary(): Promise<void> {
  cl100kLoad ??= import('gpt-tokenizer/encoding/cl100k_base').then((m) => {
    cl100k = m as unknown as Encoder;
  });
  return cl100kLoad;
}

export interface FamilyInfo {
  /** Multiplier applied to the o200k_base count. */
  factor: number;
  exact: boolean;
  /** The tokenizer the vendor actually bills against. */
  encoding: string;
  basis: string;
}

export const FAMILY_INFO: Record<TokenizerFamily, FamilyInfo> = {
  o200k: {
    factor: 1,
    exact: true,
    encoding: 'o200k_base',
    basis: 'Exact — OpenAI publishes this BPE and it runs in full here.',
  },
  cl100k: {
    factor: 1.05,
    exact: true,
    encoding: 'cl100k_base',
    basis: 'Exact — OpenAI publishes this BPE and it runs in full here.',
  },
  claude: {
    factor: 1.15,
    exact: false,
    encoding: 'Anthropic BPE (not published)',
    basis:
      'o200k_base × 1.15. Anthropic ships no client tokenizer; the count_tokens API endpoint is the only exact source.',
  },
  gemini: {
    factor: 1.07,
    exact: false,
    encoding: 'SentencePiece (Gemini)',
    basis: 'o200k_base × 1.07. Gemini bills against its own SentencePiece vocabulary.',
  },
  llama: {
    factor: 1.03,
    exact: false,
    encoding: 'Llama BPE (128K vocab)',
    basis:
      'o200k_base × 1.03. Llama 3 and later use a 128K tiktoken-style vocabulary that tracks cl100k closely.',
  },
  mistral: {
    factor: 1.08,
    exact: false,
    encoding: 'Tekken v3',
    basis: 'o200k_base × 1.08.',
  },
  deepseek: {
    factor: 1.05,
    exact: false,
    encoding: 'DeepSeek BPE',
    basis: 'o200k_base × 1.05.',
  },
  grok: {
    factor: 1.05,
    exact: false,
    encoding: 'xAI BPE (not published)',
    basis: 'o200k_base × 1.05.',
  },
  cohere: {
    factor: 1.08,
    exact: false,
    encoding: 'Cohere BPE',
    basis: 'o200k_base × 1.08.',
  },
  qwen: {
    factor: 1.06,
    exact: false,
    encoding: 'Qwen BPE (152K vocab)',
    basis: 'o200k_base × 1.06.',
  },
};

/**
 * Every factor above was calibrated on Latin-script text. Vocabularies diverge
 * hardest on scripts they were not optimised for - measured against cl100k, the
 * same sentence in Devanagari or Cyrillic can cost twice what the factor predicts.
 * Past this share of non-Latin, non-CJK letters the UI says the estimates are
 * shakier rather than quietly reporting them at face value.
 */
export const NON_LATIN_WARN_SHARE = 0.15;

export interface TokenPiece {
  id: number;
  text: string;
}

export interface BaseEncoding {
  /** o200k_base ids - the structural basis every family scales from. */
  o200k: number[];
  /** cl100k_base count, or null until that chunk has loaded. */
  cl100kCount: number | null;
  /** Decoded o200k pieces, for the inspector and shape stats. */
  pieces: TokenPiece[];
  /** True when the text was too long to decode piece by piece. */
  piecesTruncated: boolean;
  /** Share of letters outside the Latin and CJK blocks (0-1). */
  nonLatinShare: number;
}

/** Decoding every token into a DOM chip stops being useful well before this. */
export const INSPECT_LIMIT = 6_000;

export const EMPTY_BASE: BaseEncoding = {
  o200k: [],
  cl100kCount: null,
  pieces: [],
  piecesTruncated: false,
  nonLatinShare: 0,
};

const LATIN_OR_CJK = /[\p{Script=Latin}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const LETTER = /\p{L}/u;

function nonLatinShare(text: string): number {
  let letters = 0;
  let other = 0;
  for (const ch of text) {
    if (!LETTER.test(ch)) continue;
    letters += 1;
    if (!LATIN_OR_CJK.test(ch)) other += 1;
  }
  return letters ? other / letters : 0;
}

/** Runs the BPE. Returns EMPTY_BASE until the primary encoder has loaded. */
export function encodeBase(text: string): BaseEncoding {
  if (!text || !o200k) return EMPTY_BASE;

  const ids = o200k.encode(text);
  const pieces: TokenPiece[] = [];
  const truncated = ids.length > INSPECT_LIMIT;
  const slice = truncated ? ids.slice(0, INSPECT_LIMIT) : ids;
  let i = 0;
  for (const piece of o200k.decodeGenerator(slice)) {
    pieces.push({ id: slice[i]!, text: piece });
    i += 1;
  }

  return {
    o200k: ids,
    cl100kCount: cl100k ? cl100k.encode(text).length : null,
    pieces,
    piecesTruncated: truncated,
    nonLatinShare: nonLatinShare(text),
  };
}

/** Token count for one model, given an already-computed base encoding. */
export function countFor(model: Model, base: BaseEncoding): number {
  if (model.tokenizer === 'o200k') return base.o200k.length;
  if (model.tokenizer === 'cl100k') {
    // Before the cl100k chunk lands this is a scaled estimate, and `isExact`
    // reports it as one; it becomes the real count on the next render after load.
    return base.cl100kCount ?? Math.round(base.o200k.length * FAMILY_INFO.cl100k.factor);
  }
  return Math.round(base.o200k.length * FAMILY_INFO[model.tokenizer].factor);
}

/** Whether this model's count is the vendor's real number rather than an estimate. */
export function isExact(model: Model, base: BaseEncoding): boolean {
  if (model.tokenizer === 'cl100k') return base.cl100kCount !== null;
  return FAMILY_INFO[model.tokenizer].exact;
}
