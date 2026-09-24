import { useMemo, useState } from 'react';
import type { Model } from '../lib/models';
import {
  analyseCacheability,
  describeMove,
  monthlyCacheLoss,
  savingPerCachedToken,
} from '../lib/cacheability';
import { num, pct, usd } from '../lib/format';
import { StatTile } from './primitives';

/**
 * Why a prompt cache is not hitting. The engine is lib/cacheability.ts; this
 * adds the one thing a linter needs to stay switched on - a way to say "that
 * value is fixed" - and prices the answer at the volume already set on the
 * Analyse tab.
 */
export function CacheOrder({
  text,
  model,
  countTokens,
  callsPerDay,
  onApply,
}: {
  text: string;
  model: Model;
  countTokens: (s: string) => number;
  callsPerDay: number;
  onApply: (reordered: string) => void;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [hitRate, setHitRate] = useState(0.8);
  const [copied, setCopied] = useState(false);

  // All hits, dismissed included, so a dismissed value can be restored.
  const all = useMemo(() => analyseCacheability(text, countTokens), [text, countTokens]);
  const report = useMemo(
    () => (dismissed.size === 0 ? all : analyseCacheability(text, countTokens, { dismissed })),
    [all, text, countTokens, dismissed],
  );

  if (text.trim().length === 0) {
    return <div className="empty">Paste a prompt on the Analyse tab and its cache order is checked here.</div>;
  }

  const loss = monthlyCacheLoss(report.lostTokens, callsPerDay, model, hitRate);
  const perToken = savingPerCachedToken(model, hitRate);
  const toggle = (key: string) =>
    setDismissed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const reorderable = report.moves.length > 0;

  return (
    <>
      <div className="grid grid--kpi">
        <StatTile
          label="Cacheable now"
          value={num(report.prefixTokens)}
          foot={report.totalTokens > 0 ? `${pct(report.prefixTokens / report.totalTokens, 0)} of ${num(report.totalTokens)} tokens` : '—'}
        />
        <StatTile
          label="After reordering"
          value={num(report.reorderedPrefixTokens)}
          foot={reorderable ? 'Per-call values moved last' : 'Already in the best order'}
        />
        <StatTile
          label="Locked out"
          value={num(report.lostTokens)}
          foot={report.lostTokens > 0 ? `${pct(report.lostFraction, 0)} of what could cache` : 'Nothing lost to order'}
        />
        <StatTile
          label="Costing you"
          value={loss === null ? '—' : `${usd(loss)}/mo`}
          foot={
            perToken === null
              ? `${model.label} publishes no cache rates`
              : `${num(callsPerDay)} calls/day at ${pct(hitRate, 0)} hits`
          }
        />
      </div>

      <div className="grid grid--halves">
        <section className="card">
          <div className="card__head">
            <h3 className="card__title">Per-call values</h3>
          </div>
          <p className="card__note">
            Prompt caching is a prefix match: the first value that changes between calls ends
            the cacheable part, however stable everything after it is. Untick a value that is
            actually fixed in your prompt.
          </p>

          {all.hits.length === 0 ? (
            <div className="empty">
              No timestamps, ids or template variables found. The whole prompt can cache.
            </div>
          ) : (
            <ul className="hitlist">
              {all.hits.map((h) => (
                <li key={`${h.offset}`} className={dismissed.has(h.key) ? 'is-dismissed' : undefined}>
                  <label>
                    <input type="checkbox" checked={!dismissed.has(h.key)} onChange={() => toggle(h.key)} />
                    <span className="hitlist__line">L{h.line}</span>
                    <span className="badge">{h.label}</span>
                    <span className="hitlist__value">{h.match}</span>
                    {h.confidence === 'medium' ? <span className="muted">· may be fixed</span> : null}
                  </label>
                </li>
              ))}
            </ul>
          )}

          {reorderable ? (
            <>
              <h4 className="card__title" style={{ marginTop: 16, fontSize: 13 }}>
                What to move
              </h4>
              <ol className="movelist">
                {report.moves.map((m) => (
                  <li key={m.startLine}>{describeMove(m, report.lastStableLine!)}</li>
                ))}
              </ol>
            </>
          ) : null}

          <div className="field" style={{ marginTop: 16, maxWidth: 260 }}>
            <label className="field__label" htmlFor="co-hit">
              Expected cache hit rate — {pct(hitRate, 0)}
            </label>
            <input
              id="co-hit"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={hitRate}
              onChange={(e) => setHitRate(Number(e.target.value))}
            />
          </div>
        </section>

        <section className="card">
          <div className="card__head">
            <h3 className="card__title">Reordered prompt</h3>
            <div className="card__tools">
              <button
                type="button"
                className="btn btn--ghost"
                disabled={!reorderable}
                onClick={() => {
                  void navigator.clipboard.writeText(report.reordered).then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1600);
                  });
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button type="button" className="btn" disabled={!reorderable} onClick={() => onApply(report.reordered)}>
                Use this
              </button>
            </div>
          </div>
          <p className="card__note">
            Stable blocks first, per-call blocks last, each block kept whole. Read it before
            using it: moving &ldquo;Today is …&rdquo; to the end is usually fine, but only you know
            whether an instruction depended on coming first.
          </p>
          {reorderable ? (
            <pre className="codeblock">{report.reordered}</pre>
          ) : (
            <div className="empty">
              {report.hits.length === 0
                ? 'Nothing to reorder.'
                : 'The per-call values already sit after the stable content. Keep it that way.'}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
