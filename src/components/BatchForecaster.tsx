import { useCallback, useMemo, useRef, useState } from 'react';
import type { Model } from '../lib/models';
import {
  MAX_FILE_BYTES,
  forecastCost,
  forecastToCsv,
  forecastTokens,
  guessPromptColumn,
  parseDataset,
  type ParsedDataset,
} from '../lib/batch';
import { compact, num, usd, usdAxis } from '../lib/format';
import { niceTicks } from '../lib/scale';
import { StatTile } from './primitives';
import { BarRows, type BarDatum } from './charts';

export function BatchForecaster({
  models,
  countTokens,
  scaleTokens,
  maxRows,
  canExport,
}: {
  models: Model[];
  countTokens: (s: string) => number;
  scaleTokens: (model: Model, baseTokens: number) => number;
  maxRows: number;
  canExport: boolean;
}) {
  const [dataset, setDataset] = useState<ParsedDataset | null>(null);
  const [fileName, setFileName] = useState('');
  const [column, setColumn] = useState<string>('');
  const [outputPerRow, setOutputPerRow] = useState(250);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const ingest = useCallback(
    async (file: File) => {
      setError(null);
      setBusy(true);
      try {
        if (file.size > MAX_FILE_BYTES) {
          throw new Error(
            `That file is ${compact(file.size)} bytes. The limit is ${compact(MAX_FILE_BYTES)} — parsing happens in this browser tab.`,
          );
        }
        const text = await file.text();
        const parsed = parseDataset(file.name, text, maxRows);
        if (parsed.rows.length === 0) {
          throw new Error('No rows were parsed. Check the file has a header row and data.');
        }
        setDataset(parsed);
        setFileName(file.name);
        setColumn(guessPromptColumn(parsed) ?? parsed.columns[0] ?? '');
      } catch (err) {
        setDataset(null);
        setError(err instanceof Error ? err.message : 'Could not read that file.');
      } finally {
        setBusy(false);
      }
    },
    [maxRows],
  );

  const forecast = useMemo(() => {
    if (!dataset || !column) return null;
    return forecastTokens(dataset, column, countTokens);
  }, [dataset, column, countTokens]);

  const costs = useMemo(() => {
    if (!forecast) return [];
    return forecastCost(forecast.totalInputTokens, outputPerRow, forecast.rows, models, scaleTokens);
  }, [forecast, outputPerRow, models, scaleTokens]);

  const bars: BarDatum[] = costs.map((c, i) => ({
    key: c.model.id,
    label: c.model.label,
    value: c.total,
    emphasis: i === 0,
  }));

  const cheapest = costs[0];
  const dearest = costs[costs.length - 1];

  return (
    <>
      <section className="card">
        <div className="card__head">
          <h3 className="card__title">Dataset</h3>
          {dataset ? (
            <div className="card__tools">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setDataset(null);
                  setFileName('');
                  setColumn('');
                  setError(null);
                }}
              >
                Clear
              </button>
            </div>
          ) : null}
        </div>
        <p className="card__note">
          CSV, JSONL or NDJSON. The file is parsed in this browser tab and never uploaded —
          which is the point: you are pricing customer prompts before a run.
        </p>

        {!dataset ? (
          <div
            className={dragging ? 'dropzone is-over' : 'dropzone'}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) void ingest(file);
            }}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            role="button"
            tabIndex={0}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.tsv,.jsonl,.ndjson,text/csv,application/json"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void ingest(file);
              }}
            />
            <UploadIcon />
            <p className="dropzone__title">{busy ? 'Reading…' : 'Drop a CSV or JSONL file'}</p>
            <p className="dropzone__hint">
              or click to browse · up to {Number.isFinite(maxRows) ? compact(maxRows) : 'unlimited'} rows
            </p>
          </div>
        ) : (
          <div className="stack">
            <div className="row">
              <span className="badge">{dataset.format.toUpperCase()}</span>
              <strong style={{ fontSize: 13 }}>{fileName}</strong>
              <span className="muted">
                {num(dataset.rows.length)} rows · {dataset.columns.length} columns
              </span>
            </div>

            {dataset.truncated > 0 ? (
              <p className="notice notice--warn">
                {num(dataset.truncated)} rows beyond your plan&apos;s {compact(maxRows)}-row
                limit were not read.
              </p>
            ) : null}
            {dataset.warnings.map((w) => (
              <p key={w} className="notice notice--warn">
                {w}
              </p>
            ))}

            <div className="grid grid--thirds" style={{ marginTop: 0 }}>
              <div className="field">
                <label className="field__label" htmlFor="promptcol">
                  Prompt column
                </label>
                <select
                  id="promptcol"
                  className="select"
                  value={column}
                  onChange={(e) => setColumn(e.target.value)}
                >
                  {dataset.columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field__label" htmlFor="outrow">
                  Expected output tokens per row
                </label>
                <input
                  id="outrow"
                  className="input"
                  type="number"
                  min={0}
                  max={128_000}
                  value={outputPerRow}
                  onChange={(e) => setOutputPerRow(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
            </div>
          </div>
        )}

        {error ? (
          <p className="notice notice--error" style={{ marginTop: 12 }}>
            {error}
          </p>
        ) : null}
      </section>

      {forecast && costs.length > 0 ? (
        <>
          <div className="grid grid--kpi">
            <StatTile label="Rows" value={num(forecast.rows)} foot={forecast.empty > 0 ? `${num(forecast.empty)} empty` : 'All populated'} />
            <StatTile label="Input tokens" value={compact(forecast.totalInputTokens)} foot="o200k baseline, scaled per model" />
            <StatTile label="Median row" value={num(forecast.median)} foot={`${num(forecast.min)}–${num(forecast.max)} tokens`} />
            <StatTile
              label="Cheapest run"
              value={cheapest ? usd(cheapest.total) : '—'}
              foot={cheapest?.model.label}
            />
            <StatTile
              label="Spread"
              value={cheapest && dearest && cheapest.total > 0 ? `${(dearest.total / cheapest.total).toFixed(1)}×` : '—'}
              foot="Dearest vs cheapest"
            />
          </div>

          <section className="card">
            <div className="card__head">
              <h3 className="card__title">Run cost by model</h3>
              {canExport ? (
                <div className="card__tools">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => {
                      const csv = forecastToCsv(costs, forecast.rows);
                      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `batch-forecast-${new Date().toISOString().slice(0, 10)}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Export CSV
                  </button>
                </div>
              ) : null}
            </div>
            <p className="card__note">
              The whole dataset through each model once, at {num(outputPerRow)} output tokens
              per row.
            </p>
            <BarRows
              data={bars}
              valueLabel={(v) => usd(v)}
              axisFormat={usdAxis(niceTicks(Math.max(...bars.map((b) => b.value), 0)))}
            />
          </section>

          <section className="card">
            <div className="card__head">
              <h3 className="card__title">Full breakdown</h3>
            </div>
            <div className="tablewrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Input tokens</th>
                    <th>Output tokens</th>
                    <th>Input</th>
                    <th>Output</th>
                    <th>Total</th>
                    <th>Via batch API</th>
                  </tr>
                </thead>
                <tbody>
                  {costs.map((c) => (
                    <tr key={c.model.id}>
                      <td>
                        <span className="cell-name">
                          {c.model.label}
                          <span className="cell-vendor">{c.model.vendor}</span>
                        </span>
                      </td>
                      <td>{compact(c.inputTokens)}</td>
                      <td>{compact(c.outputTokens)}</td>
                      <td>{usd(c.inputCost)}</td>
                      <td>{usd(c.outputCost)}</td>
                      <td>
                        <b>{usd(c.total)}</b>
                      </td>
                      <td>{c.batchTotal === null ? '—' : usd(c.batchTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}

function UploadIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.5" />
      <path d="M12 15V4M8 8l4-4 4 4" />
    </svg>
  );
}
