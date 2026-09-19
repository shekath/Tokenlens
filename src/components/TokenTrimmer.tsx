import { useMemo, useState } from 'react';
import type { Model } from '../lib/models';
import { RULES, monthlySaving, trim, type RuleId } from '../lib/trimmer';
import { compact, num, pct, usd } from '../lib/format';
import { StatTile } from './primitives';

const VOLUMES = [100_000, 1_000_000];

export function TokenTrimmer({
  text,
  model,
  countTokens,
  onApply,
}: {
  text: string;
  model: Model;
  countTokens: (s: string) => number;
  onApply: (trimmed: string) => void;
}) {
  const [enabled, setEnabled] = useState<Set<RuleId>>(() => new Set(RULES.map((r) => r.id)));
  const [copied, setCopied] = useState(false);

  const result = useMemo(() => trim(text, countTokens, enabled), [text, countTokens, enabled]);

  const toggle = (id: RuleId) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (text.trim().length === 0) {
    return <div className="empty">Paste a prompt on the Analyse tab and the linter will run here.</div>;
  }

  const noFindings = result.findings.length === 0;

  return (
    <>
      <div className="grid grid--kpi">
        <StatTile
          label="Tokens now"
          value={num(result.originalTokens)}
          foot={`on ${model.label}`}
        />
        <StatTile
          label="After trimming"
          value={num(result.trimmedTokens)}
          foot={
            result.tokensSaved > 0
              ? `${num(result.tokensSaved)} removed`
              : 'Nothing safe to remove'
          }
        />
        <StatTile
          label="Reduction"
          value={result.savedFraction > 0 ? pct(result.savedFraction, 1) : '—'}
          foot="Of the prompt's tokens"
        />
        {VOLUMES.map((v) => (
          <StatTile
            key={v}
            label={`Saved at ${compact(v)} calls`}
            value={usd(monthlySaving(result.tokensSaved, v, model.inputPerM))}
            foot={`${model.label} input rate`}
          />
        ))}
      </div>

      <div className="grid grid--halves">
        <section className="card">
          <div className="card__head">
            <h3 className="card__title">Findings</h3>
          </div>
          <p className="card__note">
            Each saving is measured by applying that rule alone and re-tokenising, so the
            number is the real token delta rather than a character-count guess. Toggle a
            rule off if it changes meaning in your prompt.
          </p>

          {noFindings ? (
            <div className="empty">Nothing to trim. This prompt is already lean.</div>
          ) : (
            <ul className="findings">
              {result.findings.map((f) => (
                <li key={f.rule.id} className="finding">
                  <label className="finding__head">
                    <input
                      type="checkbox"
                      checked={enabled.has(f.rule.id)}
                      onChange={() => toggle(f.rule.id)}
                    />
                    <span
                      className={
                        f.rule.severity === 'trim' ? 'finding__dot finding__dot--trim' : 'finding__dot finding__dot--review'
                      }
                      aria-hidden="true"
                    />
                    <span className="finding__label">{f.rule.label}</span>
                    <span className="finding__count">
                      {num(f.occurrences)}×
                    </span>
                    <span
                      className="finding__saving"
                      style={f.tokensSaved > 0 ? { color: 'var(--success-text)' } : undefined}
                    >
                      {f.tokensSaved > 0 ? `−${num(f.tokensSaved)}` : `+${num(-f.tokensSaved)}`} tok
                    </span>
                  </label>
                  <p className="finding__why">{f.rule.why}</p>
                </li>
              ))}
            </ul>
          )}

          <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>
            <span className="finding__dot finding__dot--trim" aria-hidden="true" /> safe to remove ·{' '}
            <span className="finding__dot finding__dot--review" aria-hidden="true" /> read before
            accepting
          </p>
        </section>

        <section className="card">
          <div className="card__head">
            <h3 className="card__title">Trimmed prompt</h3>
            <div className="card__tools">
              <button
                type="button"
                className="btn btn--ghost"
                disabled={result.tokensSaved === 0}
                onClick={() => {
                  void navigator.clipboard.writeText(result.trimmed).then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1600);
                  });
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                className="btn"
                disabled={result.tokensSaved === 0}
                onClick={() => onApply(result.trimmed)}
              >
                Use this
              </button>
            </div>
          </div>
          <p className="card__note">
            Replace your prompt with this version, or copy it out. Read it first — a linter
            cannot tell which of your words were load-bearing.
          </p>
          <pre className="codeblock">{result.trimmed || '(empty)'}</pre>
        </section>
      </div>
    </>
  );
}
