/**
 * Batch CSV / JSONL forecasting.
 *
 * Parsing happens in the browser: the point of the tool is to price a dataset
 * before a run, and uploading the dataset to do that would be both slower and a
 * worse promise to make about customer prompts.
 */

import Papa from 'papaparse';
import type { Model } from './models';

export interface ParsedDataset {
  columns: string[];
  rows: Array<Record<string, string>>;
  /** Rows dropped because the file exceeded the tier's row cap. */
  truncated: number;
  format: 'csv' | 'jsonl';
  warnings: string[];
}

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

function flatten(value: unknown, prefix: string, out: Record<string, string>): void {
  if (value === null || value === undefined) {
    out[prefix] = '';
  } else if (Array.isArray(value) || typeof value === 'object') {
    // One level of nesting covers the shapes JSONL prompt datasets actually use
    // (a messages array, a metadata object); deeper is serialised whole.
    if (prefix.split('.').length >= 3) {
      out[prefix] = JSON.stringify(value);
      return;
    }
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else {
    out[prefix] = String(value);
  }
}

export function parseJsonl(text: string, maxRows: number): ParsedDataset {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const rows: Array<Record<string, string>> = [];
  const columns = new Set<string>();
  const warnings: string[] = [];
  let bad = 0;

  for (const line of lines) {
    if (rows.length >= maxRows) break;
    try {
      const obj = JSON.parse(line) as unknown;
      const flat: Record<string, string> = {};
      if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
        flatten(obj, '', flat);
      } else {
        flat.value = String(obj);
      }
      for (const k of Object.keys(flat)) columns.add(k);
      rows.push(flat);
    } catch {
      bad += 1;
    }
  }
  if (bad > 0) warnings.push(`${bad} line${bad === 1 ? '' : 's'} were not valid JSON and were skipped.`);

  return {
    columns: [...columns],
    rows,
    truncated: Math.max(0, lines.length - rows.length - bad),
    format: 'jsonl',
    warnings,
  };
}

export function parseCsv(text: string, maxRows: number): ParsedDataset {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });

  const warnings: string[] = [];
  if (result.errors.length > 0) {
    const first = result.errors[0];
    warnings.push(
      `${result.errors.length} parse issue${result.errors.length === 1 ? '' : 's'}; first: ${first?.message ?? 'unknown'}.`,
    );
  }

  const all = result.data.filter((r) => Object.keys(r).length > 0);
  const rows = all.slice(0, maxRows);
  return {
    columns: result.meta.fields?.map((f) => f.trim()) ?? [],
    rows,
    truncated: all.length - rows.length,
    format: 'csv',
    warnings,
  };
}

export function parseDataset(name: string, text: string, maxRows: number): ParsedDataset {
  const isJsonl = /\.(jsonl|ndjson)$/i.test(name);
  return isJsonl ? parseJsonl(text, maxRows) : parseCsv(text, maxRows);
}

/**
 * Picks the column most likely to hold prompt text: prefers an obvious name,
 * otherwise the column with the most text in it.
 */
export function guessPromptColumn(dataset: ParsedDataset): string | null {
  if (dataset.columns.length === 0) return null;
  const named = dataset.columns.find((c) =>
    /^(prompt|input|text|question|query|content|message|instruction|body)$/i.test(c),
  );
  if (named) return named;

  let best: string | null = null;
  let bestLength = -1;
  const sample = dataset.rows.slice(0, 50);
  for (const col of dataset.columns) {
    const avg =
      sample.reduce((n, r) => n + (r[col]?.length ?? 0), 0) / Math.max(1, sample.length);
    if (avg > bestLength) {
      bestLength = avg;
      best = col;
    }
  }
  return best;
}

export interface BatchForecast {
  rows: number;
  totalInputTokens: number;
  /** Per-row token counts, for the distribution summary. */
  min: number;
  max: number;
  median: number;
  mean: number;
  /** Rows whose prompt cell was empty. */
  empty: number;
}

export function forecastTokens(
  dataset: ParsedDataset,
  column: string,
  countTokens: (s: string) => number,
): BatchForecast {
  const counts: number[] = [];
  let empty = 0;
  let total = 0;

  for (const row of dataset.rows) {
    const cell = row[column] ?? '';
    if (cell.trim().length === 0) {
      empty += 1;
      counts.push(0);
      continue;
    }
    const n = countTokens(cell);
    counts.push(n);
    total += n;
  }

  const sorted = [...counts].sort((a, b) => a - b);
  const median = sorted.length === 0 ? 0 : (sorted[Math.floor(sorted.length / 2)] ?? 0);

  return {
    rows: dataset.rows.length,
    totalInputTokens: total,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    median,
    mean: counts.length > 0 ? total / counts.length : 0,
    empty,
  };
}

export interface BatchModelCost {
  model: Model;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  total: number;
  /** With the model's batch discount applied, where it publishes one. */
  batchTotal: number | null;
}

/**
 * Cost of running the dataset through each candidate model.
 *
 * `scaleTokens` converts the o200k baseline into each model's own count, so the
 * comparison uses each vendor's vocabulary rather than one number for all.
 */
export function forecastCost(
  baseInputTokens: number,
  outputTokensPerRow: number,
  rows: number,
  models: Model[],
  scaleTokens: (model: Model, baseTokens: number) => number,
): BatchModelCost[] {
  return models
    .map((model) => {
      const inputTokens = scaleTokens(model, baseInputTokens);
      const outputTokens = outputTokensPerRow * rows;
      const inputCost = (inputTokens / 1e6) * model.inputPerM;
      const outputCost = (outputTokens / 1e6) * model.outputPerM;
      const total = inputCost + outputCost;
      return {
        model,
        inputTokens,
        outputTokens,
        inputCost,
        outputCost,
        total,
        batchTotal: model.batchDiscount ? total * (1 - model.batchDiscount) : null,
      };
    })
    .sort((a, b) => a.total - b.total);
}

/** Serialises a forecast to CSV for the Pro export. */
export function forecastToCsv(costs: BatchModelCost[], rows: number): string {
  const header = [
    'model',
    'vendor',
    'rows',
    'input_tokens',
    'output_tokens',
    'input_cost_usd',
    'output_cost_usd',
    'total_usd',
    'batch_total_usd',
  ];
  const body = costs.map((c) =>
    [
      c.model.label,
      c.model.vendor,
      rows,
      c.inputTokens,
      c.outputTokens,
      c.inputCost.toFixed(6),
      c.outputCost.toFixed(6),
      c.total.toFixed(6),
      c.batchTotal === null ? '' : c.batchTotal.toFixed(6),
    ].join(','),
  );
  return [header.join(','), ...body].join('\n');
}
