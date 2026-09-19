/**
 * Prompt-cache break-even modelling.
 *
 * The blueprint's cost model, with the terms named:
 *
 *   total = P_base x T_fresh                     (the part that can never cache)
 *         + P_write x T_cached x writes          (misses pay the write premium)
 *         + P_read  x T_cached x reads           (hits pay the read rate)
 *         + P_out   x T_out                      (unchanged either way)
 *
 * Over N invocations at hit rate h: reads = N*h, writes = N*(1-h).
 *
 * The question a developer actually has is "at what hit rate does this stop
 * costing me money", which falls out of setting the cached input cost equal to
 * the uncached one:
 *
 *   P_base = P_write - h(P_write - P_read)
 *   h* = (P_write - P_base) / (P_write - P_read)
 *
 * At Anthropic's published multipliers - write 1.25x base, read 0.1x base -
 * h* = 0.25 / 1.15 = 21.7%. Below that, caching is a net loss.
 */

import type { Model } from './models';

export interface CacheInputs {
  /** Tokens that differ every call and can never cache. */
  freshTokens: number;
  /** The stable prefix: system prompt, tool definitions, pinned documents. */
  cachedTokens: number;
  outputTokens: number;
  /** Invocations over the period being modelled. */
  invocations: number;
  /** Share of invocations that read from a warm cache, 0-1. */
  hitRate: number;
}

export const DEFAULT_CACHE_INPUTS: CacheInputs = {
  freshTokens: 400,
  cachedTokens: 4_000,
  outputTokens: 500,
  invocations: 30_000,
  hitRate: 0.8,
};

export interface CacheOutcome {
  /** Every call billed at the base input rate, no caching. */
  uncached: number;
  /** The same traffic with the prefix cached at `hitRate`. */
  cached: number;
  /** cached - uncached. Negative is a saving. */
  delta: number;
  /** Saving as a fraction of the uncached bill. Negative means caching costs more. */
  savedFraction: number;
  breakdown: {
    fresh: number;
    writes: number;
    reads: number;
    output: number;
  };
}

/** Does this model publish the rates the simulation needs? */
export function supportsCaching(model: Model): boolean {
  return model.cacheReadPerM !== undefined && model.cacheWritePerM !== undefined;
}

export function simulate(model: Model, input: CacheInputs): CacheOutcome {
  const { freshTokens, cachedTokens, outputTokens, invocations, hitRate } = input;
  const perM = 1e6;

  const outputCost = (outputTokens * invocations * model.outputPerM) / perM;
  const freshCost = (freshTokens * invocations * model.inputPerM) / perM;

  const uncachedInput =
    ((freshTokens + cachedTokens) * invocations * model.inputPerM) / perM;
  const uncached = uncachedInput + outputCost;

  if (!supportsCaching(model)) {
    return {
      uncached,
      cached: uncached,
      delta: 0,
      savedFraction: 0,
      breakdown: { fresh: freshCost, writes: 0, reads: 0, output: outputCost },
    };
  }

  const writeRate = model.cacheWritePerM!;
  const readRate = model.cacheReadPerM!;
  const reads = invocations * hitRate;
  const writes = invocations - reads;

  const writesCost = (cachedTokens * writes * writeRate) / perM;
  const readsCost = (cachedTokens * reads * readRate) / perM;
  const cached = freshCost + writesCost + readsCost + outputCost;

  return {
    uncached,
    cached,
    delta: cached - uncached,
    savedFraction: uncached > 0 ? 1 - cached / uncached : 0,
    breakdown: { fresh: freshCost, writes: writesCost, reads: readsCost, output: outputCost },
  };
}

/**
 * The hit rate at which caching stops losing money, or null when the model
 * publishes no cache rates. Depends only on the three rates, not on volume or
 * prompt size - which is the useful insight, and why it is reported as a headline.
 */
export function breakEvenHitRate(model: Model): number | null {
  if (!supportsCaching(model)) return null;
  const base = model.inputPerM;
  const write = model.cacheWritePerM!;
  const read = model.cacheReadPerM!;
  const denominator = write - read;
  if (denominator <= 0) return 0;
  const h = (write - base) / denominator;
  return Math.min(1, Math.max(0, h));
}

/**
 * How many calls must share one cache entry before writing it pays off, assuming
 * the first call writes and the rest read within the TTL. That makes the hit rate
 * (n-1)/n, so the answer is ceil(1 / (1 - h*)).
 */
export function breakEvenCallCount(model: Model): number | null {
  const h = breakEvenHitRate(model);
  if (h === null) return null;
  if (h >= 1) return Number.POSITIVE_INFINITY;
  return Math.max(2, Math.ceil(1 / (1 - h)));
}

export interface CurvePoint {
  hitRate: number;
  cached: number;
  uncached: number;
}

/** Cost across the full hit-rate range, for plotting where the lines cross. */
export function hitRateCurve(model: Model, input: CacheInputs, steps = 21): CurvePoint[] {
  const out: CurvePoint[] = [];
  for (let i = 0; i < steps; i += 1) {
    const hitRate = i / (steps - 1);
    const o = simulate(model, { ...input, hitRate });
    out.push({ hitRate, cached: o.cached, uncached: o.uncached });
  }
  return out;
}

export interface VolumePoint {
  invocations: number;
  cached: number;
  uncached: number;
}

/** Cost against volume at the current hit rate, on a log-ish ladder. */
export function volumeCurve(model: Model, input: CacheInputs): VolumePoint[] {
  const ladder = [100, 1_000, 10_000, 100_000, 1_000_000];
  return ladder.map((invocations) => {
    const o = simulate(model, { ...input, invocations });
    return { invocations, cached: o.cached, uncached: o.uncached };
  });
}
