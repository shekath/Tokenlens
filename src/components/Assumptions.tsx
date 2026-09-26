import type { CostAssumptions } from '../lib/cost';
import { num, pct } from '../lib/format';
import { OUTPUT_PRESETS, activePreset } from '../lib/outputPresets';

/**
 * One filter row above everything it scopes. Every cost figure on the page - tiles,
 * charts, tables - re-renders against this same slice; there are no per-card knobs.
 */
export function Assumptions({
  value,
  onChange,
  cacheSupported,
  batchSupported,
}: {
  value: CostAssumptions;
  onChange: (next: CostAssumptions) => void;
  cacheSupported: boolean;
  batchSupported: boolean;
}) {
  const set = <K extends keyof CostAssumptions>(k: K, v: CostAssumptions[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <section className="card" style={{ marginTop: 14 }} aria-label="Cost assumptions">
      <div className="card__head">
        <h3 className="card__title">Cost assumptions</h3>
      </div>
      <p className="card__note">
        A prompt only has a price once you say what comes back and how often you send it.
        These four inputs scope every cost figure below.
      </p>
      <div className="grid grid--thirds" style={{ marginTop: 0 }}>
        <div className="field">
          <label className="field__label" htmlFor="out">
            Expected output — {num(value.outputTokens)} tokens
          </label>
          <input
            id="out"
            className="slider"
            type="range"
            min={0}
            max={16000}
            step={10}
            value={value.outputTokens}
            onChange={(e) => set('outputTokens', Number(e.target.value))}
          />
          <div className="presets" role="group" aria-label="Typical answer lengths">
            {OUTPUT_PRESETS.map((p) => {
              const on = activePreset(value.outputTokens)?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`chip chip--sm${on ? ' is-on' : ''}`}
                  aria-pressed={on}
                  title={`${p.hint}: about ${num(p.tokens)} tokens`}
                  onClick={() => set('outputTokens', p.tokens)}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <span className="muted" style={{ fontSize: 11 }}>
            Typical lengths to start from. The answer is usually most of the bill, so measure
            yours when you can.
          </span>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="calls">
            Calls per day
          </label>
          <input
            id="calls"
            className="input"
            type="number"
            min={1}
            max={100_000_000}
            step={100}
            value={value.callsPerDay}
            onChange={(e) => set('callsPerDay', Math.max(1, Number(e.target.value) || 1))}
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="cached">
            Cacheable prefix — {pct(value.cachedShare, 0)} of the prompt
          </label>
          <input
            id="cached"
            className="slider"
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(value.cachedShare * 100)}
            onChange={(e) => set('cachedShare', Number(e.target.value) / 100)}
            disabled={!cacheSupported}
          />
          {!cacheSupported ? (
            <span className="muted" style={{ fontSize: 11 }}>
              This model publishes no cache rate.
            </span>
          ) : null}
        </div>

        <div className="field">
          <label className="field__label" htmlFor="hit">
            Cache hit rate — {pct(value.cacheHitRate, 0)}
          </label>
          <input
            id="hit"
            className="slider"
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(value.cacheHitRate * 100)}
            onChange={(e) => set('cacheHitRate', Number(e.target.value) / 100)}
            disabled={!cacheSupported || value.cachedShare === 0}
          />
        </div>

        <div className="field">
          <span className="field__label">Processing</span>
          <label className="switch">
            <input
              type="checkbox"
              checked={value.useBatch}
              disabled={!batchSupported}
              onChange={(e) => set('useBatch', e.target.checked)}
            />
            Batch / async endpoint
          </label>
          <span className="muted" style={{ fontSize: 11 }}>
            {batchSupported
              ? 'Half price on every token, including cache reads and writes.'
              : 'No batch endpoint for this model.'}
          </span>
        </div>
      </div>
    </section>
  );
}
