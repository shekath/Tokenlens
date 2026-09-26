import { useState } from 'react';
import type { Model } from '../lib/models';
import { FAMILY_INFO, type BaseEncoding } from '../lib/tokenize';
import type { TextMetrics, TokenMetrics } from '../lib/metrics';
import { callCost, effectiveCost, utilization, type CostAssumptions } from '../lib/cost';
import { compact, num, pct, ratio, usd, usdAxis, visibleToken } from '../lib/format';
import { ModelTable, type ModelRow } from './ModelTable';
import { BudgetCard } from './BudgetCard';
import { TokenInspector } from './TokenInspector';
import { BarRows, Histogram, StackedBar, type BarDatum } from './charts';
import { niceTicks } from '../lib/scale';
import { ChartCard, ExactBadge, Legend, Meter, StatTile, type LegendItem } from './primitives';

type View = 'chart' | 'table';

export interface AnalyseTabProps {
  model: Model;
  base: BaseEncoding;
  tm: TextMetrics;
  tok: TokenMetrics;
  tokens: number;
  exact: boolean;
  assumptions: CostAssumptions;
  cost: ReturnType<typeof effectiveCost>;
  proj: { perCall: number; perDay: number; perMonth: number; perYear: number };
  rows: ModelRow[];
  rowsById: Record<string, ModelRow>;
  compared: Model[];
  compositionSegments: Array<{ key: string; label: string; value: number; color: string }>;
  compositionLegend: LegendItem[];
  costBars: BarDatum[];
  tokenBars: BarDatum[];
  saving: number;
  empty: boolean;
  setModelId: (id: string) => void;
  onToggleCompareAll: () => void;
  comparingAll: boolean;
}

/**
 * The free, un-gated dashboard: token counts, costs and prompt anatomy. This is
 * the whole product for a Hobby account and the acquisition surface for the rest,
 * so nothing here is behind a paywall except the breadth of the model list.
 */
export function AnalyseTab({
  model,
  base,
  tm,
  tok,
  tokens,
  exact,
  assumptions,
  cost,
  proj,
  rows,
  rowsById,
  compared,
  compositionSegments,
  compositionLegend,
  costBars,
  tokenBars,
  saving,
  empty,
  setModelId,
  onToggleCompareAll,
  comparingAll,
}: AnalyseTabProps) {
  const [costView, setCostView] = useState<View>('chart');
  const [tokenView, setTokenView] = useState<View>('chart');
  const [lengthView, setLengthView] = useState<View>('chart');
  const [compView, setCompView] = useState<View>('chart');
  const family = FAMILY_INFO[model.tokenizer];
  const util = utilization(tokens, model.context);

  return (
    <>
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
                  axisFormat={usdAxis(niceTicks(Math.max(...costBars.map((b) => b.value), 0)))}
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

          {empty ? null : (
            <BudgetCard
              rows={rows}
              model={model}
              plannedCallsPerDay={assumptions.callsPerDay}
              onSelect={setModelId}
            />
          )}
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
            <button type="button" className="btn btn--ghost" onClick={onToggleCompareAll}>
              {comparingAll ? 'Chart a shortlist' : 'Chart all models'}
            </button>
          </div>
          <p className="section__note">
            Search by name, filter by company, sort by any column. Selecting a row moves the
            whole dashboard to that model.
          </p>
          <div className="card">
            <ModelTable rows={rows} selectedId={model.id} onSelect={setModelId} assumptions={assumptions} base={base} />
          </div>
        </section>
    </>
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
