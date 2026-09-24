/**
 * Usage reconciliation: what you estimated against what you were billed.
 *
 * A provider's usage export is parsed in the browser (the same promise as the
 * batch forecaster: nothing is uploaded), priced, and set against the saved
 * estimates the user says describe that workload. The output is not just the
 * gap but its cause, split the one way that always adds up exactly:
 *
 *   actual - estimated = (calls_a - calls_e) x perCall_e     volume effect
 *                      + calls_a x (perCall_a - perCall_e)   per-call effect
 *
 * "You made 40% more calls than planned" and "each call cost twice what you
 * planned" are different problems with different fixes, and a single variance
 * figure hides which one you have.
 *
 * Exports differ by provider and change over time, so nothing here assumes one
 * layout. Columns are detected from a list of known names, the detected mapping
 * is shown, and the UI lets the person correct it. The one semantic difference
 * that moves money - whether "input tokens" already includes cached reads - is
 * a named option, defaulted per vendor, never silently assumed.
 */

import type { Model } from './models';

export type UsageField =
  | 'date'
  | 'model'
  | 'inputTokens'
  | 'outputTokens'
  | 'cacheReadTokens'
  | 'cacheWriteTokens'
  | 'requests'
  | 'cost';

export const USAGE_FIELDS: Array<{ field: UsageField; label: string; required: boolean }> = [
  { field: 'model', label: 'Model', required: true },
  { field: 'date', label: 'Date', required: false },
  { field: 'inputTokens', label: 'Input tokens', required: false },
  { field: 'outputTokens', label: 'Output tokens', required: false },
  { field: 'cacheReadTokens', label: 'Cache read tokens', required: false },
  { field: 'cacheWriteTokens', label: 'Cache write tokens', required: false },
  { field: 'requests', label: 'Requests', required: false },
  { field: 'cost', label: 'Cost (USD)', required: false },
];

export type ColumnMap = Partial<Record<UsageField, string>>;

/** Known column names, normalised, in priority order. */
const ALIASES: Record<UsageField, string[]> = {
  date: ['date', 'day', 'usage_date', 'start_time', 'bucket_start', 'starting_at', 'start_date', 'timestamp', 'time', 'period_start'],
  model: ['model', 'model_id', 'model_name', 'model_version', 'snapshot_id', 'model_snapshot'],
  inputTokens: [
    'uncached_input_tokens',
    'input_tokens',
    'prompt_tokens',
    'n_context_tokens_total',
    'input',
    'tokens_in',
    'input_token_count',
  ],
  outputTokens: ['output_tokens', 'completion_tokens', 'n_generated_tokens_total', 'output', 'tokens_out', 'output_token_count'],
  cacheReadTokens: [
    'cache_read_input_tokens',
    'cache_read_tokens',
    'input_cached_tokens',
    'cached_input_tokens',
    'cached_tokens',
    'n_cached_context_tokens_total',
  ],
  cacheWriteTokens: ['cache_creation_input_tokens', 'cache_write_tokens', 'cache_creation_tokens', 'cache_write_input_tokens'],
  requests: ['requests', 'num_model_requests', 'n_requests', 'request_count', 'num_requests', 'api_calls', 'calls'],
  cost: ['cost_usd', 'cost', 'amount_usd', 'amount', 'total_cost', 'spend', 'usd', 'cost_in_usd', 'price'],
};

export function normaliseHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Best guess at which column holds which field. Unrecognised fields are left out. */
export function detectColumns(headers: string[]): ColumnMap {
  const byNorm = new Map<string, string>();
  for (const h of headers) {
    const n = normaliseHeader(h);
    if (!byNorm.has(n)) byNorm.set(n, h);
  }
  const map: ColumnMap = {};
  const used = new Set<string>();
  for (const { field } of USAGE_FIELDS) {
    for (const alias of ALIASES[field]) {
      const h = byNorm.get(alias);
      if (h !== undefined && !used.has(h)) {
        map[field] = h;
        used.add(h);
        break;
      }
    }
  }
  return map;
}

/** What is missing before the mapping can be priced, as sentences. Empty when usable. */
export function mappingProblems(map: ColumnMap): string[] {
  const problems: string[] = [];
  if (!map.model) problems.push('Choose which column holds the model name.');
  if (!map.cost && !map.inputTokens && !map.outputTokens) {
    problems.push('Choose a cost column, or the input and output token columns so the rows can be priced.');
  }
  return problems;
}

/** "$1,234.50", "1 234", "" and "-" all parse; anything else is NaN. */
export function parseNumber(raw: string | undefined): number {
  if (raw === undefined) return 0;
  const s = raw.trim();
  if (s === '' || s === '-') return 0;
  const cleaned = s.replace(/[$€£,\s]/g, '').replace(/^usd/i, '');
  return cleaned === '' ? 0 : Number(cleaned);
}

export interface UsageRow {
  date: string | null;
  rawModel: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  requests: number | null;
  cost: number | null;
}

export function toUsageRows(
  records: Array<Record<string, string>>,
  map: ColumnMap,
): { rows: UsageRow[]; skipped: number } {
  const rows: UsageRow[] = [];
  let skipped = 0;
  const num = (r: Record<string, string>, f: UsageField): number | null => {
    const col = map[f];
    if (!col) return null;
    const v = parseNumber(r[col]);
    return Number.isFinite(v) ? v : Number.NaN;
  };
  for (const r of records) {
    const rawModel = map.model ? (r[map.model] ?? '').trim() : '';
    const vals = {
      input: num(r, 'inputTokens'),
      output: num(r, 'outputTokens'),
      cacheRead: num(r, 'cacheReadTokens'),
      cacheWrite: num(r, 'cacheWriteTokens'),
      requests: num(r, 'requests'),
      cost: num(r, 'cost'),
    };
    const bad = Object.values(vals).some((v) => v !== null && Number.isNaN(v));
    if (rawModel === '' || bad) {
      skipped += 1;
      continue;
    }
    const row: UsageRow = {
      date: map.date ? (r[map.date] ?? '').trim() || null : null,
      rawModel,
      input: vals.input ?? 0,
      output: vals.output ?? 0,
      cacheRead: vals.cacheRead ?? 0,
      cacheWrite: vals.cacheWrite ?? 0,
      requests: vals.requests,
      cost: vals.cost,
    };
    if (row.input + row.output + row.cacheRead + row.cacheWrite === 0 && !row.cost && !row.requests) {
      skipped += 1;
      continue;
    }
    rows.push(row);
  }
  return { rows, skipped };
}

function modelKey(s: string): string {
  let n = s.trim().toLowerCase();
  n = n.slice(n.lastIndexOf('/') + 1);
  n = n.replace(/[-@](?:\d{8}|\d{4}-\d{2}-\d{2})$/, '').replace(/-latest$/, '');
  return n.replace(/[._\s]+/g, '-');
}

/**
 * The registry model a usage row refers to, or null.
 *
 * Exact after normalising vendor prefixes, snapshot dates and punctuation -
 * deliberately not a prefix match. "gpt-4o-mini-audio" is not "gpt-4o-mini",
 * and pricing one at the other's rate would produce a confident wrong number.
 */
export function matchModel(raw: string, models: Model[]): Model | null {
  const key = modelKey(raw);
  if (key === '') return null;
  return models.find((m) => modelKey(m.apiId) === key || modelKey(m.id) === key) ?? null;
}

export type CacheInclusion = 'auto' | 'included' | 'separate';

/**
 * Whether a row's input count already contains its cached reads. OpenAI reports
 * cached tokens as a subset of prompt tokens; Anthropic reports them separately.
 */
export function inputIncludesCache(model: Model | null, setting: CacheInclusion): boolean {
  if (setting === 'included') return true;
  if (setting === 'separate') return false;
  return model?.vendor === 'OpenAI';
}

/** A row's cost at list rates, split so the uncached input is never double-charged. */
export function priceRow(row: UsageRow, model: Model, setting: CacheInclusion): number {
  const uncached = inputIncludesCache(model, setting) ? Math.max(0, row.input - row.cacheRead) : row.input;
  return (
    (uncached * model.inputPerM +
      row.output * model.outputPerM +
      row.cacheRead * (model.cacheReadPerM ?? model.inputPerM) +
      row.cacheWrite * (model.cacheWritePerM ?? model.inputPerM)) /
    1e6
  );
}

export interface ModelUsage {
  /** Registry id, or `raw:<name>` for a model that could not be matched. */
  key: string;
  model: Model | null;
  rawNames: string[];
  rows: number;
  /** Null when any row lacked a request count. */
  requests: number | null;
  /** All input tokens, cached reads and writes included. */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cost: number;
  /** Rows with no cost column value and no registry match: counted, not priced. */
  unpricedRows: number;
  costSource: 'file' | 'rates' | 'mixed' | 'none';
}

export interface UsageSummary {
  byModel: ModelUsage[];
  totalCost: number;
  firstDate: string | null;
  lastDate: string | null;
  /** Inclusive calendar days from first to last date, or null without a date column. */
  days: number | null;
  rows: number;
  unpricedRows: number;
}

function dayOf(s: string | null): number | null {
  if (!s) return null;
  const t = Date.parse(s.length >= 10 ? s.slice(0, 10) : s);
  return Number.isFinite(t) ? Math.floor(t / 86_400_000) : null;
}

export function summariseUsage(
  rows: UsageRow[],
  models: Model[],
  opts: { cacheInclusion?: CacheInclusion; overrides?: Record<string, string> } = {},
): UsageSummary {
  const setting = opts.cacheInclusion ?? 'auto';
  const groups = new Map<string, ModelUsage & { sources: Set<'file' | 'rates'> }>();
  let minDay: number | null = null;
  let maxDay: number | null = null;
  let firstDate: string | null = null;
  let lastDate: string | null = null;

  for (const row of rows) {
    const overrideId = opts.overrides?.[row.rawModel];
    const model = (overrideId ? models.find((m) => m.id === overrideId) : null) ?? matchModel(row.rawModel, models);
    const key = model ? model.id : `raw:${row.rawModel}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        model,
        rawNames: [],
        rows: 0,
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cost: 0,
        unpricedRows: 0,
        costSource: 'none',
        sources: new Set(),
      };
      groups.set(key, g);
    }
    if (!g.rawNames.includes(row.rawModel)) g.rawNames.push(row.rawModel);
    g.rows += 1;
    g.requests = row.requests === null || g.requests === null ? null : g.requests + row.requests;
    const includes = inputIncludesCache(model, setting);
    const uncached = includes ? Math.max(0, row.input - row.cacheRead) : row.input;
    g.inputTokens += uncached + row.cacheRead + row.cacheWrite;
    g.outputTokens += row.output;
    g.cacheReadTokens += row.cacheRead;
    if (row.cost !== null) {
      g.cost += row.cost;
      g.sources.add('file');
    } else if (model) {
      g.cost += priceRow(row, model, setting);
      g.sources.add('rates');
    } else {
      g.unpricedRows += 1;
    }

    const d = dayOf(row.date);
    if (d !== null) {
      if (minDay === null || d < minDay) {
        minDay = d;
        firstDate = row.date!.slice(0, 10);
      }
      if (maxDay === null || d > maxDay) {
        maxDay = d;
        lastDate = row.date!.slice(0, 10);
      }
    }
  }

  const byModel: ModelUsage[] = [...groups.values()]
    .map(({ sources, ...g }): ModelUsage => ({
      ...g,
      costSource: sources.size === 2 ? 'mixed' : sources.size === 1 ? [...sources][0]! : 'none',
    }))
    .sort((a, b) => b.cost - a.cost);

  return {
    byModel,
    totalCost: byModel.reduce((s, g) => s + g.cost, 0),
    firstDate,
    lastDate,
    days: minDay !== null && maxDay !== null ? maxDay - minDay + 1 : null,
    rows: rows.length,
    unpricedRows: byModel.reduce((s, g) => s + g.unpricedRows, 0),
  };
}

/** One saved estimate, as the reconciliation needs it. */
export interface PlannedWorkload {
  id: string;
  title: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costPerCall: number;
  callsPerDay: number;
}

export interface Variance {
  key: string;
  label: string;
  status: 'planned' | 'unplanned' | 'unused';
  estimated: number;
  actual: number;
  delta: number;
  estCalls: number;
  actualCalls: number | null;
  estPerCall: number;
  actualPerCall: number | null;
  /** (actualCalls - estCalls) x estPerCall. Null without request counts. */
  volumeEffect: number | null;
  /** actualCalls x (actualPerCall - estPerCall). Null without request counts. */
  perCallEffect: number | null;
  /** Actual tokens per call over planned, or null when either side is unknown. */
  inputRatio: number | null;
  outputRatio: number | null;
  /** Share of actual input tokens that were cached reads, or null without usage. */
  cachedShare: number | null;
}

export interface Reconciliation {
  lines: Variance[];
  estimatedTotal: number;
  actualTotal: number;
  delta: number;
  /** delta / estimatedTotal, or null when nothing was estimated. */
  deltaFraction: number | null;
  days: number;
}

export function reconcile(summary: UsageSummary, plans: PlannedWorkload[], days: number): Reconciliation {
  const planned = new Map<string, { calls: number; cost: number; input: number; output: number; titles: string[] }>();
  for (const p of plans) {
    const calls = Math.max(0, p.callsPerDay) * days;
    const cur = planned.get(p.modelId) ?? { calls: 0, cost: 0, input: 0, output: 0, titles: [] };
    cur.calls += calls;
    cur.cost += calls * p.costPerCall;
    cur.input += calls * p.inputTokens;
    cur.output += calls * p.outputTokens;
    cur.titles.push(p.title);
    planned.set(p.modelId, cur);
  }

  const lines: Variance[] = [];
  const seen = new Set<string>();
  for (const u of summary.byModel) {
    seen.add(u.key);
    const plan = planned.get(u.key);
    const label = u.model?.label ?? u.rawNames.join(', ');
    const actualCalls = u.requests;
    const actualPerCall = actualCalls ? u.cost / actualCalls : null;
    if (!plan) {
      lines.push({
        key: u.key,
        label,
        status: 'unplanned',
        estimated: 0,
        actual: u.cost,
        delta: u.cost,
        estCalls: 0,
        actualCalls,
        estPerCall: 0,
        actualPerCall,
        volumeEffect: null,
        perCallEffect: null,
        inputRatio: null,
        outputRatio: null,
        cachedShare: u.inputTokens > 0 ? u.cacheReadTokens / u.inputTokens : null,
      });
      continue;
    }
    const estPerCall = plan.calls > 0 ? plan.cost / plan.calls : 0;
    const known = actualCalls !== null && actualCalls > 0 && plan.calls > 0;
    lines.push({
      key: u.key,
      label,
      status: 'planned',
      estimated: plan.cost,
      actual: u.cost,
      delta: u.cost - plan.cost,
      estCalls: plan.calls,
      actualCalls,
      estPerCall,
      actualPerCall,
      volumeEffect: actualCalls !== null ? (actualCalls - plan.calls) * estPerCall : null,
      perCallEffect: actualCalls !== null && actualPerCall !== null ? actualCalls * (actualPerCall - estPerCall) : null,
      inputRatio: known && plan.input > 0 ? u.inputTokens / actualCalls / (plan.input / plan.calls) : null,
      outputRatio: known && plan.output > 0 ? u.outputTokens / actualCalls / (plan.output / plan.calls) : null,
      cachedShare: u.inputTokens > 0 ? u.cacheReadTokens / u.inputTokens : null,
    });
  }
  for (const [key, plan] of planned) {
    if (seen.has(key)) continue;
    lines.push({
      key,
      label: plan.titles.join(', '),
      status: 'unused',
      estimated: plan.cost,
      actual: 0,
      delta: -plan.cost,
      estCalls: plan.calls,
      actualCalls: 0,
      estPerCall: plan.calls > 0 ? plan.cost / plan.calls : 0,
      actualPerCall: null,
      volumeEffect: null,
      perCallEffect: null,
      inputRatio: null,
      outputRatio: null,
      cachedShare: null,
    });
  }

  lines.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const estimatedTotal = lines.reduce((s, l) => s + l.estimated, 0);
  const actualTotal = lines.reduce((s, l) => s + l.actual, 0);
  return {
    lines,
    estimatedTotal,
    actualTotal,
    delta: actualTotal - estimatedTotal,
    deltaFraction: estimatedTotal > 0 ? (actualTotal - estimatedTotal) / estimatedTotal : null,
    days,
  };
}

/**
 * Plain-language causes, largest first. Each sentence names one lever: volume,
 * input size, output size, a model nobody planned for, or a plan never used.
 */
export function explain(r: Reconciliation, fmt: (usd: number) => string): string[] {
  type Cause = { weight: number; text: string };
  const causes: Cause[] = [];
  const signed = (n: number) => `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))}`;
  const times = (x: number) => (x >= 1 ? `${x.toFixed(1)}×` : `${Math.round(x * 100)}% of`);
  for (const l of r.lines) {
    if (l.status === 'unplanned' && l.actual > 0) {
      causes.push({ weight: l.actual, text: `${l.label} was not in any estimate: ${fmt(l.actual)} of unplanned spend.` });
      continue;
    }
    if (l.status === 'unused') {
      causes.push({ weight: l.estimated, text: `${l.label} was estimated at ${fmt(l.estimated)} but has no usage in this export.` });
      continue;
    }
    if (l.volumeEffect !== null && Math.abs(l.volumeEffect) >= 0.005 && l.actualCalls !== null && l.estCalls > 0) {
      const pctChange = (l.actualCalls - l.estCalls) / l.estCalls;
      causes.push({
        weight: Math.abs(l.volumeEffect),
        text: `${l.label}: ${Math.abs(Math.round(pctChange * 100))}% ${pctChange >= 0 ? 'more' : 'fewer'} calls than planned (${signed(l.volumeEffect)}).`,
      });
    }
    if (l.perCallEffect !== null && Math.abs(l.perCallEffect) >= 0.005) {
      const parts: string[] = [];
      if (l.inputRatio !== null && Math.abs(l.inputRatio - 1) >= 0.1) {
        // Bigger input that still cost less is almost always the cache at work;
        // say so, or "3.6x the input, cheaper per call" reads as a contradiction.
        const cached = l.cachedShare !== null && l.cachedShare >= 0.25 ? ` (${Math.round(l.cachedShare * 100)}% of it cached reads)` : '';
        parts.push(`input ${times(l.inputRatio)} plan${cached}`);
      }
      if (l.outputRatio !== null && Math.abs(l.outputRatio - 1) >= 0.1) parts.push(`output ${times(l.outputRatio)} plan`);
      const why = parts.length > 0 ? ` — ${parts.join(', ')} per call` : '';
      causes.push({
        weight: Math.abs(l.perCallEffect),
        text: `${l.label}: each call cost ${l.perCallEffect >= 0 ? 'more' : 'less'} than planned (${signed(l.perCallEffect)})${why}.`,
      });
    }
    if (l.volumeEffect === null && Math.abs(l.delta) >= 0.005) {
      causes.push({
        weight: Math.abs(l.delta),
        text: `${l.label}: ${signed(l.delta)} against plan. Add a requests column to split this into volume and per-call cost.`,
      });
    }
  }
  return causes.sort((a, b) => b.weight - a.weight).map((c) => c.text);
}

/** A small, clearly synthetic export for trying the tool without real data. */
export const SAMPLE_USAGE_CSV = [
  'date,model,requests,input_tokens,output_tokens,cache_read_input_tokens,cache_creation_input_tokens',
  ...Array.from({ length: 30 }, (_, i) => {
    const day = `2026-08-${String(i + 1).padStart(2, '0')}`;
    return [
      `${day},claude-sonnet-5-20260801,1400,1680000,980000,4200000,120000`,
      `${day},claude-haiku-4-5,5200,2600000,1040000,0,0`,
    ];
  }).flat(),
].join('\n');
