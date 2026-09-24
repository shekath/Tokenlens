import { Suspense, lazy, useCallback, useDeferredValue, useMemo, useState } from 'react';
import {
  DEFAULT_COMPARE_IDS,
  DEFAULT_MODEL_ID,
  MODELS,
  MODELS_BY_ID,
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
  type CostAssumptions,
  type Severity,
} from './lib/cost';
import { compact, num, pct, ratio, usd } from './lib/format';
import { useTheme, usePersisted } from './lib/useTheme';
import { useAuth } from './lib/auth';
import { ProfileMenu } from './components/ProfileMenu';
import { TabBoundary } from './components/TabBoundary';
import { retryImport } from './lib/lazyChunk';
import { NAV, ROUTE_LABELS, useHashRoute } from './lib/useHashRoute';
import { SiteFooter } from './components/SiteFooter';
import { useSubscription, type Profile } from './lib/subscription';
import { hasBackend } from './lib/supabase';
import { openAccountSection } from './lib/accountEvents';
import type { User } from '@supabase/supabase-js';
import type { Feature, Plan } from './lib/entitlements';
import type { NewEstimate } from './lib/estimates';
import type { ProposalLine } from './lib/proposal';

import { Composer } from './components/Composer';
import { Assumptions } from './components/Assumptions';
import { AnalyseTab } from './components/AnalyseTab';
// retryImport, not a bare import: a browser holding the previous index.html
// asks for chunk hashes this deploy no longer has, and an unhandled rejection
// there used to blank the page. See lib/lazyChunk.ts.
const CacheSimulator = lazy(() =>
  retryImport(() => import('./components/CacheSimulator'), 'Cache ROI').then((m) => ({
    default: m.CacheSimulator,
  })),
);
const TokenTrimmer = lazy(() =>
  retryImport(() => import('./components/TokenTrimmer'), 'Trimmer').then((m) => ({
    default: m.TokenTrimmer,
  })),
);
const BatchForecaster = lazy(() =>
  retryImport(() => import('./components/BatchForecaster'), 'Batch').then((m) => ({
    default: m.BatchForecaster,
  })),
);
const CacheOrder = lazy(() =>
  retryImport(() => import('./components/CacheOrder'), 'Cache order').then((m) => ({
    default: m.CacheOrder,
  })),
);
const Reconcile = lazy(() =>
  retryImport(() => import('./components/Reconcile'), 'Reconcile').then((m) => ({
    default: m.Reconcile,
  })),
);
const ProposalBuilder = lazy(() =>
  retryImport(() => import('./components/ProposalBuilder'), 'Proposal').then((m) => ({
    default: m.ProposalBuilder,
  })),
);
// The reference pages are lazy too: most visits never open them, and the docs
// page carries its own artwork and screenshots.
const DocsPage = lazy(() =>
  retryImport(() => import('./components/DocsPage'), 'Docs').then((m) => ({ default: m.DocsPage })),
);
const DevToolsPage = lazy(() =>
  retryImport(() => import('./components/DevToolsPage'), 'Dev tools').then((m) => ({ default: m.DevToolsPage })),
);
const FaqPage = lazy(() =>
  retryImport(() => import('./components/FaqPage'), 'FAQ').then((m) => ({ default: m.FaqPage })),
);
const PrivacyPage = lazy(() =>
  retryImport(() => import('./components/PrivacyPage'), 'Privacy Policy').then((m) => ({
    default: m.PrivacyPage,
  })),
);
import { SavedEstimates } from './components/SavedEstimates';
import { ProGatekeeper } from './components/ProGatekeeper';
import { AuthDialog } from './components/AuthDialog';
import { PricingDialog } from './components/PricingDialog';
import type { ModelRow } from './components/ModelTable';
import type { BarDatum } from './components/charts';
import { SeverityIcon, TipRow, type LegendItem } from './components/primitives';

const COMPOSITION_COLORS = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
];

type TabId = 'analyse' | 'cache' | 'order' | 'trimmer' | 'batch' | 'proposal' | 'reconcile' | 'saved';

interface TabDef {
  id: TabId;
  label: string;
  /** Feature that unlocks it; undefined means always open. */
  feature?: Feature;
  /** Shown when locked, in place of the real thing. */
  gate?: { title: string; pitch: string; bullets: string[] };
}

const TABS: TabDef[] = [
  { id: 'analyse', label: 'Analyse' },
  {
    id: 'cache',
    label: 'Cache ROI',
    feature: 'cacheSimulator',
    gate: {
      title: 'Find out whether prompt caching is worth it',
      pitch:
        'Writing to a prompt cache costs 1.25× the base rate; reading from it costs a tenth. Whether that trade pays depends on your hit rate, and the break-even point is not where most people guess.',
      bullets: [
        'Break-even hit rate for any model that publishes cache rates',
        'How many calls a cache entry must serve before it pays for itself',
        'Cost curves from 100 to 1,000,000 invocations',
      ],
    },
  },
  {
    id: 'order',
    label: 'Cache order',
    feature: 'cacheLinter',
    gate: {
      title: 'Find out why your prompt cache is not hitting',
      pitch:
        'Caching is a prefix match: one timestamp, request id or template variable near the top stops everything after it from caching. This finds those values, measures the tokens they lock out, and prices the loss.',
      bullets: [
        'Timestamps, dates, UUIDs, hex ids and template placeholders, by line',
        'Cacheable prefix now against after reordering, in tokens and dollars a month',
        'A reordered prompt with per-call values last, blocks kept whole',
      ],
    },
  },
  {
    id: 'trimmer',
    label: 'Trimmer',
    feature: 'trimmer',
    gate: {
      title: 'Cut the tokens you are paying for by accident',
      pitch:
        'Production prompts accumulate politeness, hedges, duplicated rules and decorative markdown. The Trimmer finds them and prices the waste at your real call volume.',
      bullets: [
        'Eight rules, each measured by re-tokenising rather than guessed',
        'A cleaned prompt you can read, copy or apply',
        'What the saving is worth at 100k and 1M calls',
      ],
    },
  },
  {
    id: 'batch',
    label: 'Batch',
    feature: 'batchForecast',
    gate: {
      title: 'Price a dataset before you run it',
      pitch:
        'Drop in the CSV or JSONL you are about to push through a pipeline and see the bill across every candidate model first.',
      bullets: [
        'CSV, JSONL and NDJSON, parsed in your browser and never uploaded',
        'Up to 10,000 rows per run on Pro',
        'Side-by-side run cost, including batch-endpoint pricing',
      ],
    },
  },
  {
    id: 'proposal',
    label: 'Proposal',
    feature: 'pdfProposal',
    gate: {
      title: 'Hand a client a number they can sign off',
      pitch:
        'Turn the current comparison into a branded PDF: projected monthly burn, the model you recommend, and the assumptions behind both.',
      bullets: [
        'Your company and client details on the cover',
        'Every model you are comparing, with and without caching',
        'Rendered locally — the project never leaves your machine',
      ],
    },
  },
  {
    id: 'reconcile',
    label: 'Reconcile',
    feature: 'usageReconcile',
    gate: {
      title: 'See where the bill and the plan parted ways',
      pitch:
        'Drop in a usage export from your provider and set it against the estimates you saved: not just how far off you were, but whether it was more calls, bigger prompts, longer answers or a model nobody planned for.',
      bullets: [
        'Parsed in your browser, never uploaded',
        'Variance split into volume and per-call effects that add up exactly',
        'Unplanned models and unused estimates called out by name',
      ],
    },
  },
  { id: 'saved', label: 'Saved' },
];

export default function App() {
  const [theme, setTheme] = useTheme();
  const [text, setText] = usePersisted<string>('tokenticks.prompt', '');
  const [modelId, setModelId] = usePersisted<string>('tokenticks.model', DEFAULT_MODEL_ID, (v) =>
    typeof v === 'string' && MODELS_BY_ID[v] ? v : null,
  );
  const [assumptions, setAssumptions] = usePersisted<CostAssumptions>(
    'tokenticks.assumptions',
    DEFAULT_ASSUMPTIONS,
    (v) => (v && typeof v === 'object' ? { ...DEFAULT_ASSUMPTIONS, ...(v as CostAssumptions) } : null),
  );
  const [compareIds, setCompareIds] = usePersisted<string[]>(
    'tokenticks.compare',
    DEFAULT_COMPARE_IDS,
    (v) => (Array.isArray(v) ? v.filter((id) => typeof id === 'string' && MODELS_BY_ID[id]) : null),
  );

  const [tab, setTab] = useState<TabId>('analyse');
  const [authOpen, setAuthOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const [route, goTo] = useHashRoute();
  const auth = useAuth();
  const sub = useSubscription(auth.user);
  const ent = sub.entitlements;

  // Free accounts price a shortlist; everyone else sees the whole registry.
  const availableModels = useMemo(
    () =>
      ent.modelAllowlist === null
        ? MODELS
        : MODELS.filter((m) => ent.modelAllowlist!.includes(m.id)),
    [ent.modelAllowlist],
  );

  const deferredText = useDeferredValue(text);
  const stale = deferredText !== text;

  const enc = useEncoders();
  const base = useMemo(
    () => (enc.ready ? encodeBase(deferredText) : EMPTY_BASE),
    [deferredText, enc.ready, enc.secondary],
  );

  // A locked model in storage must not strand the dashboard on a blank screen.
  const model: Model =
    availableModels.find((m) => m.id === modelId) ??
    availableModels[0] ??
    MODELS_BY_ID[DEFAULT_MODEL_ID]!;

  const tm = useMemo(() => textMetrics(deferredText), [deferredText]);
  const tokens = useMemo(() => countFor(model, base), [model, base]);
  const tok = useMemo(
    () => tokenMetrics(base, tokens, tm.words, tm.chars),
    [base, tokens, tm.words, tm.chars],
  );
  const exact = isExact(model, base);

  const cost = useMemo(() => effectiveCost(model, tokens, assumptions), [model, tokens, assumptions]);
  const naive = useMemo(
    () => callCost(model, tokens, assumptions.outputTokens),
    [model, tokens, assumptions.outputTokens],
  );
  const proj = useMemo(
    () => project(cost.total, assumptions.callsPerDay),
    [cost, assumptions.callsPerDay],
  );

  const compared = useMemo(
    () =>
      compareIds
        .map((id) => MODELS_BY_ID[id])
        .filter((m): m is Model => Boolean(m) && availableModels.some((a) => a.id === m!.id)),
    [compareIds, availableModels],
  );

  const rows: ModelRow[] = useMemo(
    () =>
      availableModels.map((m) => {
        const t = countFor(m, base);
        return { model: m, tokens: t, cost: effectiveCost(m, t, assumptions) };
      }),
    [base, assumptions, availableModels],
  );
  const rowsById = useMemo(() => Object.fromEntries(rows.map((r) => [r.model.id, r])), [rows]);

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
                <TipRow
                  label={`At ${compact(assumptions.callsPerDay)}/day`}
                  value={usd(r.cost.total * assumptions.callsPerDay)}
                />
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
  const saving = naive.total > 0 ? 1 - cost.total / naive.total : 0;

  /** Token counting for the Pro tabs, against the model in focus. */
  const countTokens = useCallback(
    (s: string) => {
      if (!enc.ready || s.length === 0) return 0;
      return countFor(model, encodeBase(s));
    },
    [enc.ready, enc.secondary, model],
  );

  const scaleTokens = useCallback(
    (m: Model, baseTokens: number) => Math.round(baseTokens * FAMILY_INFO[m.tokenizer].factor),
    [],
  );

  const proposalLines: ProposalLine[] = useMemo(
    () =>
      compared.map((m) => {
        const r = rowsById[m.id]!;
        const flat = callCost(m, r.tokens, assumptions.outputTokens).total;
        return {
          model: m,
          inputTokens: r.tokens,
          outputTokens: assumptions.outputTokens,
          callsPerDay: assumptions.callsPerDay,
          monthlyCost: flat * assumptions.callsPerDay * 30,
          cachedMonthlyCost:
            assumptions.cachedShare > 0 && m.cacheReadPerM !== undefined
              ? r.cost.total * assumptions.callsPerDay * 30
              : null,
        };
      }),
    [compared, rowsById, assumptions],
  );

  const draft: NewEstimate | null = empty
    ? null
    : {
        projectTitle: `${model.label} — ${num(tokens)} tokens`,
        modelId: model.id,
        inputTokens: tokens,
        outputTokens: assumptions.outputTokens,
        cachedTokens: Math.round(tokens * assumptions.cachedShare),
        estimatedCostUsd: cost.total,
        promptPreview: deferredText.slice(0, 280),
        promptMetadata: {
          chars: tm.chars,
          words: tm.words,
          charsPerToken: Number(tok.charsPerToken.toFixed(3)),
          exact,
          encoding: FAMILY_INFO[model.tokenizer].encoding,
          // So Reconcile can compare against the volume this estimate assumed.
          callsPerDay: assumptions.callsPerDay,
        },
      };

  const openPricing = useCallback(() => setPricingOpen(true), []);
  const showComposer = tab === 'analyse' || tab === 'trimmer' || tab === 'order';
  const showAssumptions = tab === 'analyse' || tab === 'proposal';

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__inner">
          <span className="brand">
            <Mark />
            TokenTicks
            <span className="brand__sub">AI FinOps &amp; prompt intelligence</span>
          </span>

          <div className="row">
            <label className="sr-only" htmlFor="model">
              Model in focus
            </label>
            <select id="model" className="select" value={model.id} onChange={(e) => setModelId(e.target.value)}>
              {VENDORS.map((v) => {
                const group = availableModels.filter((m) => m.vendor === v);
                if (group.length === 0) return null;
                return (
                  <optgroup key={v} label={v}>
                    {group.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>

            {!ent.features.allModels ? (
              <button type="button" className="btn btn--ghost" onClick={openPricing} title="Free plans price five models">
                +{MODELS.length - availableModels.length} more
              </button>
            ) : null}

            <nav className="navlinks" aria-label="Pages">
              {NAV.map((item) => (
                <button
                  key={item.route}
                  type="button"
                  className={route === item.route ? 'navlink is-on' : 'navlink'}
                  aria-current={route === item.route ? 'page' : undefined}
                  onClick={() => goTo(item.route)}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <Account
              user={auth.user}
              profile={sub.profile}
              tier={sub.tier}
              ready={auth.ready}
              onSignIn={() => setAuthOpen(true)}
              onSignOut={() => void auth.signOut()}
              onPricing={openPricing}
              onProfileSaved={() => void sub.refresh()}
            />

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

      {route !== 'app' ? (
        <TabBoundary label={ROUTE_LABELS[route]}>
          <Suspense fallback={<div className="shell empty">Loading…</div>}>
            {route === 'docs' ? (
              <DocsPage onPricing={openPricing} onBack={() => goTo('app')} onDevTools={() => goTo('devtools')} />
            ) : route === 'devtools' ? (
              <DevToolsPage
                onBack={() => goTo('app')}
                onKeys={
                  !hasBackend
                    ? null
                    : auth.user
                      ? () => openAccountSection('keys')
                      : () => setAuthOpen(true)
                }
              />
            ) : route === 'privacy' ? (
              <PrivacyPage onBack={() => goTo('app')} />
            ) : (
              <FaqPage onBack={() => goTo('app')} />
            )}
          </Suspense>
        </TabBoundary>
      ) : null}

      {/* Hidden rather than unmounted: the dashboard holds the prompt, the
          comparison and the tokeniser tables, and rebuilding all of that on
          the way back from a docs page would be a slow, pointless flash. */}
      <main
        className="shell"
        hidden={route !== 'app'}
        style={stale ? { opacity: 0.72 } : undefined}
      >
        {showComposer ? (
          <Composer
            text={text}
            onChange={setText}
            chars={tm.chars}
            words={tm.words}
            lines={tm.lines}
            bytes={tm.bytes}
          />
        ) : null}

        {auth.redirectError ? (
          <p className="notice notice--error" style={{ marginTop: 14 }} role="alert">
            <strong>Sign-in did not complete.</strong> {auth.redirectError}{' '}
            <button type="button" className="btn btn--ghost" onClick={auth.dismissRedirectError}>
              Dismiss
            </button>
          </p>
        ) : null}

        {sub.error ? (
          <p className="notice notice--error" style={{ marginTop: 14 }} role="alert">
            <strong>Your account could not be loaded.</strong> {sub.error} Paid features
            will read as unavailable until this clears — nothing has been lost, and
            reloading usually fixes it.
          </p>
        ) : null}

        {sub.preview ? (
          <p className="notice notice--warn" style={{ marginTop: 14 }} role="status">
            <strong>Preview mode.</strong> Paid features are unlocked locally by the{' '}
            <code>?preview={sub.preview}</code> parameter so the product can be reviewed
            without live billing. No subscription has been granted — the database still
            treats this account as {sub.profile?.tier ?? 'free'}, and anything it enforces
            (saved-estimate limits, your real tier) is unchanged.
          </p>
        ) : null}

        <Notices enc={enc} nonLatinShare={base.nonLatinShare} modelExact={exact} />

        {showAssumptions ? (
          <Assumptions
            value={assumptions}
            onChange={setAssumptions}
            cacheSupported={model.cacheReadPerM !== undefined}
            batchSupported={Boolean(model.batchDiscount)}
          />
        ) : null}

        <nav className="tabs" role="tablist" aria-label="Workbench sections">
          {TABS.map((t) => {
            const locked = t.feature ? !sub.can(t.feature) : false;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={tab === t.id ? 'tab is-on' : 'tab'}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {locked ? (
                  <span className="tab__lock" aria-label="requires an upgrade">
                    <SmallLock />
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="section" style={{ marginTop: 18 }}>
          {tab === 'analyse' ? (
            <AnalyseTab
              model={model}
              base={base}
              tm={tm}
              tok={tok}
              tokens={tokens}
              exact={exact}
              assumptions={assumptions}
              cost={cost}
              proj={proj}
              rows={rows}
              rowsById={rowsById}
              compared={compared}
              compositionSegments={compositionSegments}
              compositionLegend={compositionLegend}
              costBars={costBars}
              tokenBars={tokenBars}
              saving={saving}
              empty={empty}
              setModelId={setModelId}
              comparingAll={compareIds.length === availableModels.length}
              onToggleCompareAll={() =>
                setCompareIds(
                  compareIds.length === availableModels.length
                    ? DEFAULT_COMPARE_IDS
                    : availableModels.map((m) => m.id),
                )
              }
            />
          ) : null}

          {TABS.filter((t) => t.gate && t.feature).map((t) =>
            tab === t.id ? (
              <ProGatekeeper
                key={t.id}
                feature={t.feature!}
                title={t.gate!.title}
                pitch={t.gate!.pitch}
                bullets={t.gate!.bullets}
                unlocked={sub.can(t.feature!)}
                onUpgrade={openPricing}
              >
                <TabBoundary label={t.label}>
                <Suspense fallback={<div className="empty">Loading…</div>}>
                  {t.id === 'cache' ? (
                  <CacheSimulator
                    model={model}
                    models={availableModels}
                    onModel={setModelId}
                    seedFreshTokens={tokens}
                  />
                ) : t.id === 'order' ? (
                  <CacheOrder
                    text={deferredText}
                    model={model}
                    countTokens={countTokens}
                    callsPerDay={assumptions.callsPerDay}
                    onApply={setText}
                  />
                ) : t.id === 'reconcile' ? (
                  <Reconcile userId={auth.user?.id ?? null} defaultCallsPerDay={assumptions.callsPerDay} />
                ) : t.id === 'trimmer' ? (
                  <TokenTrimmer text={deferredText} model={model} countTokens={countTokens} onApply={setText} />
                ) : t.id === 'batch' ? (
                  <BatchForecaster
                    models={compared.length > 0 ? compared : availableModels.slice(0, 6)}
                    countTokens={(s) => (enc.ready ? encodeBase(s).o200k.length : 0)}
                    scaleTokens={scaleTokens}
                    maxRows={ent.maxBatchRows}
                    canExport={sub.can('csvExport')}
                  />
                ) : (
                    <ProposalBuilder
                      lines={proposalLines}
                      assumptions={assumptions}
                      defaultModel={model}
                      whiteLabelAllowed={sub.can('whiteLabel')}
                    />
                  )}
                </Suspense>
                </TabBoundary>
              </ProGatekeeper>
            ) : null,
          )}

          {tab === 'saved' ? (
            <SavedEstimates
              userId={auth.user?.id ?? null}
              maxSaved={ent.maxSavedEstimates}
              canShare={sub.can('shareLinks')}
              draft={draft}
              onUpgrade={openPricing}
              onSignIn={() => setAuthOpen(true)}
            />
          ) : null}
        </div>

      </main>

      <SiteFooter
        route={route}
        onNavigate={goTo}
        onPricing={openPricing}
        profile={sub.profile}
        email={auth.user?.email ?? null}
      />

      <AuthDialog
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        signIn={auth.signIn}
        signUp={auth.signUp}
        signInWithMagicLink={auth.signInWithMagicLink}
        signInWithGoogle={auth.signInWithGoogle}
      />
      <PricingDialog
        open={pricingOpen}
        onClose={() => {
          setPricingOpen(false);
          sub.dismissCheckoutError();
        }}
        currentTier={sub.tier}
        signedIn={Boolean(auth.user)}
        hasSubscription={Boolean(sub.profile?.hasSubscription)}
        error={sub.checkoutError}
        switching={switching}
        onSwitch={(plan: Plan, period) => {
          setSwitching(true);
          void sub
            .switchPlan(plan.tier as 'pro' | 'team', period)
            .then(() => setPricingOpen(false))
            // The reason is already in sub.checkoutError, which the dialog
            // shows; the dialog stays open so it can be read.
            .catch(() => {})
            .finally(() => setSwitching(false));
        }}
        onCheckout={(plan: Plan, period) => {
          // Only on success. Closing regardless is what made a failed checkout
          // look like the dialog simply vanishing.
          if (sub.openCheckout(plan, period)) setPricingOpen(false);
        }}
        onNeedAccount={() => {
          setPricingOpen(false);
          setAuthOpen(true);
        }}
      />
    </div>
  );
}

/* --------------------------------------------------------------- account -- */

function Account({
  user,
  profile,
  tier,
  ready,
  onSignIn,
  onSignOut,
  onPricing,
  onProfileSaved,
}: {
  user: User | null;
  profile: Profile | null;
  tier: 'free' | 'pro' | 'team';
  ready: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onPricing: () => void;
  onProfileSaved: () => void;
}) {
  if (!hasBackend) {
    return (
      <button type="button" className="btn btn--ghost" onClick={onPricing} title="Accounts need a Supabase backend">
        Plans
      </button>
    );
  }
  if (!ready) return <span className="muted" style={{ fontSize: 12 }}>…</span>;

  if (!user) {
    return (
      <span className="account">
        <button type="button" className="btn btn--ghost" onClick={onPricing}>
          Plans
        </button>
        <button type="button" className="btn" onClick={onSignIn}>
          Sign in
        </button>
      </span>
    );
  }

  return (
    <span className="account">
      {tier === 'free' ? (
        <button type="button" className="btn btn--primary" onClick={onPricing}>
          Upgrade
        </button>
      ) : null}
      <ProfileMenu
        user={user}
        profile={profile}
        tier={tier}
        onPricing={onPricing}
        onSignOut={onSignOut}
        onSaved={onProfileSaved}
      />
    </span>
  );
}

function SmallLock() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2.6" y="5.4" width="6.8" height="5" rx="1.3" />
      <path d="M4.3 5.4V4.2a1.7 1.7 0 0 1 3.4 0v1.2" />
    </svg>
  );
}

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
