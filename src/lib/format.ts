/** Display formatting. Kept in one place so every figure in the UI rounds alike. */

const int = new Intl.NumberFormat('en-US');

export function num(n: number): string {
  return int.format(Math.round(n));
}

/** 1,284 / 12.9K / 4.2M - for stat-tile values where width is tight. */
export function compact(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs < 10_000) return int.format(Math.round(n));
  if (abs < 1_000_000) return `${(n / 1_000).toFixed(abs < 100_000 ? 1 : 0)}K`;
  if (abs < 1_000_000_000) return `${(n / 1_000_000).toFixed(abs < 10_000_000 ? 2 : 1)}M`;
  return `${(n / 1_000_000_000).toFixed(2)}B`;
}

/**
 * Money, at a precision that matches the magnitude. A single prompt often costs
 * fractions of a cent, so fixed 2-decimal currency would render every figure as
 * $0.00 and the dashboard would say nothing.
 */
export function usd(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '$0';
  const abs = Math.abs(n);
  // Below a cent, fixed decimals either round everything to $0.00 or print a
  // different width in every row. Three significant figures keeps the column
  // aligned in meaning and never falls back to exponential notation, which is
  // unreadable in a price.
  // toPrecision switches to exponential below 1e-6, so that is the cutoff:
  // anything smaller is reported as a bound instead.
  if (abs < 0.000_001) return n > 0 ? '<$0.000001' : '>-$0.000001';
  if (abs < 0.01) return `$${n.toPrecision(3).replace(/0+$/, '').replace(/\.$/, '')}`;
  if (abs < 1) return `$${n.toFixed(4)}`;
  if (abs < 1_000) return `$${n.toFixed(2)}`;
  if (abs < 1_000_000) return `$${int.format(Math.round(n))}`;
  return `$${compact(n)}`;
}

export function pct(fraction: number, digits = 1): string {
  if (!Number.isFinite(fraction)) return '—';
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function ratio(n: number, digits = 2): string {
  if (!Number.isFinite(n) || n === 0) return '—';
  return n.toFixed(digits);
}

/** Render a token's text so whitespace and control characters stay visible. */
export function visibleToken(text: string): string {
  return text
    .replace(/\n/g, '⏎')
    .replace(/\t/g, '⇥')
    .replace(/\r/g, '␍')
    .replace(/ /g, '·');
}
