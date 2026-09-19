import { useDeferredValue, useMemo, useState } from 'react';
import {
  DEFAULT_COMPARE_IDS,
  DEFAULT_MODEL_ID,
  MODELS,
  MODELS_BY_ID,
  PRICING_AS_OF,
  VENDORS,
  type Model,
} from './lib/models';
import {
  EMPTY_BASE,
  NON_LATIN_WARN_SHARE,
  countFor,
  encodeBase,
  isExact,
  FAMILY_INFO,
} from './lib/tokenize';
import { useEncoders } from './lib/useEncoders';
import { textMetrics, tokenMetrics } from './lib/metrics';
import {
  DEFAULT_ASSUMPTIONS,
  callCost,
  effectiveCost,
  project,
  utilization,
  type CostAssumptions,
  type Severity,
} from './lib/cost';
import { compact, num, pct, ratio, usd, visibleToken } from './lib/format';
import { useTheme, usePersisted } from './lib/useTheme';
import { Composer } from './components/Composer';
import { Assumptions } from './components/Assumptions';
import { ModelTable, type ModelRow } from './components/ModelTable';
import { TokenInspector } from './components/TokenInspector';
import { BarRows, Histogram, StackedBar, type BarDatum } from './components/charts';
import {
  ChartCard,
  ExactBadge,
  Legend,
  Meter,
  SeverityIcon,
  StatTile,
  TipRow,
  type LegendItem,
} from './components/primitives';

const COMPOSITION_COLORS = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
];

type View = 'chart' | 'table';

export default function App() {
  const [theme, setTheme] = useTheme();
  const [text, setText] = usePersisted<string>('tokenticks.prompt', '');
  const [modelId, setModelId] = usePersisted<string>('tokenticks.model', DEFAULT_MODEL_ID, (v) =>
    typeof v === 'string' && MODELS_BY_ID[v] ? v : null,
  );
  const [assumptions, setAssumptions] = usePersisted<CostAssumptions>(
    'tokenticks.assumptions',
    DEFAULT_ASSUMPTIONS,
    (v) =>
      v && typeof v === 'object' ? { ...DEFAULT_ASSUMPTIONS, ...(v as CostAssumptions) } : null,
  );
  const [compareIds, setCompareIds] = usePersisted<string[]>(
    'tokenticks.compare',
    DEFAULT_COMPARE_IDS,
    (v) => (Array.isArray(v) ? v.filter((id) => typeof id === 'string' && MODELS_BY_ID[id]) : null),
  );

  const [costView, setCostView] = useState<View>('chart');
  const [tokenView, setTokenView] = useState<View>('chart');
  const [lengthView, setLengthView] = useState<View>('chart');
  const [compView, setCompView] = useState<View>('chart');

  // Tokenising a long paste is the one expensive step; deferring it keeps typing
  // responsive and lets React show the previous numbers while the next land.
  const deferredText = useDeferredValue(text);
  const stale = deferredText !== text;

  const model: Model = MODELS_BY_ID[modelId] ?? MODELS_BY_ID[DEFAULT_MODEL_ID]!;

  const enc = useEncoders();
  // `enc.secondary` is in the dependency list because the cl100k count only
  // becomes available on the render after that chunk lands.
  const base = useMemo(
    () => (enc.ready ? encodeBase(deferredText) : EMPTY_BASE),
    [deferredText, enc.ready, enc.secondary],
  );
  const tm = useMemo(() => textMetrics(deferredText), [deferredText]);
  const tokens = useMemo(() => countFor(model, base), [model, base]);
  const tok = useMemo(
    () => tokenMetrics(base, tokens, tm.words, tm.chars),
    [base, tokens, tm.words, tm.chars],
  );

  const family = FAMILY_INFO[model.tokenizer];
  const exact = isExact(model, base);
  const cost = useMemo(
    () => effectiveCost(model, tokens, assumptions),
    [model, tokens, assumptions],
  );
  const naive = useMemo(
    () => callCost(model, tokens, assumptions.outputTokens),
    [model, tokens, assumptions.outputTokens],
  );
  const proj = useMemo(() => project(cost.total, assumptions.callsPerDay), [cost, assumptions.callsPerDay]);
  const util = utilization(tokens, model.context);

  const compared = useMemo(
    () => compareIds.map((id) => MODELS_BY_ID[id]).filter((m): m is Model => Boolean(m)),
    [compareIds],
  );

  const rows: ModelRow[] = useMemo(
    () =>
      MODELS.map((m) => {
        const t = countFor(m, base);
        return { model: m, tokens: t, cost: effectiveCost(m, t, assumptions) };
      }),
    [base, assumptions],
  );
  const rowsById = useMemo(
    () => Object.fromEntries(rows.map((r) => [r.model.id, r])),
    [rows],
  );

  const costBars: BarDatum[] = useMemo(
    () =>
      compared
        .map((m) => {
          const r = rowsById[m.id]!;
          return {
            key: m.id,
            label: m.label,
            value: r.cost.total,
            emphasis: m.id === model.id,
            tip: (
              <>
                <TipRow label="Prompt tokens" value={`${isExact(m, base) ? '' : '~'}${num(r.tokens)}`} />
                <TipRow label="Input" value={usd(r.cost.input)} />
                <TipRow label="Output" value={usd(r.cost.output)} />
                <TipRow label="Per call" value={usd(r.cost.total)} />
                <TipRow label={`At ${compact(assumptions.callsPerDay)}/day`} value={usd(r.cost.total * assumptions.callsPerDay)} />
              </>
            ),
          } satisfies BarDatum;
        })
        .sort((a, b) => b.value - a.value),
    [compared, rowsById, model.id, assumptions.callsPerDay, base],
  );

  const tokenBars: BarDatum[] = useMemo(
    () =>
      compared
        .map((m) => {
          const r = rowsById[m.id]!;
          const rowExact = isExact(m, base);
          return {
            key: m.id,
            label: m.label,
            value: r.tokens,
            emphasis: m.id === model.id,
            tip: (
              <>
                <TipRow label="Tokens" value={`${rowExact ? '' : '~'}${num(r.tokens)}`} />
                <TipRow label="Encoding" value={FAMILY_INFO[m.tokenizer].encoding} />
                <TipRow label="Chars / token" value={ratio(tm.chars / (r.tokens || 1))} />
              </>
            ),
          } satisfies BarDatum;
        })
        .sort((a, b) => b.value - a.value),
    [compared, rowsById, model.id, tm.chars, base],
  );

  const compositionSegments = useMemo(
    () =>
      tm.composition
        .filter((c) => c.count > 0)
        .map((c, i) => ({
          key: c.key,
          label: c.label,
          value: c.count,
          color: COMPOSITION_COLORS[i % COMPOSITION_COLORS.length]!,
        })),
    [tm.composition],
  );

  const compositionLegend: LegendItem[] = compositionSegments.map((s) => ({
    label: s.label,
    color: s.color,
    value: ` ${num(s.value)}`,
  }));

  const empty = tokens === 0;

  // Savings the current assumptions are actually buying, versus the same call
  // billed flat. Reported as a delta so the number has a reference point.
  const saving = naive.total > 0 ? 1 - cost.total / naive.total : 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__inner">
          <span className="brand">
            <Mark />
            TokenTicks
            <span className="brand__sub">prompt token &amp; cost analytics</span>
          </span>

          <div className="row">
            <label className="sr-only" htmlFor="model">
              Model in focus
            </label>
            <select
              id="model"
              className="select"
              value={model.id}
              onChange={(e) => setModelId(e.target.value)}
            >
              {VENDORS.map((v) => (
                <optgroup key={v} label={v}>
                  {MODELS.filter((m) => m.vendor === v).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            <div className="row" role="group" aria-label="Colour theme" style={{ gap: 2 }}>
              {(['light', 'system', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={theme === t ? 'btn btn--icon' : 'btn btn--ghost btn--icon'}
                  aria-pressed={theme === t}
                  aria-label={`${t} theme`}
                  title={`${t[0]!.toUpperCase()}${t.slice(1)} theme`}
                  onClick={() => setTheme(t)}
                >
                  <ThemeIcon which={t} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="shell" style={stale ? { opacity: 0.72 } : undefined}>
        <Composer
          text={text}
          onChange={setText}
          chars={tm.chars}
          words={tm.words}
          lines={tm.lines}
          bytes={tm.bytes}
        />

        <Notices
          enc={enc}
          nonLatinShare={base.nonLatinShare}
          modelExact={exact}
        />

        <Assumptions
          value={assumptions}
          onChange={setAssumptions}
          cacheSupported={model.cacheReadPerM !== undefined}
          batchSupported={Boolean(model.batchDiscount)}
        />

        {/* ------------------------------------------------------ headline --- */}
        <section className="section" aria-label="Headline figures">
          <div className="grid grid--kpi">
            <div className="tile tile--hero">
              <div>
                <span className="tile__label">
                  Prompt tokens on {model.label}
                  <ExactBadge exact={exact} title={family.basis} />
                </span>
                <span className="tile__value tile__value--hero">
                  {exact ? '' : '~'}
                  {num(tokens)}
                </span>
                <span className="tile__foot">
                  {family.encoding} · {ratio(tok.charsPerToken)} characters per token
                </span>
              </div>
              <div className="hero__meta">
                <div>
                  <span className="tile__label">Cost to send once</span>
                  <span className="tile__value">{usd(cost.total)}</span>
                  <span className="tile__foot">
                    {usd(cost.input)} in + {usd(cost.output)} out
                  </span>
                </div>
                <div>
                  <span className="tile__label">At {compact(assumptions.callsPerDay)} calls/day</span>
                  <span className="tile__value">{usd(proj.perMonth)}</span>
                  <span className="tile__foot">per 30 days</span>
                </div>
                {saving > 0.001 ? (
                  <div>
                    <span className="tile__label">Assumptions save</span>
                    <span className="tile__value delta--good" style={{ color: 'var(--success-text)' }}>
                      {pct(saving, 0)}
                    </span>
                    <span className="tile__foot">vs. flat, uncached billing</span>
                  </div>
                ) : null}
              </div>
            </div>

            <StatTile
              label="Context used"
              value={pct(util.fraction, util.fraction < 0.01 ? 2 : 1)}
              foot={`${num(tokens)} of ${compact(model.context)} tokens`}
            />
            <StatTile
              label="Tokens per word"
              value={ratio(tok.tokensPerWord)}
              foot={
                tok.tokensPerWord > 1.6
                  ? 'High — code or non-Latin script'
                  : tok.tokensPerWord > 0
                    ? 'Typical for English prose'
                    : '—'
              }
            />
            <StatTile
              label="Unique tokens"
              value={num(tok.unique)}
              foot={`${pct(tok.vocabRatio, 0)} of the prompt is distinct`}
            />
            <StatTile
              label="Formatting tokens"
              value={pct(tok.formattingShare, 1)}
              foot="Indentation and line breaks you are billed for"
            />
          </div>
        </section>

        {/* ---------------------------------------------------------- cost --- */}
        <section className="section" aria-label="Cost">
          <div className="section__head">
            <h2>What it costs</h2>
          </div>
          <p className="section__note">
            Per-call cost for this prompt plus the assumed response, under the assumptions
            above. Selecting a bar or a row changes the model in focus.
          </p>

          <div className="grid grid--halves">
            <ChartCard
              title="Cost per call, by model"
              note="One measure, one hue: the model in focus is highlighted and the rest are context."
              view={costView}
              onView={setCostView}
              table={<ModelTable rows={compared.map((m) => rowsById[m.id]!)} selectedId={model.id} onSelect={setModelId} assumptions={assumptions} base={base} />}
            >
              {empty ? (
                <div className="empty">Enter a prompt to compare costs.</div>
              ) : (
                <BarRows
                  data={costBars}
                  valueLabel={(v) => usd(v)}
                  axisFormat={(v) => usd(v)}
                  onSelect={setModelId}
                />
              )}
            </ChartCard>

            <ChartCard
              title="Tokens per model"
              note="The same text is a different number of tokens on every vendor's vocabulary — which is why cost rankings and token rankings do not always agree."
              view={tokenView}
              onView={setTokenView}
              table={<ModelTable rows={compared.map((m) => rowsById[m.id]!)} selectedId={model.id} onSelect={setModelId} assumptions={assumptions} base={base} />}
            >
              {empty ? (
                <div className="empty">Enter a prompt to compare token counts.</div>
              ) : (
                <BarRows
                  data={tokenBars}
                  valueLabel={(v) => num(v)}
                  axisFormat={(v) => compact(v)}
                  onSelect={setModelId}
                />
              )}
            </ChartCard>
          </div>

          <div className="grid grid--thirds">
            <StatTile label="Per call" value={usd(proj.perCall)} foot={`${model.label}, as configured`} />
            <StatTile label="Per day" value={usd(proj.perDay)} foot={`${num(assumptions.callsPerDay)} calls`} />
            <StatTile label="Per 30 days" value={usd(proj.perMonth)} foot="At the same volume" />
            <StatTile label="Per year" value={usd(proj.perYear)} foot="365 days, unchanged volume" />
          </div>

          <div className="grid grid--halves">
            <section className="card">
              <div className="card__head">
                <h3 className="card__title">Where the money goes</h3>
              </div>
              <p className="card__note">
                One call on {model.label}, split by what you are billed for.
              </p>
              <CostSplit
                input={cost.input}
                output={cost.output}
                cached={cost.cached}
                uncached={cost.uncached}
                cachedShare={assumptions.cachedShare}
              />
            </section>

            <section className="card">
              <div className="card__head">
                <h3 className="card__title">Levers</h3>
              </div>
              <p className="card__note">
                What each published discount is worth on this exact prompt, priced
                independently so you can see which one earns its complexity.
              </p>
              <Levers model={model} tokens={tokens} assumptions={assumptions} />
            </section>
          </div>
        </section>

        {/* ------------------------------------------------------- context --- */}
        <section className="section" aria-label="Context windows">
          <div className="section__head">
            <h2>How much room is left</h2>
          </div>
          <p className="section__note">
            The prompt against each model&apos;s context window. The remaining space has to
            hold the conversation history, tool definitions, retrieved documents and the
            response itself — so a prompt that fits is not the same as a prompt that fits
            comfortably.
          </p>
          <div className="card">
            <div className="stack">
              {compared.map((m) => {
                const r = rowsById[m.id]!;
                const u = utilization(r.tokens, m.context);
                return (
                  <Meter
                    key={m.id}
                    name={
                      <>
                        {m.label} <span className="muted">· {compact(m.context)} ctx</span>
                      </>
                    }
                    fraction={u.fraction}
                    severity={u.severity}
                    value={pct(u.fraction, u.fraction < 0.01 ? 2 : 1)}
                  />
                );
              })}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- anatomy --- */}
        <section className="section" aria-label="Prompt anatomy">
          <div className="section__head">
            <h2>What the prompt is made of</h2>
          </div>
          <p className="section__note">
            Token counts are not a function of length alone. These are the properties that
            move them.
          </p>

          <div className="grid grid--halves">
            <ChartCard
              title="Token length distribution"
              note="How many characters each token covers. A prompt weighted toward one- and two-character tokens is being chopped finely — usually code, unusual names, or a non-Latin script."
              view={lengthView}
              onView={setLengthView}
              table={
                <div className="tablewrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Token length</th>
                        <th>Tokens</th>
                        <th>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tok.lengths.map((b) => (
                        <tr key={b.label}>
                          <td>{b.label}</td>
                          <td>{num(b.count)}</td>
                          <td>{pct(base.pieces.length ? b.count / base.pieces.length : 0, 1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              }
            >
              {empty ? (
                <div className="empty">Enter a prompt to see its token shape.</div>
              ) : (
                <Histogram bins={tok.lengths} axisLabel="token length in characters" format={(n) => num(n)} />
              )}
            </ChartCard>

            <ChartCard
              title="Character composition"
              note="Whitespace and punctuation are billed like everything else. Heavy indentation and dense punctuation are the two cheapest things to fix."
              view={compView}
              onView={setCompView}
              table={
                <div className="tablewrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Class</th>
                        <th>Characters</th>
                        <th>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tm.composition.map((c) => (
                        <tr key={c.key}>
                          <td>{c.label}</td>
                          <td>{num(c.count)}</td>
                          <td>{pct(tm.chars ? c.count / tm.chars : 0, 1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              }
            >
              {empty ? (
                <div className="empty">Enter a prompt to see its composition.</div>
              ) : (
                <>
                  <StackedBar segments={compositionSegments} total={tm.chars} format={(n) => num(n)} />
                  <Legend items={compositionLegend} />
                </>
              )}
            </ChartCard>
          </div>

          <div className="grid grid--halves">
            <section className="card">
              <div className="card__head">
                <h3 className="card__title">Most repeated tokens</h3>
              </div>
              <p className="card__note">
                Repetition is the clearest signal that a prompt can be shortened — or that a
                stable prefix is worth caching.
              </p>
              {tok.repeated.length === 0 ? (
                <div className="empty">No token appears more than once.</div>
              ) : (
                <div className="tablewrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Token</th>
                        <th>Occurrences</th>
                        <th>Tokens spent on repeats</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tok.repeated.map((r) => (
                        <tr key={r.text}>
                          <td>
                            <code>{visibleToken(r.text)}</code>
                          </td>
                          <td>{num(r.count)}</td>
                          <td>{num(r.redundant)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card">
              <div className="card__head">
                <h3 className="card__title">Structure</h3>
              </div>
              <p className="card__note">Plain counts, for sizing and for sanity-checking the rest.</p>
              <div className="grid grid--thirds" style={{ marginTop: 0 }}>
                <StatTile label="Sentences" value={num(tm.sentences)} />
                <StatTile label="Paragraphs" value={num(tm.paragraphs)} />
                <StatTile label="Longest token" value={`${num(tok.longest)} chars`} />
                <StatTile label="Chars w/o spaces" value={compact(tm.charsNoSpaces)} />
                <StatTile
                  label="Bytes per token"
                  value={ratio(tokens ? tm.bytes / tokens : 0)}
                  foot="UTF-8 on the wire"
                />
                <StatTile
                  label="Vocabulary ratio"
                  value={pct(tok.vocabRatio, 0)}
                  foot={tok.vocabRatio < 0.4 && tok.unique > 0 ? 'Repetitive' : 'Varied'}
                />
              </div>
            </section>
          </div>
        </section>

        {/* ----------------------------------------------------- inspector --- */}
        <section className="section" aria-label="Token inspector">
          <div className="section__head">
            <h2>Token by token</h2>
          </div>
          <p className="section__note">
            Where the model actually splits your text. This is the fastest way to see why a
            prompt costs what it does.
          </p>
          <div className="card">
            <TokenInspector
              pieces={base.pieces}
              truncated={base.piecesTruncated}
              totalTokens={base.o200k.length}
            />
          </div>
        </section>

        {/* --------------------------------------------------- full table --- */}
        <section className="section" aria-label="All models">
          <div className="section__head">
            <h2>Every model</h2>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() =>
                setCompareIds(
                  compareIds.length === MODELS.length ? DEFAULT_COMPARE_IDS : MODELS.map((m) => m.id),
                )
              }
            >
              {compareIds.length === MODELS.length ? 'Chart a shortlist' : 'Chart all models'}
            </button>
          </div>
          <p className="section__note">
            Sort by any column. Selecting a row moves the whole dashboard to that model.
          </p>
          <div className="card">
            <ModelTable rows={rows} selectedId={model.id} onSelect={setModelId} assumptions={assumptions} base={base} />
          </div>
        </section>

        <footer className="footer">
          <span>
            Rates as published on {PRICING_AS_OF}. Verify against the vendor&apos;s pricing page
            before budgeting.
          </span>
          <span>
            Exact counts: OpenAI (<code>o200k_base</code>, <code>cl100k_base</code>). Every other
            vendor is estimated — see the badge on each figure.
          </span>
          <span>Your prompt stays in this browser. Nothing is uploaded.</span>
        </footer>
      </main>
    </div>
  );
}

/* --------------------------------------------------------------- sub-views */

/**
 * Standing caveats: the tokenizer still loading, a load that failed, and the case
 * where the prompt's script is one the estimate factors were not calibrated on.
 * Each is stated once, near the numbers it qualifies.
 */
function Notices({
  enc,
  nonLatinShare,
  modelExact,
}: {
  enc: { ready: boolean; secondary: boolean; error: string | null };
  nonLatinShare: number;
  modelExact: boolean;
}) {
  const notes: Array<{ key: string; severity: Severity; text: string }> = [];

  if (enc.error) {
    notes.push({
      key: 'error',
      severity: 'critical',
      text: `The tokenizer could not be loaded (${enc.error}). Counts are unavailable until you reload.`,
    });
  } else if (!enc.ready) {
    notes.push({
      key: 'loading',
      severity: 'warning',
      text: 'Loading the tokenizer tables — counts appear in a moment.',
    });
  }

  if (!modelExact && nonLatinShare > NON_LATIN_WARN_SHARE) {
    notes.push({
      key: 'script',
      severity: 'warning',
      text: `${pct(nonLatinShare, 0)} of the letters here are outside the Latin and CJK blocks. The estimate factors were calibrated on Latin-script text, and vocabularies diverge most on scripts they were not tuned for — treat this count as a lower bound and confirm with the vendor's own token counter.`,
    });
  }

  if (notes.length === 0) return null;

  return (
    <div className="stack" style={{ marginTop: 14 }}>
      {notes.map((n) => (
        <div
          key={n.key}
          className="card"
          role="status"
          style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '11px 13px' }}
        >
          <span style={{ marginTop: 2, flex: 'none' }}>
            <SeverityIcon severity={n.severity} />
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{n.text}</span>
        </div>
      ))}
    </div>
  );
}

function CostSplit({
  input,
  output,
  cached,
  uncached,
  cachedShare,
}: {
  input: number;
  output: number;
  cached: number;
  uncached: number;
  cachedShare: number;
}) {
  const total = input + output;
  if (total <= 0) return <div className="empty">No cost yet.</div>;

  const parts =
    cachedShare > 0
      ? [
          { key: 'cached', label: 'Cached prefix', value: cached, color: 'var(--series-3)' },
          { key: 'uncached', label: 'Fresh input', value: uncached, color: 'var(--series-1)' },
          { key: 'output', label: 'Output', value: output, color: 'var(--series-2)' },
        ]
      : [
          { key: 'input', label: 'Input', value: input, color: 'var(--series-1)' },
          { key: 'output', label: 'Output', value: output, color: 'var(--series-2)' },
        ];

  return (
    <>
      <StackedBar segments={parts.filter((p) => p.value > 0)} total={total} format={(n) => usd(n)} />
      <Legend
        items={parts
          .filter((p) => p.value > 0)
          .map((p) => ({ label: p.label, color: p.color, value: ` ${usd(p.value)}` }))}
      />
      <div className="tablewrap" style={{ marginTop: 12 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Component</th>
              <th>Per call</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p) => (
              <tr key={p.key}>
                <td>{p.label}</td>
                <td>{usd(p.value)}</td>
                <td>{pct(p.value / total, 1)}</td>
              </tr>
            ))}
            <tr>
              <td>
                <b>Total</b>
              </td>
              <td>
                <b>{usd(total)}</b>
              </td>
              <td>100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function Levers({
  model,
  tokens,
  assumptions,
}: {
  model: Model;
  tokens: number;
  assumptions: CostAssumptions;
}) {
  const flat = callCost(model, tokens, assumptions.outputTokens).total;
  if (flat <= 0) return <div className="empty">Enter a prompt to price the levers.</div>;

  // Each lever is priced on its own against the flat baseline, so the numbers
  // answer "what is this one worth" rather than compounding into a single claim.
  const withCache =
    model.cacheReadPerM === undefined
      ? null
      : effectiveCost(model, tokens, {
          ...assumptions,
          cachedShare: Math.max(assumptions.cachedShare, 0.8),
          cacheHitRate: Math.max(assumptions.cacheHitRate, 0.9),
          useBatch: false,
        }).total;

  const withBatch = model.batchDiscount
    ? effectiveCost(model, tokens, { ...assumptions, cachedShare: 0, cacheHitRate: 0, useBatch: true }).total
    : null;

  const trimmed = callCost(model, Math.round(tokens * 0.8), assumptions.outputTokens).total;

  const items = [
    {
      label: 'Cache an 80% prefix at a 90% hit rate',
      value: withCache,
      why:
        model.cacheReadPerM === undefined
          ? 'No published cache rate for this model.'
          : `Reads bill at ${usd(model.cacheReadPerM)} per 1M versus ${usd(model.inputPerM)} uncached.`,
    },
    {
      label: 'Run it through the batch endpoint',
      value: withBatch,
      why: model.batchDiscount
        ? `${pct(model.batchDiscount, 0)} off every token, at the cost of async delivery.`
        : 'No batch endpoint for this model.',
    },
    {
      label: 'Cut the prompt by 20%',
      value: trimmed,
      why: 'Output is unchanged, so the saving is bounded by the input share.',
    },
  ];

  return (
    <div className="tablewrap">
      <table className="data">
        <thead>
          <tr>
            <th>Lever</th>
            <th>Per call</th>
            <th>Saving</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Flat billing, no levers</td>
            <td>{usd(flat)}</td>
            <td>—</td>
          </tr>
          {items.map((it) => (
            <tr key={it.label}>
              <td title={it.why}>{it.label}</td>
              <td>{it.value === null ? '—' : usd(it.value)}</td>
              <td style={it.value !== null && it.value < flat ? { color: 'var(--success-text)', fontWeight: 600 } : undefined}>
                {it.value === null ? 'n/a' : pct(1 - it.value / flat, 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ----------------------------------------------------------------- icons -- */

/**
 * Token blocks: two rows of solid blocks at uneven widths, the same shape the
 * token inspector draws on real text. Solid fills rather than strokes so it
 * still reads at favicon size, and uneven widths so it is not mistaken for a
 * generic grid.
 */
function Mark() {
  return (
    <svg className="brand__mark" viewBox="0 0 24 24" aria-hidden="true" fill="var(--series-1)">
      <rect x="2.5" y="4.5" width="7" height="6" rx="1.8" />
      <rect x="11.5" y="4.5" width="10" height="6" rx="1.8" opacity="0.45" />
      <rect x="2.5" y="13.5" width="10.5" height="6" rx="1.8" opacity="0.45" />
      <rect x="15" y="13.5" width="6.5" height="6" rx="1.8" />
    </svg>
  );
}

function ThemeIcon({ which }: { which: 'light' | 'system' | 'dark' }) {
  if (which === 'light') {
    return (
      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" />
      </svg>
    );
  }
  if (which === 'dark') {
    return (
      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
        <path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z" />
      </svg>
    );
  }
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="1.8" y="3" width="12.4" height="8.4" rx="1.4" />
      <path d="M5.5 13.6h5" strokeLinecap="round" />
    </svg>
  );
}
