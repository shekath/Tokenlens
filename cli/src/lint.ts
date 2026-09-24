/**
 * One prompt file in, findings out.
 *
 * Which checks run follows the plan, from the same entitlements matrix the web
 * app reads: budgets for everyone, the Trimmer and the cache-order check from
 * Pro, a team's own rule levels on Team. A check the plan does not include is
 * skipped and named once in the run's notices - never turned into a failure.
 */

import type { Entitlements } from '../../src/lib/entitlements.ts';
import { callCost } from '../../src/lib/cost.ts';
import { trim } from '../../src/lib/trimmer.ts';
import { analyseCacheability, describeMove, monthlyCacheLoss } from '../../src/lib/cacheability.ts';
import { DEFAULT_RULES, settingsFor, trimmerLevel, type Config, type Level, type RuleConfig } from './config.ts';
import { countTokens, resolveModel, tokenCounter, type Model } from './engine.ts';

export type CheckId = 'budget' | 'trimmer' | 'cacheability';

export interface Finding {
  file: string;
  /** 1-based; null when the finding is about the whole file. */
  line: number | null;
  level: Exclude<Level, 'off'>;
  check: CheckId;
  /** Trimmer rule id, or 'maxTokens' / 'maxMonthlyUsd' / 'order'. */
  rule: string;
  message: string;
  /** Monthly USD this finding is worth fixing, where it can be priced. */
  monthlyUsd: number | null;
}

export interface FileReport {
  file: string;
  model: string;
  tokens: number;
  callsPerDay: number;
  /** Full-call cost per month (input + planned output), or null when the plan cannot price this model. */
  monthlyUsd: number | null;
  findings: Finding[];
}

export interface LintContext {
  config: Config;
  ent: Entitlements;
}

/** What this plan actually applies, and what it would apply on a better one. */
export function effectiveRules(ctx: LintContext): { rules: RuleConfig; notices: string[] } {
  const notices: string[] = [];
  let rules = ctx.config.rules;
  if (ctx.config.customRules && !ctx.ent.features.trimmerRules) {
    rules = DEFAULT_RULES;
    notices.push('The "rules" section of .tokenticks.json is a Team feature; default levels were used.');
  }
  if (!ctx.ent.features.trimmer) {
    notices.push('Trimmer checks (politeness, hedges, repeated instructions…) need Pro; skipped.');
  }
  if (!ctx.ent.features.cacheLinter) {
    notices.push('Cache-order checks need Pro; skipped.');
  }
  return { rules, notices };
}

/** Line of the first place a Trimmer rule would act, for annotations. */
function firstLine(text: string, count: (s: string) => number): number | null {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) if (count(lines[i]!) > 0) return i + 1;
  return null;
}

function canPrice(model: Model, ent: Entitlements): boolean {
  return ent.modelAllowlist === null || ent.modelAllowlist.includes(model.id);
}

export class UnknownModelError extends Error {}

export function lintFile(file: string, text: string, ctx: LintContext, rules: RuleConfig): FileReport {
  const s = settingsFor(file, ctx.config);
  const model = resolveModel(s.model);
  if (!model) throw new UnknownModelError(`${file}: unknown model "${s.model}".`);
  const priced = canPrice(model, ctx.ent);
  const tokens = countTokens(text, model);
  const perMonth = (usdPerCall: number) => usdPerCall * s.callsPerDay * 30;
  const monthlyUsd = priced ? perMonth(callCost(model, tokens, s.outputTokens).total) : null;
  const inputUsdPerToken = model.inputPerM / 1e6;
  const findings: Finding[] = [];
  const push = (f: Omit<Finding, 'file'>) => findings.push({ file, ...f });

  if (rules.budget !== 'off') {
    if (s.maxTokens !== null && tokens > s.maxTokens) {
      push({
        line: null,
        level: rules.budget,
        check: 'budget',
        rule: 'maxTokens',
        message: `${tokens.toLocaleString('en-US')} tokens on ${model.label}, over the ${s.maxTokens.toLocaleString('en-US')}-token budget by ${(tokens - s.maxTokens).toLocaleString('en-US')}.`,
        monthlyUsd: priced ? perMonth((tokens - s.maxTokens) * inputUsdPerToken) : null,
      });
    }
    if (s.maxMonthlyUsd !== null && monthlyUsd !== null && monthlyUsd > s.maxMonthlyUsd) {
      push({
        line: null,
        level: rules.budget,
        check: 'budget',
        rule: 'maxMonthlyUsd',
        message: `$${monthlyUsd.toFixed(2)}/month at ${s.callsPerDay.toLocaleString('en-US')} calls/day on ${model.label}, over the $${s.maxMonthlyUsd.toFixed(2)} budget.`,
        monthlyUsd: monthlyUsd - s.maxMonthlyUsd,
      });
    }
  }

  const count = tokenCounter(model);

  if (ctx.ent.features.trimmer) {
    const result = trim(text, count);
    for (const f of result.findings) {
      const lvl = trimmerLevel(rules, f.rule.id);
      if (lvl === 'off' || f.tokensSaved <= 0) continue;
      push({
        line: firstLine(text, f.rule.count),
        level: lvl,
        check: 'trimmer',
        rule: f.rule.id,
        message: `${f.rule.label} (${f.occurrences}×): ${f.tokensSaved} token${f.tokensSaved === 1 ? '' : 's'} removable. ${f.rule.why}`,
        monthlyUsd: priced ? perMonth(f.tokensSaved * inputUsdPerToken) : null,
      });
    }
  }

  const cacheLevel = rules.cacheability;
  if (ctx.ent.features.cacheLinter && cacheLevel !== 'off') {
    const ignore = ctx.config.cache.ignore.map((p) => new RegExp(p));
    const report = analyseCacheability(text, count, {
      minConfidence: ctx.config.cache.minConfidence,
      ignore: (h) => ignore.some((re) => re.test(h.match)),
    });
    if (report.lostTokens > 0 && report.lastStableLine !== null) {
      const loss = priced ? monthlyCacheLoss(report.lostTokens, s.callsPerDay, model, ctx.config.cacheHitRate) : null;
      const pct = Math.round(report.lostFraction * 100);
      report.moves.forEach((m, i) => {
        push({
          line: m.startLine,
          level: cacheLevel,
          check: 'cacheability',
          rule: 'order',
          message:
            `${describeMove(m, report.lastStableLine!)}.` +
            (i === 0
              ? ` ${report.lostTokens.toLocaleString('en-US')} stable tokens sit after a per-call value and cannot be cached (${pct}% of the cacheable prefix).`
              : ''),
          monthlyUsd: i === 0 ? loss : null,
        });
      });
    }
  }

  return { file, model: model.id, tokens, callsPerDay: s.callsPerDay, monthlyUsd, findings };
}

