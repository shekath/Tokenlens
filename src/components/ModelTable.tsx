import { useMemo, useState } from 'react';
import type { Model } from '../lib/models';
import { FAMILY_INFO, isExact, type BaseEncoding } from '../lib/tokenize';
import { utilization, type CostAssumptions, type CachedCost } from '../lib/cost';
import { num, pct, usd } from '../lib/format';
import { SeverityIcon } from './primitives';

export interface ModelRow {
  model: Model;
  tokens: number;
  cost: CachedCost;
}

type SortKey = 'label' | 'tokens' | 'context' | 'input' | 'output' | 'total' | 'perDay';

const COLUMNS: Array<{ key: SortKey; label: string; help: string }> = [
  { key: 'label', label: 'Model', help: 'Vendor and model' },
  { key: 'tokens', label: 'Prompt tokens', help: 'Tokens this prompt costs on this model' },
  { key: 'context', label: 'Context used', help: 'Share of the context window the prompt fills' },
  { key: 'input', label: 'Input', help: 'Cost of the prompt itself, per call' },
  { key: 'output', label: 'Output', help: 'Cost of the assumed response, per call' },
  { key: 'total', label: 'Per call', help: 'Input plus output, per call' },
  { key: 'perDay', label: 'Per day', help: 'Per-call cost at the assumed daily volume' },
];

/**
 * The full cross-model comparison. Past roughly seven classes a chart stops being
 * readable, so the whole registry lives in a sortable table - and this table is
 * also the chart cards' table twin for cross-model figures.
 */
export function ModelTable({
  rows,
  selectedId,
  onSelect,
  assumptions,
  base,
}: {
  rows: ModelRow[];
  selectedId: string;
  onSelect: (id: string) => void;
  assumptions: CostAssumptions;
  base: BaseEncoding;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'total', dir: 1 });

  const sorted = useMemo(() => {
    const val = (r: ModelRow): number | string => {
      switch (sort.key) {
        case 'label':
          return `${r.model.vendor} ${r.model.label}`;
        case 'tokens':
          return r.tokens;
        case 'context':
          return r.tokens / r.model.context;
        case 'input':
          return r.cost.input;
        case 'output':
          return r.cost.output;
        case 'perDay':
          return r.cost.total * assumptions.callsPerDay;
        default:
          return r.cost.total;
      }
    };
    return [...rows].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv)) * sort.dir;
      }
      return (av - bv) * sort.dir;
    });
  }, [rows, sort, assumptions.callsPerDay]);

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'label' ? 1 : 1 }));

  return (
    <div className="tablewrap">
      <table className="data">
        <caption className="sr-only">
          Token count and cost per model for the current prompt. Select a row to make that
          model the focus of the dashboard.
        </caption>
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                className="sortable"
                title={c.help}
                aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                onClick={() => toggle(c.key)}
              >
                {c.label}
                {sort.key === c.key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ model, tokens, cost }) => {
            const u = utilization(tokens, model.context);
            const exact = isExact(model, base);
            return (
              <tr
                key={model.id}
                className={model.id === selectedId ? 'is-on' : undefined}
                onClick={() => onSelect(model.id)}
                style={{ cursor: 'pointer' }}
              >
                <td>
                  <span className="cell-name">
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ minHeight: 0, padding: 0, fontWeight: 'inherit' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(model.id);
                      }}
                    >
                      {model.label}
                    </button>
                    <span className="cell-vendor">{model.vendor}</span>
                    {model.hostedRate ? (
                      <span className="cell-vendor" title="Open-weight model: rate is a representative serverless host's, not a first-party list price.">
                        hosted
                      </span>
                    ) : null}
                  </span>
                </td>
                <td title={exact ? 'Exact count' : FAMILY_INFO[model.tokenizer].basis}>
                  {exact ? '' : '~'}
                  {num(tokens)}
                </td>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {u.severity !== 'ok' ? <SeverityIcon severity={u.severity} /> : null}
                    {pct(u.fraction, u.fraction < 0.01 ? 2 : 1)}
                  </span>
                </td>
                <td>{usd(cost.input)}</td>
                <td>{usd(cost.output)}</td>
                <td>
                  <b>{usd(cost.total)}</b>
                </td>
                <td>{usd(cost.total * assumptions.callsPerDay)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
