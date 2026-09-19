/**
 * Derived text and token statistics. Everything here is pure, synchronous and
 * computed once per debounced input change.
 */

import type { BaseEncoding, TokenPiece } from './tokenize';

export interface CompositionBucket {
  key: 'letters' | 'digits' | 'whitespace' | 'punctuation' | 'other';
  label: string;
  count: number;
}

export interface LengthBin {
  /** Inclusive lower bound of token length in characters. */
  from: number;
  /** Inclusive upper bound; Infinity for the open-ended top bin. */
  to: number;
  label: string;
  count: number;
}

export interface RepeatedToken {
  text: string;
  count: number;
  /** Tokens saved if every repeat after the first were gone. */
  redundant: number;
}

export interface TextMetrics {
  chars: number;
  charsNoSpaces: number;
  words: number;
  lines: number;
  sentences: number;
  paragraphs: number;
  /** Bytes as UTF-8 - what actually crosses the wire. */
  bytes: number;
  composition: CompositionBucket[];
}

export interface TokenMetrics {
  total: number;
  unique: number;
  /** unique / total. Low means the prompt repeats itself. */
  vocabRatio: number;
  /** Characters per token. Higher is more efficient. English prose lands near 4. */
  charsPerToken: number;
  /** Tokens per word. Near 1.0 for plain English; climbs for code and other scripts. */
  tokensPerWord: number;
  /**
   * Share of tokens that are more than half whitespace.
   *
   * Pure-whitespace tokens are the obvious measure and the wrong one: o200k
   * attaches a newline to the character before it, so prose with blank lines
   * scores a flat 0% and the metric looks broken. Majority-whitespace catches
   * both the paragraph breaks in prose and the indentation runs in code.
   */
  formattingShare: number;
  lengths: LengthBin[];
  repeated: RepeatedToken[];
  /** Longest single token, in characters. */
  longest: number;
}

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu;
const SENTENCE_RE = /[^.!?\n]+[.!?]+|[^.!?\n]+$/g;

export function textMetrics(text: string): TextMetrics {
  let letters = 0;
  let digits = 0;
  let whitespace = 0;
  let punctuation = 0;
  let other = 0;

  for (const ch of text) {
    if (/\s/u.test(ch)) whitespace += 1;
    else if (/\p{L}/u.test(ch)) letters += 1;
    else if (/\p{N}/u.test(ch)) digits += 1;
    else if (/[\p{P}\p{S}]/u.test(ch)) punctuation += 1;
    else other += 1;
  }

  const words = text.match(WORD_RE)?.length ?? 0;
  const lines = text.length === 0 ? 0 : text.split('\n').length;
  const sentences = text.trim() ? (text.match(SENTENCE_RE)?.length ?? 0) : 0;
  const paragraphs = text.trim() ? text.trim().split(/\n\s*\n/).length : 0;

  return {
    chars: [...text].length,
    charsNoSpaces: [...text].length - whitespace,
    words,
    lines,
    sentences,
    paragraphs,
    bytes: new TextEncoder().encode(text).length,
    composition: [
      { key: 'letters', label: 'Letters', count: letters },
      { key: 'digits', label: 'Digits', count: digits },
      { key: 'whitespace', label: 'Whitespace', count: whitespace },
      { key: 'punctuation', label: 'Punctuation & symbols', count: punctuation },
      { key: 'other', label: 'Other', count: other },
    ],
  };
}

const BINS: Array<Pick<LengthBin, 'from' | 'to' | 'label'>> = [
  { from: 1, to: 1, label: '1 char' },
  { from: 2, to: 2, label: '2' },
  { from: 3, to: 3, label: '3' },
  { from: 4, to: 4, label: '4' },
  { from: 5, to: 6, label: '5-6' },
  { from: 7, to: 9, label: '7-9' },
  { from: 10, to: Infinity, label: '10+' },
];

/**
 * Token-level statistics. `total` is passed in separately because it is the
 * selected model's count, which may be a scaled estimate, while the shape
 * statistics below can only be read off the concrete o200k pieces.
 */
export function tokenMetrics(
  base: BaseEncoding,
  total: number,
  words: number,
  chars: number,
): TokenMetrics {
  const pieces: TokenPiece[] = base.pieces;
  const counted = pieces.length || base.o200k.length;

  const lengths: LengthBin[] = BINS.map((b) => ({ ...b, count: 0 }));
  const freq = new Map<string, number>();
  let formattingTokens = 0;
  let longest = 0;

  for (const p of pieces) {
    const len = [...p.text].length;
    if (len > longest) longest = len;
    const bin = lengths.find((b) => len >= b.from && len <= b.to);
    if (bin) bin.count += 1;
    const wsChars = [...p.text].filter((c) => /\s/u.test(c)).length;
    if (wsChars * 2 > len) formattingTokens += 1;
    freq.set(p.text, (freq.get(p.text) ?? 0) + 1);
  }

  const repeated: RepeatedToken[] = [...freq.entries()]
    .filter(([, n]) => n > 1)
    .map(([text, count]) => ({ text, count, redundant: count - 1 }))
    .sort((a, b) => b.count - a.count || b.text.length - a.text.length)
    .slice(0, 12);

  return {
    total,
    unique: freq.size,
    vocabRatio: counted ? freq.size / counted : 0,
    charsPerToken: total ? chars / total : 0,
    tokensPerWord: words ? total / words : 0,
    formattingShare: counted ? formattingTokens / counted : 0,
    lengths,
    repeated,
    longest,
  };
}
