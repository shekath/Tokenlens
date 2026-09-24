import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { MODELS, MODELS_BY_ID } from '../lib/models';
import {
  SAMPLE_USAGE_CSV,
  USAGE_FIELDS,
  detectColumns,
  explain,
  mappingProblems,
  reconcile,
  summariseUsage,
  toUsageRows,
  type CacheInclusion,
  type ColumnMap,
  type PlannedWorkload,
  type UsageField,
} from '../lib/reconcile';
import { listEstimates, type SavedEstimate } from '../lib/estimates';
import { MAX_FILE_BYTES } from '../lib/batch';
import { compact, num, pct, usd } from '../lib/format';
import { StatTile } from './primitives';

/** Signed money, with float residue below half a cent shown as zero rather than "+<$0.000001". */
function signedUsd(n: number): string {
  if (Math.abs(n) < 0.005) return usd(0);
  return `${n > 0 ? '+' : '−'}${usd(Math.abs(n))}`;
}

interface Loaded {
  name: string;
  headers: string[];
  records: Array<Record<string, string>>;
  sample: boolean;
}

interface Pick {
  on: boolean;
  callsPerDay: number;
}

/**
 * Estimated against actual. A provider's usage export is parsed here, in the
 * tab - never uploaded - priced, and set against the saved estimates the user
 * says describe that workload. The engine, and the reasoning for splitting the
 * variance the way it does, is lib/reconcile.ts.
 */
export function Reconcile({ userId, defaultCallsPerDay }: { userId: string | null; defaultCallsPerDay: number }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [map, setMap] = useState<ColumnMap>({});
  const [inclusion, setInclusion] = useState<CacheInclusion>('auto');
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [periodDays, setPeriodDays] = useState(30);
  const [estimates, setEstimates] = useState<SavedEstimate[] | null>(null);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    if (!userId) {
      setEstimates([]);
      return;
    }
    listEstimates(userId)
      .then((rows) => {
        if (!live) return;
        setEstimates(rows);
        setPicks(
          Object.fromEntries(
            rows.map((e) => {
              const saved = Number((e.promptMetadata as { callsPerDay?: unknown }).callsPerDay);
              return [e.id, { on: false, callsPerDay: Number.isFinite(saved) && saved > 0 ? saved : defaultCallsPerDay }];
            }),
          ),
        );
      })
      .catch(() => live && setEstimates([]));
    return () => {
      live = false;
    };
  }, [userId, defaultCallsPerDay]);

  const take = useCallback((name: string, text: string, sample: boolean) => {
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
    });
    const headers = parsed.meta.fields ?? [];
    if (headers.length === 0 || parsed.data.length === 0) {
      throw new Error('No rows found. The export needs a header row and at least one data row.');
    }
    setLoaded({ name, headers, records: parsed.data, sample });
    setMap(detectColumns(headers));
    setOverrides({});
    setError(null);
  }, []);

  const ingest = useCallback(
    async (file: File) => {
      try {
        if (file.size > MAX_FILE_BYTES) {
          throw new Error(`That file is ${compact(file.size)} bytes; the limit is ${compact(MAX_FILE_BYTES)}.`);
        }
        take(file.name, await file.text(), false);
      } catch (err) {
        setLoaded(null);
        setError(err instanceof Error ? err.message : 'Could not read that file.');
      }
    },
    [take],
  );

  const problems = loaded ? mappingProblems(map) : [];
  const usage = useMemo(() => {
    if (!loaded || mappingProblems(map).length > 0) return null;
    const { rows, skipped } = toUsageRows(loaded.records, map);
    return { summary: summariseUsage(rows, MODELS, { cacheInclusion: inclusion, overrides }), skipped };
  }, [loaded, map, inclusion, overrides]);

  const days = usage?.summary.days ?? periodDays;
  const plans: PlannedWorkload[] = (estimates ?? [])
    .filter((e) => picks[e.id]?.on)
    .map((e) => ({
      id: e.id,
      title: e.projectTitle,
      modelId: e.modelId,
      inputTokens: e.inputTokens,
      outputTokens: e.outputTokens,
      costPerCall: e.estimatedCostUsd,
      callsPerDay: picks[e.id]!.callsPerDay,
    }));
  const result = usage ? reconcile(usage.summary, plans, days) : null;
  const causes = result ? explain(result, usd) : [];
  const unmatched = usage?.summary.byModel.filter((g) => !g.model) ?? [];

  const setField = (field: UsageField, column: string) =>
    setMap((prev) => {
      const next = { ...prev };
      if (column) next[field] = column;
      else delete next[field];
      return next;
    });

  return (
    <>
      <section className="card">
        <div className="card__head">
          <h3 className="card__title">Usage export</h3>
          <div className="card__tools">
            {loaded ? (
              <button type="button" className="btn btn--ghost" onClick={() => setLoaded(null)}>
                Clear
              </button>
            ) : (
              <button type="button" className="btn btn--ghost" onClick={() => take('sample-usage.csv', SAMPLE_USAGE_CSV, true)}>
                Try a sample
              </button>
            )}
          </div>
        </div>
        <p className="card__note">
          A CSV of daily or per-request usage from your provider&apos;s console or usage API. It
          is read in this tab and never uploaded. Columns are matched by name; check the mapping
          below — exports differ by provider and change without notice.
        </p>

        {!loaded ? (
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
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void ingest(file);
              }}
            />
            <p className="dropzone__title">Drop a usage export (CSV)</p>
            <p className="dropzone__hint">or click to browse</p>
          </div>
        ) : (
          <div className="stack">
            <div className="row">
              {loaded.sample ? <span className="badge">Sample data</span> : null}
              <strong style={{ fontSize: 13 }}>{loaded.name}</strong>
              <span className="muted">
                {num(loaded.records.length)} rows · {loaded.headers.length} columns
                {usage && usage.skipped > 0 ? ` · ${num(usage.skipped)} skipped (no model or unreadable numbers)` : ''}
              </span>
            </div>

            <div className="mapgrid">
              {USAGE_FIELDS.map(({ field, label, required }) => (
                <div className="field" key={field}>
                  <label className="field__label" htmlFor={`map-${field}`}>
                    {label}
                    {required ? ' *' : ''}
                  </label>
                  <select
                    id={`map-${field}`}
                    className="select"
                    value={map[field] ?? ''}
                    onChange={(e) => setField(field, e.target.value)}
                  >
                    <option value="">—</option>
                    {loaded.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <div className="field">
                <label className="field__label" htmlFor="map-incl">
                  Cached reads inside input?
                </label>
                <select
                  id="map-incl"
                  className="select"
                  value={inclusion}
                  title="OpenAI counts cached tokens inside input tokens; Anthropic reports them separately. Getting this wrong double-charges the cached part."
                  onChange={(e) => setInclusion(e.target.value as CacheInclusion)}
                >
                  <option value="auto">Auto, by vendor</option>
                  <option value="included">Yes</option>
                  <option value="separate">No</option>
                </select>
              </div>
              {usage && usage.summary.days === null ? (
                <div className="field">
                  <label className="field__label" htmlFor="map-days">
                    Days this export covers
                  </label>
                  <input
                    id="map-days"
                    className="input"
                    type="number"
                    min={1}
                    max={366}
                    value={periodDays}
                    onChange={(e) => setPeriodDays(Math.max(1, Math.min(366, Number(e.target.value) || 1)))}
                  />
                </div>
              ) : null}
            </div>

            {problems.map((p) => (
              <p key={p} className="notice notice--warn">
                {p}
              </p>
            ))}
          </div>
        )}

        {error ? (
          <p className="notice notice--error" style={{ marginTop: 12 }}>
            {error}
          </p>
        ) : null}
      </section>

      <section className="card">
        <div className="card__head">
          <h3 className="card__title">Estimates to compare</h3>
        </div>
        <p className="card__note">
          Tick the saved estimates that describe this workload, and the daily volume each one
          assumed. Estimates saved from now on remember their volume.
        </p>
        {estimates === null ? (
          <p className="muted">Loading your saved estimates…</p>
        ) : estimates.length === 0 ? (
          <div className="empty">
            No saved estimates yet. Price a prompt on the Analyse tab and save it from the Saved
            tab — then this compares it with what you were billed.
          </div>
        ) : (
          <ul className="estpick">
            {estimates.map((e) => {
              const p = picks[e.id] ?? { on: false, callsPerDay: defaultCallsPerDay };
              return (
                <li key={e.id}>
                  <label className="estpick__name">
                    <input
                      type="checkbox"
                      checked={p.on}
                      onChange={() => setPicks((prev) => ({ ...prev, [e.id]: { ...p, on: !p.on } }))}
                    />
                    <span>
                      {e.projectTitle}{' '}
                      <span className="muted">
                        · {MODELS_BY_ID[e.modelId]?.label ?? e.modelId} · {usd(e.estimatedCostUsd)}/call
                      </span>
                    </span>
                  </label>
                  <span className="estpick__calls">
                    <input
                      className="input"
                      type="number"
                      min={0}
                      aria-label={`Calls per day for ${e.projectTitle}`}
                      value={p.callsPerDay}
                      onChange={(ev) =>
                        setPicks((prev) => ({ ...prev, [e.id]: { ...p, callsPerDay: Math.max(0, Number(ev.target.value) || 0) } }))
                      }
                    />
                    calls/day
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {usage && result ? (
        <>
          <div className="grid grid--kpi">
            <StatTile
              label="Estimated"
              value={plans.length === 0 ? '—' : usd(result.estimatedTotal)}
              foot={plans.length === 0 ? 'No estimate ticked' : `${num(plans.length)} estimate${plans.length === 1 ? '' : 's'} over ${num(days)} days`}
            />
            <StatTile label="Actual" value={usd(result.actualTotal)} foot={usage.summary.firstDate ? `${usage.summary.firstDate} to ${usage.summary.lastDate}` : `${num(days)} days`} />
            {/* With nothing ticked there is no plan, so there is no variance -
                showing the whole bill as a red overspend would say otherwise. */}
            <StatTile
              label="Variance"
              value={
                plans.length === 0 ? (
                  '—'
                ) : (
                  <span className={result.delta > 0 ? 'delta-up' : result.delta < 0 ? 'delta-down' : undefined}>
                    {result.delta >= 0 ? '+' : '−'}
                    {usd(Math.abs(result.delta))}
                  </span>
                )
              }
              foot={
                result.deltaFraction === null
                  ? 'Tick an estimate to compare'
                  : `${result.delta >= 0 ? '+' : '−'}${pct(Math.abs(result.deltaFraction), 0)} against plan`
              }
            />
            <StatTile
              label="Per month"
              value={usd((result.actualTotal / days) * 30)}
              foot="Actual, at this export's daily rate"
            />
          </div>

          {usage.summary.unpricedRows > 0 || unmatched.length > 0 ? (
            <section className="card">
              <div className="card__head">
                <h3 className="card__title">Models we could not match</h3>
              </div>
              <p className="card__note">
                These names are not in the rate card and the export has no cost for them, so they
                are not priced — rather than priced at a similar model&apos;s rate. Map a fine-tune
                or alias to the model it bills as.
              </p>
              <div className="mapgrid">
                {unmatched.flatMap((g) =>
                  g.rawNames.map((raw) => (
                    <div className="field" key={raw}>
                      <label className="field__label" htmlFor={`ov-${raw}`}>
                        {raw}
                      </label>
                      <select
                        id={`ov-${raw}`}
                        className="select"
                        value={overrides[raw] ?? ''}
                        onChange={(e) => setOverrides((prev) => ({ ...prev, [raw]: e.target.value }))}
                      >
                        <option value="">Not priced</option>
                        {MODELS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )),
                )}
              </div>
            </section>
          ) : null}

          <section className="card">
            <div className="card__head">
              <h3 className="card__title">What drove the difference</h3>
            </div>
            {plans.length === 0 ? (
              <div className="empty">Tick at least one estimate above to see where the plan and the bill part ways.</div>
            ) : causes.length === 0 ? (
              <div className="empty">Spend matched the plan to within a cent.</div>
            ) : (
              <ol className="causes">
                {causes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ol>
            )}
          </section>

          <section className="card">
            <div className="card__head">
              <h3 className="card__title">By model</h3>
            </div>
            <p className="card__note">
              Volume effect is extra (or fewer) calls at the planned cost per call; per-call effect
              is what each call cost beyond plan. The two add up to the variance.
              {usage.summary.byModel.some((g) => g.costSource === 'rates' || g.costSource === 'mixed')
                ? ' Rows without a cost column are priced at list rates.'
                : ''}
            </p>
            <div className="tablewrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Estimated</th>
                    <th>Actual</th>
                    <th>Variance</th>
                    <th>Calls (plan → actual)</th>
                    <th>Volume effect</th>
                    <th>Per-call effect</th>
                  </tr>
                </thead>
                <tbody>
                  {result.lines.map((l) => (
                    <tr key={l.key}>
                      <td>
                        <span className="cell-name">
                          {l.label}
                          <span className="cell-vendor">
                            {l.status === 'planned' ? 'planned' : l.status === 'unplanned' ? 'not in any estimate' : 'estimated, unused'}
                          </span>
                        </span>
                      </td>
                      <td>{usd(l.estimated)}</td>
                      <td>{usd(l.actual)}</td>
                      <td className={l.delta >= 0.005 ? 'delta-up' : l.delta <= -0.005 ? 'delta-down' : undefined}>
                        {signedUsd(l.delta)}
                      </td>
                      <td>
                        {compact(l.estCalls)} → {l.actualCalls === null ? '?' : compact(l.actualCalls)}
                      </td>
                      <td>{l.volumeEffect === null ? '—' : signedUsd(l.volumeEffect)}</td>
                      <td>{l.perCallEffect === null ? '—' : signedUsd(l.perCallEffect)}</td>
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
