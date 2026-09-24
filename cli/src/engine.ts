/**
 * The web app's engine, loaded for node.
 *
 * Nothing here re-implements a calculation: every number the CLI and the MCP
 * server report comes from the same modules the browser runs, so a count in a
 * pull request and a count in the app cannot disagree.
 */

import { MODELS, MODELS_BY_ID, type Model } from '../../src/lib/models.ts';
import { countFor, encodeBase, isExact, FAMILY_INFO, loadPrimary, loadSecondary } from '../../src/lib/tokenize.ts';
import { matchModel } from '../../src/lib/reconcile.ts';

let loaded: Promise<void> | null = null;

/** Both encoders, so cl100k counts are exact from the first call. */
export function ready(): Promise<void> {
  loaded ??= Promise.all([loadPrimary(), loadSecondary()]).then(() => undefined);
  return loaded;
}

/** Registry id, API id, or a dated snapshot name ("claude-sonnet-5-20260801"). */
export function resolveModel(name: string): Model | null {
  return MODELS_BY_ID[name] ?? matchModel(name, MODELS);
}

export function countTokens(text: string, model: Model): number {
  if (text.length === 0) return 0;
  return countFor(model, encodeBase(text, { pieces: false }));
}

export function tokenCounter(model: Model): (s: string) => number {
  return (s) => countTokens(s, model);
}

export function countDetail(text: string, model: Model) {
  const base = encodeBase(text, { pieces: false });
  return {
    tokens: text.length === 0 ? 0 : countFor(model, base),
    exact: isExact(model, base),
    encoding: FAMILY_INFO[model.tokenizer].encoding,
    basis: FAMILY_INFO[model.tokenizer].basis,
    nonLatinShare: base.nonLatinShare,
  };
}

/** Closest registry ids to an unknown name, for "did you mean". */
export function suggestModels(name: string, limit = 3): string[] {
  const n = name.toLowerCase();
  const score = (id: string) => {
    let common = 0;
    while (common < Math.min(id.length, n.length) && id[common] === n[common]) common += 1;
    return common + (id.includes(n) || n.includes(id) ? 5 : 0);
  };
  // Only names sharing a real stem ("claude-", "gpt-4") are worth offering.
  return MODELS.map((m) => m.id)
    .filter((id) => score(id) >= 3)
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);
}

export { MODELS, MODELS_BY_ID };
export type { Model };
