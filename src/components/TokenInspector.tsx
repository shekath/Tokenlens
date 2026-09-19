import { useMemo, useState } from 'react';
import type { TokenPiece } from '../lib/tokenize';
import { INSPECT_LIMIT } from '../lib/tokenize';
import { num, visibleToken } from '../lib/format';

/**
 * Token boundaries, drawn on the prompt itself. Alternating steps of one hue mark
 * where one token ends and the next begins; whitespace-only tokens get their own
 * step because indentation is usually the surprise in a token count.
 */
export function TokenInspector({
  pieces,
  truncated,
  totalTokens,
}: {
  pieces: TokenPiece[];
  truncated: boolean;
  totalTokens: number;
}) {
  const [showIds, setShowIds] = useState(false);

  const chips = useMemo(
    () =>
      pieces.map((p, i) => {
        const ws = p.text.trim() === '' && p.text.length > 0;
        const cls = ws ? 'tok tok--ws' : i % 2 === 0 ? 'tok tok--a' : 'tok tok--b';
        return { ...p, cls, i };
      }),
    [pieces],
  );

  if (pieces.length === 0) {
    return <div className="empty">Type or paste a prompt above to see its token boundaries.</div>;
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <label className="switch">
          <input type="checkbox" checked={showIds} onChange={(e) => setShowIds(e.target.checked)} />
          Show token IDs
        </label>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
          {truncated
            ? `First ${num(INSPECT_LIMIT)} of ${num(totalTokens)} tokens`
            : `${num(pieces.length)} tokens`}
        </span>
      </div>
      <div className="inspector" aria-label="Token boundaries">
        {chips.map((c) =>
          showIds ? (
            <span key={c.i} className={c.cls} title={`id ${c.id}`}>
              {c.id}{' '}
            </span>
          ) : (
            <span key={c.i} className={c.cls} title={`id ${c.id}`}>
              {visibleToken(c.text)}
            </span>
          ),
        )}
      </div>
      <p className="card__note" style={{ marginTop: 10, marginBottom: 0 }}>
        Boundaries come from <code>o200k_base</code> — OpenAI&apos;s current encoding, and the
        structural basis every estimate on this page scales from. Middle dots are spaces,
        <span aria-hidden="true"> ⏎ </span> newlines, <span aria-hidden="true">⇥</span> tabs.
      </p>
    </>
  );
}
