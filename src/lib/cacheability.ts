/**
 * The cacheability linter: why a prompt cache is not hitting.
 *
 * Prompt caching is a prefix match. A provider caches the prompt up to a
 * breakpoint and a later call reuses it only if every token before that point
 * is byte-identical. So one value that changes per call - a timestamp, a user
 * id, a request id, a template variable - invalidates everything written after
 * it, however stable. The Cache ROI simulator says whether caching pays; this
 * says why a cache that should pay is not.
 *
 * The analysis works on blocks (runs of lines separated by blank lines, with a
 * fenced code block always kept whole). Moving a block is a suggestion a person
 * can read and judge; moving a single line out of the middle of a JSON object
 * or a numbered list would break it. The prefix measurement itself is exact to
 * the character: it is the text before the first volatile value.
 *
 * Detection is deliberately two-level. `high` is something that almost always
 * differs per call (a template placeholder, a UUID, a clock time); `medium` is
 * something that often does but may be fixed (a bare date, a long hex id). The
 * UI lets a person dismiss a hit, and the CLI takes ignore patterns, because a
 * linter that cannot be told "that date is fixed" gets switched off.
 */

import type { Model } from './models';

export type VolatileKind =
  | 'templateVar'
  | 'uuid'
  | 'timestamp'
  | 'epoch'
  | 'date'
  | 'hexId';

export interface VolatilePattern {
  kind: VolatileKind;
  label: string;
  confidence: 'high' | 'medium';
  re: RegExp;
}

const MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

/** Order matters: earlier patterns claim their span first, so a timestamp is not also a date. */
export const PATTERNS: VolatilePattern[] = [
  {
    kind: 'templateVar',
    label: 'Template placeholder',
    confidence: 'high',
    // {{ name }}, ${name}, <%= name %>
    re: /\{\{\s*[\w.$-]+\s*\}\}|\$\{[\w.]+\}|<%=?\s*[\w.]+\s*%>/g,
  },
  {
    kind: 'templateVar',
    label: 'Format placeholder',
    confidence: 'medium',
    // Python str.format / f-string style {name}. Braces holding JSON never match:
    // the content must be a bare identifier.
    re: /(?<![{$\w])\{[A-Za-z_][\w.]*\}(?!\})/g,
  },
  {
    kind: 'uuid',
    label: 'UUID',
    confidence: 'high',
    re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  },
  {
    kind: 'timestamp',
    label: 'Date and time',
    confidence: 'high',
    re: /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?\b|\b\d{1,2}:\d{2}(?::\d{2})?\s?(?:[ap]\.?m\b\.?|UTC\b|GMT\b)/gi,
  },
  {
    kind: 'epoch',
    label: 'Unix timestamp',
    confidence: 'medium',
    // 2001-09-09 to 2033-05-18 in seconds, or the same range in milliseconds.
    re: /\b1\d{9}(?:\d{3})?\b/g,
  },
  {
    kind: 'date',
    label: 'Date',
    confidence: 'medium',
    re: new RegExp(
      `\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b\\d{1,2}/\\d{1,2}/\\d{2,4}\\b|\\b(?:${MONTHS})\\.? \\d{1,2}(?:st|nd|rd|th)?,? \\d{4}\\b|\\b\\d{1,2} (?:${MONTHS}),? \\d{4}\\b`,
      'gi',
    ),
  },
  {
    kind: 'hexId',
    label: 'Hex identifier',
    confidence: 'medium',
    // Request ids, trace ids, hashes. 24+ hex characters with at least one digit
    // and one letter, so a long run of a single class is not flagged.
    re: /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{24,}\b/gi,
  },
];

export interface VolatileHit {
  kind: VolatileKind;
  label: string;
  confidence: 'high' | 'medium';
  /** The matched text. */
  match: string;
  /** 1-based line number in the analysed text. */
  line: number;
  /** Character offset into the (newline-normalised) text. */
  offset: number;
  /** Stable identity for dismissing a hit: the same value is dismissed everywhere. */
  key: string;
}

export interface Block {
  /** 1-based, inclusive. */
  startLine: number;
  endLine: number;
  text: string;
  hits: VolatileHit[];
}

export interface BlockMove {
  startLine: number;
  endLine: number;
  hits: VolatileHit[];
}

export interface CacheabilityReport {
  totalTokens: number;
  /** Tokens before the first volatile value: what can cache today. */
  prefixTokens: number;
  /** The same, after moving volatile blocks below the stable ones. */
  reorderedPrefixTokens: number;
  /** reorderedPrefixTokens - prefixTokens: stable tokens a volatile value is shutting out. */
  lostTokens: number;
  /** Share of the achievable cacheable prefix that is currently lost (0-1). */
  lostFraction: number;
  /** Every hit, dismissed ones excluded. */
  hits: VolatileHit[];
  /** Volatile blocks that sit above stable content, in order. */
  moves: BlockMove[];
  /** Last line of stable content - where the moved blocks should go below. */
  lastStableLine: number | null;
  /** The prompt with volatile blocks moved to the end. Equal to the input when nothing moves. */
  reordered: string;
}

export interface AnalyseOptions {
  /** Hits to ignore. Keys come from VolatileHit.key. */
  dismissed?: ReadonlySet<string>;
  /** Extra ignore rule, for callers holding patterns rather than keys. */
  ignore?: (hit: VolatileHit) => boolean;
  /** Only count hits at or above this confidence. Default: medium (all). */
  minConfidence?: 'high' | 'medium';
}

function normalise(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** All volatile values in a text, in order, spans never overlapping. */
export function findVolatile(text: string, opts: AnalyseOptions = {}): VolatileHit[] {
  const src = normalise(text);
  const taken: Array<[number, number]> = [];
  const hits: VolatileHit[] = [];
  const lineStarts = [0];
  for (let i = 0; i < src.length; i += 1) if (src[i] === '\n') lineStarts.push(i + 1);
  const lineOf = (offset: number): number => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };

  for (const p of PATTERNS) {
    if (opts.minConfidence === 'high' && p.confidence !== 'high') continue;
    const re = new RegExp(p.re.source, p.re.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      const start = m.index;
      const end = start + m[0].length;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      const hit: VolatileHit = {
        kind: p.kind,
        label: p.label,
        confidence: p.confidence,
        match: m[0],
        line: lineOf(start),
        offset: start,
        key: `${p.kind}:${m[0]}`,
      };
      if (opts.dismissed?.has(hit.key)) continue;
      if (opts.ignore?.(hit)) continue;
      taken.push([start, end]);
      hits.push(hit);
    }
  }
  return hits.sort((a, b) => a.offset - b.offset);
}

/** Splits into blocks at blank lines; a fenced code block is never split. */
export function splitBlocks(text: string): Array<Omit<Block, 'hits'>> {
  const lines = normalise(text).split('\n');
  const blocks: Array<Omit<Block, 'hits'>> = [];
  let start = -1;
  let inFence = false;
  const close = (endIdx: number) => {
    if (start === -1) return;
    blocks.push({
      startLine: start + 1,
      endLine: endIdx + 1,
      text: lines.slice(start, endIdx + 1).join('\n'),
    });
    start = -1;
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (/^\s*(```|~~~)/.test(line)) {
      if (start === -1) start = i;
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (line.trim() === '') {
      close(i - 1);
      continue;
    }
    if (start === -1) start = i;
  }
  close(lines.length - 1);
  // Trailing blank lines inside a block (only possible for an unclosed fence) are harmless.
  return blocks;
}

/**
 * Measures the cacheable prefix now and after reordering.
 *
 * `countTokens` is injected, as in the trimmer, so this stays independent of
 * which encoder is loaded and testable without one.
 */
export function analyseCacheability(
  text: string,
  countTokens: (s: string) => number,
  opts: AnalyseOptions = {},
): CacheabilityReport {
  const src = normalise(text);
  const totalTokens = src.trim() === '' ? 0 : countTokens(src);
  const hits = findVolatile(src, opts);

  const empty: CacheabilityReport = {
    totalTokens,
    prefixTokens: totalTokens,
    reorderedPrefixTokens: totalTokens,
    lostTokens: 0,
    lostFraction: 0,
    hits,
    moves: [],
    lastStableLine: null,
    reordered: text,
  };
  if (hits.length === 0) return empty;

  const blocks: Block[] = splitBlocks(src).map((b) => ({
    ...b,
    hits: hits.filter((h) => h.line >= b.startLine && h.line <= b.endLine),
  }));
  const stable = blocks.filter((b) => b.hits.length === 0);
  const volatile = blocks.filter((b) => b.hits.length > 0);
  const lastStable = stable.length > 0 ? stable[stable.length - 1]! : null;

  const prefixText = src.slice(0, hits[0]!.offset);
  const prefixTokens = prefixText.length === 0 ? 0 : countTokens(prefixText);

  // Volatile blocks that have stable content somewhere below them.
  const moves: BlockMove[] = lastStable
    ? volatile
        .filter((b) => b.startLine < lastStable.startLine)
        .map((b) => ({ startLine: b.startLine, endLine: b.endLine, hits: b.hits }))
    : [];

  if (moves.length === 0) {
    return { ...empty, prefixTokens, reorderedPrefixTokens: prefixTokens, lastStableLine: lastStable?.endLine ?? null };
  }

  const reordered = [...stable, ...volatile].map((b) => b.text).join('\n\n');
  // Re-scan rather than compute offsets by hand: the reordered text is what a
  // person would paste, so its prefix is the honest measurement.
  const reHits = findVolatile(reordered, opts);
  const reorderedPrefix = reHits.length > 0 ? reordered.slice(0, reHits[0]!.offset) : reordered;
  const reorderedPrefixTokens = reorderedPrefix.length === 0 ? 0 : countTokens(reorderedPrefix);
  const lostTokens = Math.max(0, reorderedPrefixTokens - prefixTokens);

  return {
    totalTokens,
    prefixTokens,
    reorderedPrefixTokens,
    lostTokens,
    lostFraction: reorderedPrefixTokens > 0 ? lostTokens / reorderedPrefixTokens : 0,
    hits,
    moves,
    lastStableLine: lastStable!.endLine,
    reordered,
  };
}

/**
 * What caching one token saves per call, in USD, at a steady-state hit rate:
 * the base rate minus the blend of reads (hits) and writes (misses). Null when
 * the model publishes no cache rates; zero when the blend costs more than base.
 */
export function savingPerCachedToken(model: Model, hitRate: number): number | null {
  if (model.cacheReadPerM === undefined || model.cacheWritePerM === undefined) return null;
  const h = Math.min(1, Math.max(0, hitRate));
  const blended = h * model.cacheReadPerM + (1 - h) * model.cacheWritePerM;
  return Math.max(0, model.inputPerM - blended) / 1e6;
}

/** Monthly cost of the lost prefix at a daily volume, or null without cache rates. */
export function monthlyCacheLoss(
  lostTokens: number,
  callsPerDay: number,
  model: Model,
  hitRate: number,
): number | null {
  const per = savingPerCachedToken(model, hitRate);
  if (per === null) return null;
  return lostTokens * callsPerDay * 30 * per;
}

/** One-line advice for a move, e.g. "Move lines 4-6 below line 30". */
export function describeMove(move: BlockMove, lastStableLine: number): string {
  const span = move.startLine === move.endLine ? `line ${move.startLine}` : `lines ${move.startLine}–${move.endLine}`;
  const what = [...new Set(move.hits.map((h) => h.label.toLowerCase()))].join(', ');
  return `Move ${span} (${what}) below line ${lastStableLine}`;
}
