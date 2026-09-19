import { useCallback, useState, type ReactNode } from 'react';
import type { Severity } from '../lib/cost';

/* ------------------------------------------------------------------ tooltip */

interface TipState<T> {
  x: number;
  y: number;
  data: T;
}

/**
 * Hover + keyboard-focus tooltip. Focus is wired alongside hover so a keyboard
 * user sees exactly what a pointer user sees - a tooltip is never the only way
 * to read a value, but it must not be pointer-only either.
 */
export function useTooltip<T>() {
  const [tip, setTip] = useState<TipState<T> | null>(null);

  const onPointer = useCallback((e: { clientX: number; clientY: number }, data: T) => {
    setTip({ x: e.clientX, y: e.clientY, data });
  }, []);

  const onFocus = useCallback((el: Element | null, data: T) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, y: r.top + r.height / 2, data });
  }, []);

  const hide = useCallback(() => setTip(null), []);

  return { tip, onPointer, onFocus, hide };
}

export function Tooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  // Flip to the left / above when the pointer is near the viewport edge.
  const flipX = x > window.innerWidth - 280;
  const flipY = y > window.innerHeight - 140;
  const style: React.CSSProperties = {
    left: flipX ? undefined : x + 14,
    right: flipX ? window.innerWidth - x + 14 : undefined,
    top: flipY ? undefined : y + 14,
    bottom: flipY ? window.innerHeight - y + 14 : undefined,
  };
  return (
    <div className="tip" style={style} role="tooltip">
      {children}
    </div>
  );
}

export function TipRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="tip__row">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

/* --------------------------------------------------------------- stat tile */

export function StatTile({
  label,
  value,
  foot,
  badge,
  hero = false,
}: {
  label: string;
  value: ReactNode;
  foot?: ReactNode;
  badge?: ReactNode;
  hero?: boolean;
}) {
  return (
    <div className="tile">
      <span className="tile__label">
        {label}
        {badge}
      </span>
      <span className={hero ? 'tile__value tile__value--hero' : 'tile__value'}>{value}</span>
      {foot ? <span className="tile__foot">{foot}</span> : null}
    </div>
  );
}

/* -------------------------------------------------------------------- meter */

const SEVERITY_VAR: Record<Severity, string> = {
  ok: 'var(--series-1)',
  warning: 'var(--warning)',
  serious: 'var(--serious)',
  critical: 'var(--critical)',
};

const SEVERITY_LABEL: Record<Severity, string> = {
  ok: 'within budget',
  warning: 'over 70% full',
  serious: 'over 90% full',
  critical: 'exceeds the context window',
};

/**
 * Ratio-against-a-limit meter. The fill carries severity; the track is a lighter
 * step of the same blue ramp so the state reads across the whole bar. Severity is
 * never colour-alone - the row always states the percentage, and past 70% it
 * carries an icon and the words too.
 */
export function Meter({
  name,
  fraction,
  severity,
  value,
  extra,
}: {
  name: ReactNode;
  fraction: number;
  severity: Severity;
  value: string;
  extra?: ReactNode;
}) {
  const clamped = Math.max(0, Math.min(1, fraction));
  return (
    <div className="meter">
      <div className="meter__row">
        <span className="meter__name">{name}</span>
        {severity !== 'ok' ? (
          <span className="badge" style={{ borderColor: SEVERITY_VAR[severity] }}>
            <SeverityIcon severity={severity} />
            {SEVERITY_LABEL[severity]}
          </span>
        ) : null}
        <span className="meter__value">{value}</span>
      </div>
      <div
        className="meter__track"
        role="meter"
        aria-valuenow={Math.round(fraction * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${typeof name === 'string' ? name : 'Context'} utilisation, ${SEVERITY_LABEL[severity]}`}
      >
        <div
          className="meter__fill"
          style={{ width: `${clamped * 100}%`, background: SEVERITY_VAR[severity] }}
        />
      </div>
      {extra}
    </div>
  );
}

export function SeverityIcon({ severity }: { severity: Severity }) {
  if (severity === 'ok') {
    return (
      <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
        <path
          d="M2.5 6.5 4.8 8.8 9.5 3.5"
          fill="none"
          stroke={SEVERITY_VAR.ok}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M6 1.4 11.2 10.6H0.8L6 1.4Z"
        fill="none"
        stroke={SEVERITY_VAR[severity]}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M6 4.6v2.6" stroke={SEVERITY_VAR[severity]} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="6" cy="8.9" r="0.7" fill={SEVERITY_VAR[severity]} />
    </svg>
  );
}

/* ------------------------------------------------------------------- badges */

export function ExactBadge({ exact, title }: { exact: boolean; title?: string }) {
  return (
    <span className={exact ? 'badge badge--exact' : 'badge badge--est'} title={title}>
      {exact ? 'exact' : 'estimate'}
    </span>
  );
}

/* ------------------------------------------------------------------- legend */

export interface LegendItem {
  label: string;
  color: string;
  value?: string;
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="legend">
      {items.map((it) => (
        <li key={it.label}>
          <span className="legend__swatch" style={{ background: it.color }} aria-hidden="true" />
          {it.label}
          {it.value ? <span className="muted">{it.value}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- card ---- */

/**
 * A chart card with a chart/table toggle. Every chart ships a table twin: it is
 * the WCAG-clean equivalent, and it is the documented relief for the three
 * light-mode categorical slots that sit below 3:1 against the surface.
 */
export function ChartCard({
  title,
  note,
  view,
  onView,
  children,
  table,
  extraTools,
}: {
  title: string;
  note?: ReactNode;
  view: 'chart' | 'table';
  onView: (v: 'chart' | 'table') => void;
  children: ReactNode;
  table: ReactNode;
  extraTools?: ReactNode;
}) {
  return (
    <section className="card">
      <div className="card__head">
        <h3 className="card__title">{title}</h3>
        <div className="card__tools">
          {extraTools}
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            aria-label={view === 'chart' ? 'Show as a table' : 'Show as a chart'}
            aria-pressed={view === 'table'}
            title={view === 'chart' ? 'Show as a table' : 'Show as a chart'}
            onClick={() => onView(view === 'chart' ? 'table' : 'chart')}
          >
            {view === 'chart' ? <TableIcon /> : <ChartIcon />}
          </button>
        </div>
      </div>
      {note ? <p className="card__note">{note}</p> : null}
      {view === 'chart' ? children : table}
    </section>
  );
}

function TableIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
      <path d="M2 6.2h12M6.5 6.2v7.3" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M2.5 13.5h11" />
      <path d="M4.5 13.5v-4M8 13.5V4M11.5 13.5v-6.5" />
    </svg>
  );
}
