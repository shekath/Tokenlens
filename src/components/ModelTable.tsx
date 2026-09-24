import { useId, useMemo, useState } from 'react';
import { VENDORS, type Model, type Vendor } from '../lib/models';
import { filterModels, vendorCounts } from '../lib/modelFilter';
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
  const [query, setQuery] = useState('');
  const [vendors, setVendors] = useState<ReadonlySet<Vendor>>(() => new Set());
  const searchId = useId();

  const companies = useMemo(() => vendorCounts(rows, VENDORS), [rows]);
  const visible = useMemo(() => filterModels(rows, query, vendors), [rows, query, vendors]);
  const filtering = query.trim() !== '' || vendors.size > 0;
  const toggleVendor = (v: Vendor) =>
    setVendors((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  const clear = () => {
    setQuery('');
    setVendors(new Set());
  };

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
    return [...visible].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv)) * sort.dir;
      }
      return (av - bv) * sort.dir;
    });
  }, [visible, sort, assumptions.callsPerDay]);

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'label' ? 1 : 1 }));

  return (
    <>
      <div className="modelfilter">
        <div className="modelfilter__search">
          <label className="sr-only" htmlFor={searchId}>
            Search models
          </label>
          <SearchIcon />
          <input
            id={searchId}
            className="input"
            type="search"
            placeholder="Search models, e.g. gpt 5.4, sonnet, gemini flash"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery('');
            }}
          />
        </div>
        {companies.length > 1 ? (
          <div className="modelfilter__chips" role="group" aria-label="Filter by AI company">
            <button
              type="button"
              className={vendors.size === 0 ? 'chip is-on' : 'chip'}
              aria-pressed={vendors.size === 0}
              onClick={() => setVendors(new Set())}
            >
              All <span className="chip__count">{rows.length}</span>
            </button>
            {companies.map(({ vendor, count }) => (
              <button
                key={vendor}
                type="button"
                className={vendors.has(vendor) ? 'chip is-on' : 'chip'}
                aria-pressed={vendors.has(vendor)}
                onClick={() => toggleVendor(vendor)}
              >
                {vendor} <span className="chip__count">{count}</span>
              </button>
            ))}
          </div>
        ) : null}
        <p className="modelfilter__status" aria-live="polite">
          {filtering ? (
            <>
              Showing {visible.length} of {rows.length} models
              {' · '}
              <button type="button" className="linkbtn" onClick={clear}>
                Clear filters
              </button>
            </>
          ) : (
            `${rows.length} models`
          )}
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          No model matches{query.trim() ? ` “${query.trim()}”` : ''}
          {vendors.size > 0 ? ` from ${[...vendors].join(', ')}` : ''}.{' '}
          <button type="button" className="linkbtn" onClick={clear}>
            Clear filters
          </button>
        </div>
      ) : (
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
      )}
    </>
  );
}

function SearchIcon() {
  return (
    <svg className="modelfilter__icon" width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
