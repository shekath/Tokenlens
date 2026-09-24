/**
 * Keeping the model registry current: the pure half of scripts/sync-models.mjs.
 *
 * Source: LiteLLM's model_prices_and_context_window.json, the community-kept
 * price list most LLM tooling reads. Vendors publish prices as web pages, and
 * their "list models" APIs return names but not prices, so there is no
 * first-party machine-readable source to use instead.
 *
 * What an automatic update may do, and what it must leave to a person:
 *
 *   - Update the price of a model we already list, matched by its API id.
 *     A move of 50% or more is held for review: that size of change is as
 *     often an alias re-pointed at a different model (mistral-large-latest
 *     did exactly that) or an upstream typo as it is a real price cut.
 *   - Grow a context window. A smaller one is held: upstream sometimes
 *     reports the input cap where we store the total window.
 *   - Add a new model, but only when its id fits a known product family for
 *     its vendor (gpt-N[.N][-mini|-nano], claude-<family>-N-N, ...). Dated
 *     snapshots, -latest aliases, audio, search, fine-tune and research
 *     variants never become rows. New ids that fit no family are listed in
 *     the report instead. More than MAX_AUTO_ADDITIONS in one run is held
 *     too - a flood usually means upstream reorganised, not a launch day.
 *   - Never remove a model, and never touch the hosted open-weight entries
 *     (Llama, Qwen, Cohere), whose rates are a host's, not a vendor's.
 *
 * Everything here is deterministic and takes its inputs as arguments, so the
 * whole policy is tested without a network.
 */

import type { Model, TokenizerFamily, Vendor } from '../src/lib/models.ts';

export interface UpstreamEntry {
  litellm_provider?: string;
  mode?: string;
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_read_input_token_cost?: number;
  cache_creation_input_token_cost?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
  deprecation_date?: string;
}

export type Upstream = Record<string, UpstreamEntry | unknown>;

interface VendorRule {
  vendor: Vendor;
  provider: string;
  tokenizer: TokenizerFamily | ((id: string) => TokenizerFamily);
  /** Ids (provider prefix stripped) that are products, not variants. */
  family: RegExp;
  batchDiscount?: number;
  label: (id: string) => string;
}

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "5-5" -> "5.5", "4" -> "4". */
const version = (parts: string[]) => parts.join('.');

export const VENDOR_RULES: VendorRule[] = [
  {
    vendor: 'Anthropic',
    provider: 'anthropic',
    tokenizer: 'claude',
    family: /^claude-(opus|sonnet|haiku|fable|mythos)-\d+(-\d)?$/,
    batchDiscount: 0.5,
    label: (id) => {
      const [, family, ...v] = id.split('-');
      return `Claude ${title(family!)} ${version(v)}`;
    },
  },
  {
    vendor: 'OpenAI',
    provider: 'openai',
    // GPT-4 and 3.5 bill against cl100k; 4o, 4.1, 5 and the o-series against o200k.
    tokenizer: (id) => (/^gpt-(3\.5|4)(-turbo|-\d{4}|-32k)?$/.test(id) ? 'cl100k' : 'o200k'),
    family: /^(gpt-\d+(\.\d+)?(-(mini|nano))?|o\d+(-mini)?)$/,
    batchDiscount: 0.5,
    label: (id) => (id.startsWith('gpt-') ? `GPT-${id.slice(4).replace(/-(mini|nano)$/, ' $1')}` : id),
  },
  {
    vendor: 'Google',
    provider: 'gemini',
    tokenizer: 'gemini',
    family: /^gemini-\d+(\.\d+)?-(pro|flash|flash-lite)(-preview)?$/,
    batchDiscount: 0.5,
    label: (id) => {
      const m = id.match(/^gemini-([\d.]+)-(pro|flash-lite|flash)(-preview)?$/)!;
      const tier = m[2] === 'flash-lite' ? 'Flash-Lite' : title(m[2]!);
      return `Gemini ${m[1]} ${tier}${m[3] ? ' (preview)' : ''}`;
    },
  },
  {
    vendor: 'xAI',
    provider: 'xai',
    tokenizer: 'grok',
    family: /^grok-\d+(\.\d+)?(-(fast|mini))?$/,
    label: (id) => {
      const m = id.match(/^grok-([\d.]+)(?:-(fast|mini))?$/)!;
      return `Grok ${m[1]}${m[2] ? ` ${m[2]}` : ''}`;
    },
  },
  {
    vendor: 'DeepSeek',
    provider: 'deepseek',
    tokenizer: 'deepseek',
    family: /^deepseek-v\d+(\.\d+)?(-(pro|flash))?$/,
    label: (id) => {
      const m = id.match(/^deepseek-v([\d.]+)(?:-(pro|flash))?$/)!;
      return `DeepSeek V${m[1]}${m[2] ? ` ${title(m[2])}` : ''}`;
    },
  },
  {
    vendor: 'Mistral',
    provider: 'mistral',
    tokenizer: 'mistral',
    // large-3, medium-3-5 / medium-3.5; never large-2512 (a date-stamped build).
    family: /^mistral-(large|medium|small)-\d{1,2}([.-]\d)?$/,
    batchDiscount: 0.5,
    label: (id) => {
      const m = id.match(/^mistral-(large|medium|small)-(\d{1,2})(?:[.-](\d))?$/)!;
      return `Mistral ${title(m[1]!)} ${m[2]}${m[3] ? `.${m[3]}` : ''}`;
    },
  },
];

/** Price moves at or beyond this fraction are held for review. */
export const LARGE_PRICE_CHANGE = 0.5;
/** More new models than this in one run are held for review. */
export const MAX_AUTO_ADDITIONS = 12;

const stripProvider = (key: string) => key.slice(key.lastIndexOf('/') + 1);

/** The comparison key: vendor prefix, snapshot date and -latest removed; dots as dashes. */
export function modelKey(s: string): string {
  return stripProvider(s.trim().toLowerCase())
    .replace(/[-@](?:\d{8}|\d{4}-\d{2}-\d{2})$/, '')
    .replace(/-latest$/, '')
    .replace(/[._\s]+/g, '-');
}

const perM = (perToken: number | undefined): number | undefined =>
  typeof perToken === 'number' && Number.isFinite(perToken) ? Number((perToken * 1e6).toFixed(6)) : undefined;

function isEntry(v: unknown): v is UpstreamEntry {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export type ChangeKind = 'added' | 'price' | 'context' | 'maxOutput';

export interface Change {
  kind: ChangeKind;
  id: string;
  label: string;
  vendor: Vendor;
  /** Human-readable before -> after, for the report. */
  detail: string;
  /** Held for a person rather than applied automatically, and why. */
  review: string | null;
}

export interface SyncPlan {
  /** The registry with every change applied - for the review branch. */
  all: Model[];
  /** The registry with only the unreviewed-safe changes applied. */
  safe: Model[];
  changes: Change[];
  /** New upstream ids for our vendors that fit no product family. */
  unmatched: string[];
  /** Listed models the source no longer carries (reported, never removed). */
  missing: string[];
}

function fmt(n: number | undefined): string {
  if (n === undefined) return '—';
  return `$${n < 1 ? n.toFixed(n < 0.1 ? 3 : 2) : n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
}

function relChange(a: number, b: number): number {
  return a === 0 ? (b === 0 ? 0 : Infinity) : Math.abs(b - a) / a;
}

/** Plans an update of `current` from `upstream`. Pure. */
export function planSync(
  current: Model[],
  upstream: Upstream,
  today: string = new Date().toISOString().slice(0, 10),
  maxAdditions: number = MAX_AUTO_ADDITIONS,
): SyncPlan {
  const entries = Object.entries(upstream).filter(
    (e): e is [string, UpstreamEntry] => isEntry(e[1]) && e[1].mode === 'chat',
  );
  const changes: Change[] = [];
  const safe = current.map((m) => ({ ...m }));
  const all = current.map((m) => ({ ...m }));
  const missing: string[] = [];

  // ------------------------------------------------ existing: prices, limits
  for (let i = 0; i < current.length; i += 1) {
    const m = current[i]!;
    const rule = VENDOR_RULES.find((r) => r.vendor === m.vendor);
    if (!rule || m.hostedRate) continue;
    const want = modelKey(m.apiId);
    const hits = entries.filter(([k, v]) => v.litellm_provider === rule.provider && modelKey(k) === want);
    if (hits.length === 0) {
      missing.push(m.id);
      continue;
    }
    // Several upstream keys for one id (prefixed and not, dated and not) must
    // agree; if they do not, we cannot say which is right.
    const prices = new Set(hits.map(([, v]) => `${perM(v.input_cost_per_token)}/${perM(v.output_cost_per_token)}`));
    const [key, up] = hits.find(([k]) => stripProvider(k) === m.apiId) ?? hits[0]!;
    const input = perM(up.input_cost_per_token);
    const output = perM(up.output_cost_per_token);
    const base = { id: m.id, label: m.label, vendor: m.vendor };
    // Once anything about a model is in doubt, everything about it is: a price
    // held because an alias moved means the context came from that other model too.
    let doubt: string | null = prices.size > 1 ? `upstream lists ${prices.size} different prices for this id (${[...prices].join(', ')})` : null;

    if (input !== undefined && output !== undefined && (input !== m.inputPerM || output !== m.outputPerM)) {
      let review: string | null = null;
      if (prices.size > 1) review = `upstream lists ${prices.size} different prices for this id (${[...prices].join(', ')})`;
      else if (input <= 0 || output <= 0) review = 'upstream price is zero';
      else if (relChange(m.inputPerM, input) >= LARGE_PRICE_CHANGE || relChange(m.outputPerM, output) >= LARGE_PRICE_CHANGE) {
        review = `a move of ${LARGE_PRICE_CHANGE * 100}% or more — often an alias now pointing at a different model; check ${m.vendor}'s pricing page`;
      }
      const cacheRead = perM(up.cache_read_input_token_cost);
      const cacheWrite = perM(up.cache_creation_input_token_cost);
      const apply = (t: Model) => {
        t.inputPerM = input;
        t.outputPerM = output;
        if (cacheRead !== undefined && cacheRead > 0) t.cacheReadPerM = cacheRead;
        if (cacheWrite !== undefined && cacheWrite > 0) t.cacheWritePerM = cacheWrite;
      };
      apply(all[i]!);
      if (!review) apply(safe[i]!);
      doubt ??= review;
      changes.push({
        ...base,
        kind: 'price',
        detail: `input ${fmt(m.inputPerM)} → ${fmt(input)}, output ${fmt(m.outputPerM)} → ${fmt(output)} per 1M (${key})`,
        review,
      });
    }

    const ctx = up.max_input_tokens;
    if (typeof ctx === 'number' && ctx > 0 && ctx !== m.context) {
      const review =
        ctx < m.context
          ? 'smaller than we list — upstream may report the input cap where we store the full window'
          : doubt
            ? `held with this model's other change: ${doubt}`
            : null;
      all[i]!.context = ctx;
      if (!review) safe[i]!.context = ctx;
      changes.push({ ...base, kind: 'context', detail: `context ${m.context.toLocaleString('en-US')} → ${ctx.toLocaleString('en-US')} tokens`, review });
    }

    const maxOut = up.max_output_tokens;
    if (typeof maxOut === 'number' && maxOut > 0 && m.maxOutput !== undefined && maxOut > m.maxOutput) {
      const review = doubt ? `held with this model's other change: ${doubt}` : null;
      all[i]!.maxOutput = maxOut;
      if (!review) safe[i]!.maxOutput = maxOut;
      changes.push({ ...base, kind: 'maxOutput', detail: `max output ${m.maxOutput.toLocaleString('en-US')} → ${maxOut.toLocaleString('en-US')} tokens`, review });
    }
  }

  // ----------------------------------------------------------- new models
  const known = new Set(current.flatMap((m) => [modelKey(m.id), modelKey(m.apiId)]));
  const candidates = new Map<string, { rule: VendorRule; apiId: string; up: UpstreamEntry }>();
  const unmatched = new Set<string>();
  for (const [key, up] of entries) {
    const rule = VENDOR_RULES.find((r) => r.provider === up.litellm_provider);
    if (!rule) continue;
    const apiId = stripProvider(key);
    const id = modelKey(apiId);
    if (known.has(id)) continue;
    if (!rule.family.test(apiId)) {
      // Only undated, non-alias ids are worth a person's attention.
      if (!/-latest$|\d{4}-?\d{2}-?\d{2}$|^ft:|-\d{4}$/.test(apiId)) unmatched.add(`${rule.vendor}: ${apiId}`);
      continue;
    }
    if (up.deprecation_date && up.deprecation_date < today) continue;
    const input = perM(up.input_cost_per_token);
    const output = perM(up.output_cost_per_token);
    if (!input || !output || input <= 0 || output <= 0) continue;
    // "medium-3.5" and "medium-3-5" are one model; keep the first spelling seen.
    if (!candidates.has(id)) candidates.set(id, { rule, apiId, up });
  }

  const flood = candidates.size > maxAdditions;
  const additions = [...candidates.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [id, { rule, apiId, up }] of additions) {
    const model: Model = {
      id,
      apiId,
      label: rule.label(apiId),
      vendor: rule.vendor,
      tokenizer: typeof rule.tokenizer === 'function' ? rule.tokenizer(apiId) : rule.tokenizer,
      context: up.max_input_tokens ?? 128_000,
      inputPerM: perM(up.input_cost_per_token)!,
      outputPerM: perM(up.output_cost_per_token)!,
    };
    if (up.max_output_tokens) model.maxOutput = up.max_output_tokens;
    const cr = perM(up.cache_read_input_token_cost);
    const cw = perM(up.cache_creation_input_token_cost);
    if (cr && cr > 0) model.cacheReadPerM = cr;
    if (cw && cw > 0) model.cacheWritePerM = cw;
    if (rule.batchDiscount) model.batchDiscount = rule.batchDiscount;
    const review = flood ? `${candidates.size} new models in one run — more than ${maxAdditions}, so upstream may have reorganised` : null;
    all.push(model);
    if (!review) safe.push(model);
    changes.push({
      kind: 'added',
      id,
      label: model.label,
      vendor: model.vendor,
      detail: `${fmt(model.inputPerM)} in / ${fmt(model.outputPerM)} out per 1M, ${model.context.toLocaleString('en-US')} context (${apiId})`,
      review,
    });
  }

  const order = (list: Model[]) => {
    // Keep each vendor's models together, in the registry's vendor order,
    // new ones after the curated ones.
    const vendors = [...new Set(current.map((m) => m.vendor))];
    return list.sort((a, b) => vendors.indexOf(a.vendor) - vendors.indexOf(b.vendor));
  };

  return { all: order(all), safe: order(safe), changes, unmatched: [...unmatched].sort(), missing };
}

/* --------------------------------------------------------------- output -- */

const FIELD_ORDER: Array<keyof Model> = [
  'id',
  'apiId',
  'label',
  'vendor',
  'tokenizer',
  'context',
  'maxOutput',
  'inputPerM',
  'outputPerM',
  'cacheReadPerM',
  'cacheWritePerM',
  'batchDiscount',
  'hostedRate',
  'note',
];

function literal(v: unknown): string {
  if (typeof v === 'number') {
    if (Number.isInteger(v) && Math.abs(v) >= 10_000) return v.toLocaleString('en-US').replace(/,/g, '_');
    // 3 x 0.1 is 0.30000000000000004 in floating point; a price list says 0.3.
    return String(Number(v.toPrecision(12)));
  }
  return JSON.stringify(v);
}

/** The data module, byte-for-byte deterministic for the same input. */
export function renderDataFile(models: Model[], pricingAsOf: string): string {
  const out: string[] = [
    '/**',
    ' * The model registry data. GENERATED - edited by scripts/sync-models.mjs,',
    ' * which rewrites this file from the daily price sync. Hand edits are kept:',
    ' * the sync reads this file, changes only prices, limits and new rows, and',
    ' * writes every other field back as it found it. See scripts/modelSync.ts.',
    ' */',
    '',
    "import type { Model } from './models.ts';",
    '',
    `export const PRICING_AS_OF = '${pricingAsOf}';`,
    '',
    'export const MODEL_DATA: Model[] = [',
  ];
  let vendor = '';
  for (const m of models) {
    if (m.vendor !== vendor) {
      vendor = m.vendor;
      out.push(`  // ${'-'.repeat(Math.max(4, 68 - vendor.length))} ${vendor}`);
    }
    out.push('  {');
    for (const key of FIELD_ORDER) {
      const v = m[key];
      if (v === undefined) continue;
      out.push(`    ${key}: ${literal(v)},`);
    }
    out.push('  },');
  }
  out.push('];', '');
  return out.join('\n');
}

export function renderReport(plan: SyncPlan, applied: 'safe' | 'all', source: string): string {
  const auto = plan.changes.filter((c) => !c.review);
  const held = plan.changes.filter((c) => c.review);
  const lines: string[] = [];
  const row = (c: Change) => `| ${c.vendor} | \`${c.id}\` | ${c.kind === 'added' ? 'new model' : c.kind} | ${c.detail} |`;
  if (applied === 'safe') {
    lines.push(`### Model list: ${auto.length} update${auto.length === 1 ? '' : 's'} applied`, '');
    if (auto.length > 0) lines.push('| Vendor | Model | Change | Detail |', '|---|---|---|---|', ...auto.map(row), '');
  } else {
    lines.push(`### Model list: ${held.length} change${held.length === 1 ? ' needs' : 's need'} a look`, '');
    lines.push('Each of these was held back from the automatic update. Check it against the vendor\'s pricing page, then merge this pull request or close it.', '');
    if (held.length > 0) {
      lines.push('| Vendor | Model | Change | Detail | Why it was held |', '|---|---|---|---|---|');
      for (const c of held) lines.push(`${row(c).slice(0, -1)}| ${c.review} |`);
      lines.push('');
    }
  }
  if (plan.unmatched.length > 0) {
    lines.push(
      '<details><summary>New ids upstream that fit no known product family (not added)</summary>',
      '',
      ...plan.unmatched.map((u) => `- ${u}`),
      '',
      'If one of these is a real new product, add a pattern for it in `scripts/modelSync.ts` (VENDOR_RULES).',
      '</details>',
      '',
    );
  }
  if (plan.missing.length > 0) {
    lines.push(`Listed but no longer in the source (kept, never removed automatically): ${plan.missing.map((m) => `\`${m}\``).join(', ')}.`, '');
  }
  lines.push(`<sub>Source: ${source}</sub>`);
  return lines.join('\n');
}
