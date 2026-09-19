import { useMemo, useState } from 'react';
import type { Model } from '../lib/models';
import {
  DEFAULT_CACHE_INPUTS,
  breakEvenCallCount,
  breakEvenHitRate,
  hitRateCurve,
  simulate,
  supportsCaching,
  volumeCurve,
  type CacheInputs,
} from '../lib/cacheSim';
import { compact, num, pct, usd, usdAxis } from '../lib/format';
import { niceTicks } from '../lib/scale';
import { ChartCard, Legend, StatTile, TipRow, Tooltip, useTooltip } from './primitives';
import { useWidth } from './useWidth';

/**
 * Break-even simulator.
 *
 * Two lines on one axis, both in dollars, so they are directly comparable - the
 * crossing point is the answer and it has to be readable at a glance. The
 * break-even hit rate is also stated as a number, because it depends only on the
 * published rates and is the one figure worth remembering.
 */
export function CacheSimulator({
  model,
  models,
  onModel,
  seedFreshTokens,
}: {
  model: Model;
  models: Model[];
  onModel: (id: string) => void;
  seedFreshTokens: number;
}) {
  const [input, setInput] = useState<CacheInputs>({
    ...DEFAULT_CACHE_INPUTS,
    freshTokens: seedFreshTokens > 0 ? seedFreshTokens : DEFAULT_CACHE_INPUTS.freshTokens,
  });
  const [view, setView] = useState<'chart' | 'table'>('chart');

  const set = <K extends keyof CacheInputs>(k: K, v: CacheInputs[K]) =>
    setInput((prev) => ({ ...prev, [k]: v }));

  const outcome = useMemo(() => simulate(model, input), [model, input]);
  const curve = useMemo(() => hitRateCurve(model, input), [model, input]);
  const volumes = useMemo(() => volumeCurve(model, input), [model, input]);
  const breakEven = breakEvenHitRate(model);
  const breakEvenCalls = breakEvenCallCount(model);
  const supported = supportsCaching(model);

  const cacheable = models.filter(supportsCaching);

  return (
    <>
      <section className="card">
        <div className="card__head">
          <h3 className="card__title">Workload</h3>
          <div className="card__tools">
            <label className="sr-only" htmlFor="cache-model">
              Model
            </label>
            <select
              id="cache-model"
              className="select"
              value={model.id}
              onChange={(e) => onModel(e.target.value)}
            >
              {cacheable.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="card__note">
          Split the prompt into the part that changes every call and the stable prefix a
          cache can hold — the system prompt, tool definitions, pinned documents.
        </p>

        <div className="grid grid--thirds" style={{ marginTop: 0 }}>
          <NumField
            id="fresh"
            label="Fresh tokens per call"
            value={input.freshTokens}
            onChange={(v) => set('freshTokens', v)}
            hint="Never cacheable"
          />
          <NumField
            id="cachedtok"
            label="Cacheable prefix tokens"
            value={input.cachedTokens}
            onChange={(v) => set('cachedTokens', v)}
            hint="The stable part"
          />
          <NumField
            id="outtok"
            label="Output tokens per call"
            value={input.outputTokens}
            onChange={(v) => set('outputTokens', v)}
            hint="Unchanged by caching"
          />
          <NumField
            id="invocations"
            label="Invocations"
            value={input.invocations}
            onChange={(v) => set('invocations', v)}
            hint="Over the period modelled"
            max={10_000_000}
          />
          <div className="field field--wide">
            <label className="field__label" htmlFor="hitrate">
              Cache hit rate — {pct(input.hitRate, 0)}
            </label>
            <input
              id="hitrate"
              className="slider"
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(input.hitRate * 100)}
              onChange={(e) => set('hitRate', Number(e.target.value) / 100)}
            />
            {breakEven !== null ? (
              <span className="muted" style={{ fontSize: 11 }}>
                Break-even is {pct(breakEven, 1)}. Below it, caching costs more than not
                caching.
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {!supported ? (
        <div className="notice notice--warn" style={{ marginTop: 14 }}>
          {model.label} publishes no prompt-cache rates, so there is nothing to simulate.
          Pick a model that does.
        </div>
      ) : null}

      <div className="grid grid--kpi">
        <StatTile
          label="Break-even hit rate"
          value={breakEven === null ? '—' : pct(breakEven, 1)}
          foot="Depends only on the published rates, not on volume"
        />
        <StatTile
          label="Calls per cache entry to pay off"
          value={breakEvenCalls === null || !Number.isFinite(breakEvenCalls) ? '—' : num(breakEvenCalls)}
          foot="First call writes, the rest read within the TTL"
        />
        <StatTile
          label="Cost without caching"
          value={usd(outcome.uncached)}
          foot={`${compact(input.invocations)} calls`}
        />
        <StatTile
          label="Cost with caching"
          value={usd(outcome.cached)}
          foot={
            outcome.delta <= 0
              ? `Saves ${usd(-outcome.delta)} (${pct(outcome.savedFraction, 1)})`
              : `Costs ${usd(outcome.delta)} more at this hit rate`
          }
        />
      </div>

      <ChartCard
        title="Cost against cache hit rate"
        note="Both lines are dollars on one axis, so where they cross is the break-even point. The flat line is the same traffic with no caching at all."
        view={view}
        onView={setView}
        table={
          <div className="tablewrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Hit rate</th>
                  <th>With caching</th>
                  <th>Without</th>
                  <th>Difference</th>
                </tr>
              </thead>
              <tbody>
                {curve
                  .filter((_, i) => i % 2 === 0)
                  .map((p) => (
                    <tr key={p.hitRate}>
                      <td>{pct(p.hitRate, 0)}</td>
                      <td>{usd(p.cached)}</td>
                      <td>{usd(p.uncached)}</td>
                      <td style={p.cached <= p.uncached ? { color: 'var(--success-text)' } : undefined}>
                        {p.cached <= p.uncached ? '−' : '+'}
                        {usd(Math.abs(p.uncached - p.cached))}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        }
      >
        <BreakEvenChart curve={curve} breakEven={breakEven} />
      </ChartCard>

      <section className="card">
        <div className="card__head">
          <h3 className="card__title">At other volumes</h3>
        </div>
        <p className="card__note">
          The same prompt shape and hit rate, scaled. Caching is a multiplier — it does
          not change which side of break-even you are on.
        </p>
        <div className="tablewrap">
          <table className="data">
            <thead>
              <tr>
                <th>Invocations</th>
                <th>Without caching</th>
                <th>With caching</th>
                <th>Saved</th>
              </tr>
            </thead>
            <tbody>
              {volumes.map((v) => (
                <tr key={v.invocations}>
                  <td>{compact(v.invocations)}</td>
                  <td>{usd(v.uncached)}</td>
                  <td>{usd(v.cached)}</td>
                  <td
                    style={
                      v.cached <= v.uncached ? { color: 'var(--success-text)', fontWeight: 600 } : undefined
                    }
                  >
                    {v.uncached > 0 ? pct(1 - v.cached / v.uncached, 1) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function NumField({
  id,
  label,
  value,
  onChange,
  hint,
  max = 2_000_000,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
  max?: number;
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
      />
      {hint ? (
        <span className="muted" style={{ fontSize: 11 }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** Two lines, one dollar axis, with the crossing marked. */
function BreakEvenChart({
  curve,
  breakEven,
}: {
  curve: Array<{ hitRate: number; cached: number; uncached: number }>;
  breakEven: number | null;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const { tip, onPointer, hide } = useTooltip<{ hitRate: number; cached: number; uncached: number }>();

  const H = 240;
  const padT = 16;
  const padB = 34;
  const max = Math.max(...curve.flatMap((p) => [p.cached, p.uncached]), 0);
  const ticks = niceTicks(max, 4);
  const axisMax = ticks[ticks.length - 1] || 1;
  const fmtAxis = usdAxis(ticks);
  const padL = Math.max(...ticks.map((t) => fmtAxis(t).length * 6.6), 30) + 12;
  const plotW = Math.max(20, W - padL - 12);
  const plotH = H - padT - padB;

  const x = (hitRate: number) => padL + hitRate * plotW;
  const y = (v: number) => padT + plotH - (v / axisMax) * plotH;

  const path = (key: 'cached' | 'uncached') =>
    curve.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.hitRate).toFixed(1)},${y(p[key]).toFixed(1)}`).join('');

  const nearest = (clientX: number, rect: DOMRect) => {
    const rel = (clientX - rect.left - padL) / plotW;
    const idx = Math.round(Math.max(0, Math.min(1, rel)) * (curve.length - 1));
    return curve[idx]!;
  };

  return (
    <>
      <div ref={ref}>
        <svg
          className="chart"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Cost with and without caching across the cache hit rate"
          onMouseLeave={hide}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            onPointer(e, nearest(e.clientX, rect));
          }}
        >
          <g className="chart__grid">
            {ticks.map((t) => (
              <line key={t} x1={padL} x2={W - 12} y1={y(t)} y2={y(t)} />
            ))}
          </g>
          {ticks.map((t) => (
            <text key={t} x={padL - 8} y={y(t)} textAnchor="end" dominantBaseline="central">
              {fmtAxis(t)}
            </text>
          ))}

          {breakEven !== null && breakEven > 0 && breakEven < 1 ? (
            <g>
              <line
                x1={x(breakEven)}
                x2={x(breakEven)}
                y1={padT}
                y2={padT + plotH}
                stroke="var(--baseline)"
                strokeWidth="1"
              />
              <text
                x={x(breakEven) + 5}
                y={padT + 10}
                className="chart__value"
                style={{ fill: 'var(--text-secondary)' }}
              >
                break-even {pct(breakEven, 0)}
              </text>
            </g>
          ) : null}

          <path d={path('uncached')} fill="none" stroke="var(--series-muted)" strokeWidth="2" strokeLinejoin="round" />
          <path d={path('cached')} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" />

          {tip ? (
            <g>
              <circle cx={x(tip.data.hitRate)} cy={y(tip.data.cached)} r="4.5" fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth="2" />
              <circle cx={x(tip.data.hitRate)} cy={y(tip.data.uncached)} r="4.5" fill="var(--series-muted)" stroke="var(--surface-1)" strokeWidth="2" />
            </g>
          ) : null}

          <line className="chart__axis" x1={padL} x2={W - 12} y1={padT + plotH} y2={padT + plotH} />
          {[0, 0.25, 0.5, 0.75, 1].map((h) => (
            <text key={h} x={x(h)} y={H - padB + 16} textAnchor={h === 0 ? 'start' : h === 1 ? 'end' : 'middle'}>
              {pct(h, 0)}
            </text>
          ))}
          <text x={padL + plotW / 2} y={H - 6} textAnchor="middle">
            cache hit rate
          </text>
        </svg>
      </div>
      <Legend
        items={[
          { label: 'With caching', color: 'var(--series-1)' },
          { label: 'No caching', color: 'var(--series-muted)' },
        ]}
      />
      {tip ? (
        <Tooltip x={tip.x} y={tip.y}>
          <div className="tip__title">{pct(tip.data.hitRate, 0)} hit rate</div>
          <TipRow label="With caching" value={usd(tip.data.cached)} />
          <TipRow label="No caching" value={usd(tip.data.uncached)} />
          <TipRow
            label="Difference"
            value={`${tip.data.cached <= tip.data.uncached ? '−' : '+'}${usd(Math.abs(tip.data.uncached - tip.data.cached))}`}
          />
        </Tooltip>
      ) : null}
    </>
  );
}
