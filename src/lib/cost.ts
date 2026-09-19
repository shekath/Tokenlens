/**
 * Cost math. All rates are USD per 1,000,000 tokens.
 */

import type { Model } from './models';

export interface CostAssumptions {
  /** Expected output tokens per call. */
  outputTokens: number;
  /** Calls per day, for the scale projection. */
  callsPerDay: number;
  /** Share of the prompt that is a stable, cacheable prefix (0-1). */
  cachedShare: number;
  /** Cache hit rate across calls (0-1) - the share of calls that read rather than write. */
  cacheHitRate: number;
  /** Whether the workload can run through a batch/async endpoint. */
  useBatch: boolean;
}

export const DEFAULT_ASSUMPTIONS: CostAssumptions = {
  outputTokens: 500,
  callsPerDay: 1_000,
  cachedShare: 0,
  cacheHitRate: 0,
  useBatch: false,
};

export interface CallCost {
  input: number;
  output: number;
  total: number;
}

/** Straight per-call cost with no caching and no batch discount. */
export function callCost(model: Model, inputTokens: number, outputTokens: number): CallCost {
  const input = (inputTokens / 1e6) * model.inputPerM;
  const output = (outputTokens / 1e6) * model.outputPerM;
  return { input, output, total: input + output };
}

export interface CachedCost extends CallCost {
  /** Cost of the cacheable prefix, blended across writes and reads. */
  cached: number;
  /** Cost of the part of the prompt that can never cache. */
  uncached: number;
  /** Saving versus the same call with no caching, as a fraction of the baseline. */
  savedFraction: number;
  /** True when the model publishes no cache rate, so this is the uncached figure. */
  unsupported: boolean;
}

/**
 * Per-call cost under a caching assumption.
 *
 * A cache miss pays the write premium for the prefix; a hit pays the read rate.
 * Blending by hit rate gives the expected cost of a call in steady state.
 */
export function cachedCallCost(
  model: Model,
  inputTokens: number,
  a: CostAssumptions,
): CachedCost {
  const base = callCost(model, inputTokens, a.outputTokens);
  const readRate = model.cacheReadPerM;
  const writeRate = model.cacheWritePerM ?? model.inputPerM;

  if (readRate === undefined || a.cachedShare <= 0) {
    return { ...base, cached: 0, uncached: base.input, savedFraction: 0, unsupported: readRate === undefined };
  }

  const prefixTokens = inputTokens * a.cachedShare;
  const restTokens = inputTokens - prefixTokens;

  const readCost = (prefixTokens / 1e6) * readRate;
  const writeCost = (prefixTokens / 1e6) * writeRate;
  const cached = a.cacheHitRate * readCost + (1 - a.cacheHitRate) * writeCost;
  const uncached = (restTokens / 1e6) * model.inputPerM;

  const input = cached + uncached;
  const total = input + base.output;
  return {
    input,
    output: base.output,
    total,
    cached,
    uncached,
    savedFraction: base.total > 0 ? 1 - total / base.total : 0,
    unsupported: false,
  };
}

export interface Projection {
  perCall: number;
  perDay: number;
  perMonth: number;
  perYear: number;
}

/** Scale one call out to a day / month / year at the assumed volume. */
export function project(perCall: number, callsPerDay: number): Projection {
  const perDay = perCall * callsPerDay;
  return { perCall, perDay, perMonth: perDay * 30, perYear: perDay * 365 };
}

/** Effective per-call cost under every assumption the user has set, batch included. */
export function effectiveCost(model: Model, inputTokens: number, a: CostAssumptions): CachedCost {
  const c = cachedCallCost(model, inputTokens, a);
  if (!a.useBatch || !model.batchDiscount) return c;
  const k = 1 - model.batchDiscount;
  return {
    ...c,
    input: c.input * k,
    output: c.output * k,
    total: c.total * k,
    cached: c.cached * k,
    uncached: c.uncached * k,
  };
}

export type Severity = 'ok' | 'warning' | 'serious' | 'critical';

/** How full the context window is, and how alarmed to be about it. */
export function utilization(tokens: number, context: number): { fraction: number; severity: Severity } {
  const fraction = context > 0 ? tokens / context : 0;
  let severity: Severity = 'ok';
  if (fraction >= 1) severity = 'critical';
  else if (fraction >= 0.9) severity = 'serious';
  else if (fraction >= 0.7) severity = 'warning';
  return { fraction, severity };
}
