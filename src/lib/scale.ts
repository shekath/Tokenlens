/** Chart geometry. Pure maths, kept out of the component file so it can be tested. */

/**
 * Axis ticks at clean 1 / 2 / 5 x 10^n steps, covering 0 through at least `max`.
 *
 * The last tick must be >= max: it is the value bars are scaled against, so a top
 * tick below the data draws the longest bar past the end of its own plot.
 * Thresholds are the geometric midpoints of the 1/2/5/10 ladder, which keeps the
 * interval count near `count` instead of collapsing to two.
 */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const steps = Math.ceil(max / step - 1e-9);
  const out: number[] = [];
  for (let i = 0; i <= steps; i += 1) {
    // Multiply rather than accumulate: repeated addition of a step like 0.002
    // drifts, and the drift shows up as a ragged axis label.
    out.push(Number((i * step).toPrecision(12)));
  }
  return out;
}

/**
 * Bar path with a 4px rounded data-end and a square baseline end, per the mark
 * spec. `dir` is the axis the bar grows along.
 */
export function barPath(x: number, y: number, w: number, h: number, dir: 'right' | 'up'): string {
  if (dir === 'right') {
    if (w <= 0) return '';
    const r = Math.max(0, Math.min(4, w));
    return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
  }
  if (h <= 0) return '';
  const r = Math.max(0, Math.min(4, h));
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Rough rendered width of a string in the UI sans. Used only to decide whether a
 * label fits; it errs wide, so the failure mode is dropping a label that would
 * just have fitted rather than clipping one that does not.
 */
export function estWidth(text: string, size = 11): number {
  return text.length * size * 0.6;
}

/**
 * Truncate a label to what will actually fit in `width`.
 *
 * Deliberately more pessimistic than `estWidth`: that average is fine for a
 * fits/does-not-fit test on a value like "$0.0128", but a name in title case is
 * wider per character than the average, and here being wrong means the text
 * renders outside its own SVG. Cutting a character early is the cheaper mistake.
 */
export function clipText(text: string, width: number, size = 11): string {
  const perChar = size * 0.72;
  const max = Math.max(3, Math.floor(width / perChar));
  return text.length > max ? `${text.slice(0, max - 1)}\u2026` : text;
}
