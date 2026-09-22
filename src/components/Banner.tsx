/**
 * Banner artwork for the docs page.
 *
 * Inline SVG drawn from the design tokens rather than bitmap art: it stays
 * crisp at any width, weighs nothing, and follows the theme instead of sitting
 * on the page as a rectangle of somebody else's colours. Each motif is a
 * diagram of the thing it introduces - bars for a comparison, a cache boundary
 * for the ROI simulator, rows for batch - so it carries a little meaning
 * rather than being decoration with a gradient on it.
 *
 * aria-hidden throughout: every one of these sits beside a heading that
 * already says what it is, so announcing it again would only be noise.
 *
 * GEOMETRY. The banner is rendered at wildly different aspect ratios - roughly
 * 9:1 on a desktop, 3:1 on a phone - and preserveAspectRatio="slice" crops
 * whatever does not fit. So every motif is drawn inside a safe band,
 * x 120-600 and y 55-145, and only the grid and the wash are allowed to run to
 * the edges. The first version drew a bar chart sitting on a baseline at
 * y=168 and the whole chart was cropped away on a desktop.
 */

/** The only region guaranteed to survive the crop at every aspect ratio. */
const SAFE = { top: 55, bottom: 145, left: 120, right: 600 };

export type Motif = 'cache' | 'trim' | 'batch' | 'proposal' | 'models' | 'share';

/** A faint technical grid, the common ground under every motif. */
function Grid({ id }: { id: string }) {
  return (
    <>
      <defs>
        <pattern id={`${id}-grid`} width="26" height="26" patternUnits="userSpaceOnUse">
          <path d="M26 0H0V26" fill="none" stroke="var(--gridline)" strokeWidth="1" />
        </pattern>
        <linearGradient id={`${id}-wash`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--series-1)" stopOpacity="0.16" />
          <stop offset="55%" stopColor="var(--series-3)" stopOpacity="0.08" />
          <stop offset="100%" stopColor="var(--series-2)" stopOpacity="0.14" />
        </linearGradient>
      </defs>
      <rect width="720" height="200" fill="var(--surface-2)" />
      <rect width="720" height="200" fill={`url(#${id}-grid)`} />
      <rect width="720" height="200" fill={`url(#${id}-wash)`} />
    </>
  );
}

function Motif({ motif }: { motif: Motif }) {
  const line = 'var(--series-1)';
  const alt = 'var(--series-2)';

  switch (motif) {
    // A comparison: the same prompt, priced against models that disagree.
    case 'models':
      return (
        <g>
          {[22, 40, 58, 76, 90].map((h, i) => (
            <rect
              key={h}
              x={SAFE.left + 10 + i * 94}
              y={SAFE.bottom - h}
              width="54"
              height={h}
              rx="4"
              fill={i === 3 ? line : 'var(--series-muted)'}
              opacity={i === 3 ? 0.95 : 0.32}
            />
          ))}
          <line
            x1={SAFE.left - 20}
            y1={SAFE.bottom}
            x2={SAFE.right + 20}
            y2={SAFE.bottom}
            stroke="var(--baseline)"
            strokeWidth="1.5"
          />
        </g>
      );

    // The cache boundary: costly writes one side, cheap reads the other, and
    // the break-even where they cross.
    case 'cache':
      return (
        <g fill="none" strokeWidth="2.5">
          <path d="M120 135 C 220 135, 250 70, 360 68 S 520 60, 600 58" stroke={line} />
          <path d="M120 135 C 220 135, 260 116, 360 110 S 520 100, 600 96" stroke={alt} strokeDasharray="7 6" />
          <line x1="360" y1="58" x2="360" y2="140" stroke="var(--baseline)" strokeWidth="1.5" strokeDasharray="4 5" />
          <circle cx="360" cy="68" r="6" fill={line} stroke="none" />
          <circle cx="360" cy="110" r="6" fill={alt} stroke="none" />
        </g>
      );

    // Text with the waste struck out of it.
    case 'trim':
      return (
        <g>
          {[360, 460, 300, 420].map((w, i) => (
            <rect
              key={i}
              x={SAFE.left}
              y={SAFE.top + 4 + i * 22}
              width={w}
              height="9"
              rx="4.5"
              fill="var(--series-muted)"
              opacity={i % 2 === 0 ? 0.5 : 0.28}
            />
          ))}
          {[1, 3].map((i) => (
            <g key={i}>
              <rect x={330} y={SAFE.top + i * 22} width={150} height="17" rx="8" fill={line} opacity="0.18" />
              <line
                x1="330"
                y1={SAFE.top + 8.5 + i * 22}
                x2="480"
                y2={SAFE.top + 8.5 + i * 22}
                stroke={line}
                strokeWidth="2.5"
              />
            </g>
          ))}
        </g>
      );

    // Rows in, a costed answer out.
    case 'batch':
      return (
        <g>
          {Array.from({ length: 5 }, (_, i) => (
            <rect
              key={i}
              x={SAFE.left}
              y={SAFE.top + 2 + i * 18}
              width="170"
              height="12"
              rx="3"
              fill="var(--series-muted)"
              opacity={0.45 - i * 0.06}
            />
          ))}
          <path d="M320 100 H 372" stroke="var(--baseline)" strokeWidth="2" />
          <path d="M364 93 L 376 100 L 364 107 Z" fill="var(--baseline)" />
          <rect x="396" y="62" width="200" height="76" rx="8" fill="var(--surface-1)" stroke={line} strokeWidth="2" />
          <rect x="418" y="82" width="116" height="12" rx="6" fill={line} opacity="0.8" />
          <rect x="418" y="106" width="72" height="12" rx="6" fill={alt} opacity="0.7" />
        </g>
      );

    // A document with a figure on it.
    case 'proposal':
      return (
        <g>
          <rect x="276" y="55" width="180" height="90" rx="9" fill="var(--surface-1)" stroke="var(--border-strong)" strokeWidth="2" />
          <rect x="296" y="72" width="100" height="11" rx="5.5" fill={line} />
          <rect x="296" y="93" width="140" height="7" rx="3.5" fill="var(--series-muted)" opacity="0.45" />
          <rect x="296" y="106" width="118" height="7" rx="3.5" fill="var(--series-muted)" opacity="0.45" />
          <rect x="296" y="122" width="84" height="15" rx="5" fill={alt} opacity="0.85" />
          <g stroke="var(--baseline)" strokeWidth="1.5" strokeDasharray="4 5">
            <line x1={SAFE.left} y1="100" x2="266" y2="100" />
            <line x1="466" y1="100" x2={SAFE.right} y2="100" />
          </g>
        </g>
      );

    // One figure reaching several people, the prompt left behind.
    case 'share':
      return (
        <g>
          <rect x="298" y="78" width="130" height="48" rx="9" fill="var(--surface-1)" stroke={line} strokeWidth="2" />
          <rect x="316" y="92" width="90" height="9" rx="4.5" fill={line} opacity="0.85" />
          <rect x="316" y="107" width="56" height="7" rx="3.5" fill="var(--series-muted)" opacity="0.5" />
          {[
            [150, 68],
            [150, 132],
            [570, 68],
            [570, 132],
          ].map(([x, y], i) => (
            <g key={i}>
              <line
                x1={x < 360 ? x + 20 : x - 20}
                y1={y}
                x2={x < 360 ? 298 : 428}
                y2="102"
                stroke="var(--baseline)"
                strokeWidth="1.5"
                strokeDasharray="4 5"
              />
              <circle cx={x} cy={y} r="16" fill="var(--surface-1)" stroke={alt} strokeWidth="2" />
            </g>
          ))}
        </g>
      );
  }
}

export function Banner({ motif, id }: { motif: Motif; id: string }) {
  return (
    <svg
      className="banner"
      viewBox="0 0 720 200"
      role="presentation"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <Grid id={id} />
      <Motif motif={motif} />
    </svg>
  );
}
