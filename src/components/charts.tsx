import type { ReactNode } from 'react';
import { TipRow, Tooltip, useTooltip } from './primitives';
import { useWidth } from './useWidth';
import { barPath, clipText, estWidth, niceTicks } from '../lib/scale';

const MAX_BAR = 24; // mark spec: never fill the band, let the leftover be air
const GAP = 2; // the surface gap does the separating between adjacent marks

/* ------------------------------------------------------- horizontal bars -- */

export interface BarDatum {
  key: string;
  label: string;
  sublabel?: string;
  value: number;
  /** Emphasised rows take the accent hue; everything else is context grey. */
  emphasis?: boolean;
  tip?: ReactNode;
}

/**
 * Emphasis bar chart. One measure, one hue: the row in focus wears the accent and
 * the rest recede to grey, so the chart says "this one" instead of asking the
 * reader to decode eight colours.
 */
export function BarRows({
  data,
  valueLabel,
  axisFormat,
  onSelect,
}: {
  data: BarDatum[];
  valueLabel: (v: number) => string;
  axisFormat: (v: number) => string;
  onSelect?: (key: string) => void;
}) {
  const { tip, onPointer, onFocus, hide } = useTooltip<BarDatum>();
  const [ref, W] = useWidth<HTMLDivElement>();

  const rowH = MAX_BAR + 12;
  const plotTop = 4;
  const axisH = 22;
  const height = plotTop + data.length * rowH + axisH;

  const max = Math.max(...data.map((d) => d.value), 0);
  const ticks = niceTicks(max);
  const axisMax = ticks[ticks.length - 1] || 1;

  // Both gutters are sized from the content they have to hold, so the longest bar
  // ends with its value still on the canvas. Narrow cards get a tighter name
  // column; below that the name is truncated rather than allowed to push the plot
  // off the edge.
  const nameWidth = Math.max(...data.map((d) => estWidth(d.label, 11)), 40) + 14;
  const labelWidth = Math.min(nameWidth, Math.max(72, W * 0.32));
  const valueWidth = Math.max(...data.map((d) => estWidth(valueLabel(d.value), 11)), 24) + 10;
  const padRight = Math.min(valueWidth, W * 0.3);
  const plotW = Math.max(16, W - labelWidth - padRight);
  const scale = (v: number) => (axisMax > 0 ? (v / axisMax) * plotW : 0);

  // 10px of the name gutter is the gap to the axis, so the text gets the rest.
  const nameSpace = labelWidth - 10;

  return (
    <>
      <div ref={ref}>
        <svg
          className="chart"
          width={W}
          height={height}
          viewBox={`0 0 ${W} ${height}`}
          role="img"
          aria-label={`Bar chart, ${data.length} models, maximum ${valueLabel(max)}`}
          onMouseLeave={hide}
        >
          <g className="chart__grid">
            {ticks.map((t) => (
              <line
                key={t}
                x1={labelWidth + scale(t)}
                x2={labelWidth + scale(t)}
                y1={plotTop}
                y2={plotTop + data.length * rowH}
              />
            ))}
          </g>

          {data.map((d, i) => {
            const y = plotTop + i * rowH + GAP;
            const h = rowH - GAP * 2;
            const w = scale(d.value);
            const fill = d.emphasis ? 'var(--series-1)' : 'var(--series-muted)';
            const vLabel = valueLabel(d.value);
            // The value rides just past the bar end when there is room for it;
            // otherwise it sits inside the end and the tooltip carries the rest.
            const outsideFits = labelWidth + w + 6 + estWidth(vLabel) <= W;
            return (
              <g
                key={d.key}
                className="chart__row"
                tabIndex={0}
                role={onSelect ? 'button' : undefined}
                aria-label={`${d.label}: ${vLabel}`}
                onMouseMove={(e) => onPointer(e, d)}
                onFocus={(e) => onFocus(e.currentTarget, d)}
                onBlur={hide}
                onClick={() => onSelect?.(d.key)}
                onKeyDown={(e) => {
                  if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onSelect(d.key);
                  }
                }}
                style={{ cursor: onSelect ? 'pointer' : 'default' }}
              >
                {/* Hit area spans the whole row so the target is never pinpoint. */}
                <rect className="chart__hit" x={0} y={plotTop + i * rowH} width={W} height={rowH} />
                <title>{`${d.label}: ${vLabel}`}</title>
                <text
                  className={d.emphasis ? 'chart__cat chart__cat--on' : 'chart__cat'}
                  x={labelWidth - 10}
                  y={y + h / 2}
                  textAnchor="end"
                  dominantBaseline="central"
                >
                  {clipText(d.label, nameSpace)}
                </text>
                <path className="chart__bar" d={barPath(labelWidth, y, w, h, 'right')} fill={fill} />
                <text
                  className="chart__value"
                  x={outsideFits ? labelWidth + w + 6 : labelWidth + w - 6}
                  y={y + h / 2}
                  textAnchor={outsideFits ? 'start' : 'end'}
                  dominantBaseline="central"
                  style={outsideFits ? undefined : { fill: '#0b0b0b' }}
                >
                  {vLabel}
                </text>
              </g>
            );
          })}

          <line
            className="chart__axis"
            x1={labelWidth}
            x2={labelWidth}
            y1={plotTop}
            y2={plotTop + data.length * rowH}
          />
          <g>
            {ticks.map((t, i) => (
              <text
                key={t}
                x={labelWidth + scale(t)}
                y={plotTop + data.length * rowH + 14}
                textAnchor={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'}
              >
                {axisFormat(t)}
              </text>
            ))}
          </g>
        </svg>
      </div>
      {tip ? (
        <Tooltip x={tip.x} y={tip.y}>
          <div className="tip__title">{tip.data.label}</div>
          {tip.data.sublabel ? <div className="tip__row">{tip.data.sublabel}</div> : null}
          {tip.data.tip ?? <TipRow label="Value" value={valueLabel(tip.data.value)} />}
        </Tooltip>
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------- histogram - */

export interface Bin {
  label: string;
  count: number;
  tip?: ReactNode;
}

/**
 * Column histogram. One measure of magnitude, so one hue for every column - the
 * x-axis already carries the ordering, and shading by height would burn the colour
 * channel restating the bar length.
 */
export function Histogram({
  bins,
  axisLabel,
  format,
}: {
  bins: Bin[];
  axisLabel: string;
  format: (n: number) => string;
}) {
  const { tip, onPointer, onFocus, hide } = useTooltip<Bin>();
  const [ref, W] = useWidth<HTMLDivElement>();

  const H = 172;
  const padB = 30;
  const padT = 16;
  const max = Math.max(...bins.map((b) => b.count), 0);
  const ticks = niceTicks(max, 3);
  const axisMax = ticks[ticks.length - 1] || 1;
  const padL = Math.max(...ticks.map((t) => estWidth(format(t))), 14) + 12;
  const plotH = H - padB - padT;
  const band = (W - padL - 8) / Math.max(1, bins.length);
  const barW = Math.max(4, Math.min(MAX_BAR * 2.2, band - GAP * 2));

  return (
    <>
      <div ref={ref}>
        <svg
          className="chart"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Histogram of ${axisLabel}`}
          onMouseLeave={hide}
        >
          <g className="chart__grid">
            {ticks.map((t) => {
              const y = padT + plotH - (t / axisMax) * plotH;
              return <line key={t} x1={padL} x2={W - 8} y1={y} y2={y} />;
            })}
          </g>
          {ticks.map((t) => (
            <text
              key={t}
              x={padL - 8}
              y={padT + plotH - (t / axisMax) * plotH}
              textAnchor="end"
              dominantBaseline="central"
            >
              {format(t)}
            </text>
          ))}

          {bins.map((b, i) => {
            const h = axisMax > 0 ? (b.count / axisMax) * plotH : 0;
            const x = padL + i * band + (band - barW) / 2;
            const y = padT + plotH - h;
            const label = format(b.count);
            const fits = b.count > 0 && estWidth(label) < barW - 4 && y - 5 > padT;
            return (
              <g
                key={b.label}
                className="chart__row"
                tabIndex={0}
                aria-label={`${b.label}: ${format(b.count)}`}
                onMouseMove={(e) => onPointer(e, b)}
                onFocus={(e) => onFocus(e.currentTarget, b)}
                onBlur={hide}
              >
                <rect className="chart__hit" x={padL + i * band} y={padT} width={band} height={plotH} />
                <title>{`${b.label}: ${format(b.count)}`}</title>
                <path className="chart__bar" d={barPath(x, y, barW, h, 'up')} fill="var(--series-1)" />
                {/* The value rides the cap only when it fits; otherwise the axis
                    and the tooltip carry it. Never clipped. */}
                {fits ? (
                  <text className="chart__value" x={x + barW / 2} y={y - 5} textAnchor="middle">
                    {label}
                  </text>
                ) : null}
                <text x={x + barW / 2} y={H - padB + 15} textAnchor="middle">
                  {b.label}
                </text>
              </g>
            );
          })}

          <line className="chart__axis" x1={padL} x2={W - 8} y1={padT + plotH} y2={padT + plotH} />
        </svg>
      </div>
      {tip ? (
        <Tooltip x={tip.x} y={tip.y}>
          <div className="tip__title">{tip.data.label}</div>
          {tip.data.tip ?? <TipRow label="Tokens" value={format(tip.data.count)} />}
        </Tooltip>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------ stacked bar - */

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * Part-to-whole, horizontal so long category names have room. A 2px surface gap
 * separates touching segments - no strokes. Segment labels render inside only
 * when they measurably fit; the legend and tooltip carry the rest.
 */
export function StackedBar({
  segments,
  total,
  format,
}: {
  segments: Segment[];
  total: number;
  format: (n: number) => string;
}) {
  const { tip, onPointer, onFocus, hide } = useTooltip<Segment>();
  const [ref, W] = useWidth<HTMLDivElement>();
  const H = 42;
  const barH = 30;
  let cursor = 0;

  if (total <= 0) return <div className="empty">Nothing to break down yet.</div>;

  return (
    <>
      <div ref={ref}>
        <svg
          className="chart"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Part-to-whole breakdown"
          onMouseLeave={hide}
        >
          {segments.map((s, i) => {
            const w = (s.value / total) * W;
            const x = cursor;
            cursor += w;
            if (w <= 0) return null;
            const last = i === segments.length - 1;
            const drawW = Math.max(0, w - (last ? 0 : GAP));
            const share = `${Math.round((s.value / total) * 100)}%`;
            const fits = drawW > estWidth(share) + 14;
            return (
              <g
                key={s.key}
                className="chart__row"
                tabIndex={0}
                aria-label={`${s.label}: ${format(s.value)}, ${share}`}
                onMouseMove={(e) => onPointer(e, s)}
                onFocus={(e) => onFocus(e.currentTarget, s)}
                onBlur={hide}
              >
                <title>{`${s.label}: ${format(s.value)} (${share})`}</title>
                <rect
                  x={x}
                  y={4}
                  width={drawW}
                  height={barH}
                  rx={i === 0 || last ? 4 : 0}
                  fill={s.color}
                  className="chart__bar"
                />
                {fits ? (
                  // Ink inside a filled segment is picked by the fill's luminance.
                  // Every categorical slot used here clears 4.5:1 against near-black
                  // in both modes (the darkest, light-mode slot 1 #2a78d6, measures
                  // 4.71:1), so near-black is correct for every segment.
                  <text
                    x={x + drawW / 2}
                    y={4 + barH / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{ fill: '#0b0b0b', fontWeight: 600 }}
                  >
                    {share}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      {tip ? (
        <Tooltip x={tip.x} y={tip.y}>
          <div className="tip__title">{tip.data.label}</div>
          <TipRow label="Amount" value={format(tip.data.value)} />
          <TipRow label="Share" value={`${((tip.data.value / total) * 100).toFixed(1)}%`} />
        </Tooltip>
      ) : null}
    </>
  );
}
