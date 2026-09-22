# TokenTicks

**AI FinOps and prompt intelligence.** Paste a prompt, see what it costs across
~30 models — then find out whether caching pays, what the fat in your prompt is
worth, what a dataset will cost before you run it, and hand a client a PDF they
can sign off.

The token counter is un-gated and needs no account: paste, count, compare, leave.
Paid tiers add the operational tooling around it.

| | Hobby (free) | Pro ($12/mo, $99/yr) | Team ($39/mo) |
|---|---|---|---|
| Model coverage | Top 5 foundational | All 30+ | All + custom rate cards |
| Caching maths | Baseline uncached | Break-even & ROI simulator | TTL lifecycle, multi-turn |
| Batch ingestion | Single paste | CSV / JSONL, 10k rows | Unlimited |
| Optimisation | Character & word counts | Token Trimmer linter | Team-wide rules |
| Exports | Copy as Markdown | Branded PDF + CSV | White-label + share links |
| Saved estimates | 3 | Unlimited | Unlimited |

Everything computes in the browser. Prompts are never uploaded — not by the free
dashboard, not by the batch forecaster, and not by a signed-in account (a saved
estimate stores token counts and costs, plus an optional 280-character excerpt;
never the prompt).

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # production bundle into dist/
npm run preview    # serve the built bundle on :4173
npm test           # 121 unit tests: cost, tokenisation, metrics, entitlements, caching, trimmer, batch
npm run visual-check   # layout/overflow checks in a real browser (needs `npm run preview` running)
```

`dist/` is a static bundle. **It runs with no backend at all**: accounts and paid
features report as unavailable and every local calculation still works, which is
how the GitHub Pages deployment runs today.

To enable accounts, billing and saved estimates, copy `.env.example` to `.env`
and follow [`supabase/README.md`](supabase/README.md).

### Previewing the paid tiers

`?preview=pro` or `?preview=team` unlocks the paid tabs locally and raises a
banner saying so. It grants nothing real: every paid feature here computes in the
browser, so the gate was always a purchasing prompt rather than a lock, and the
limits that matter are enforced in Postgres against the signed-in user's actual
profile row.

## How the numbers are produced

### Token counts

| Vendor | Counted with | Accuracy |
|---|---|---|
| OpenAI GPT-4o / 4.1 / 5 / o-series | `o200k_base` BPE, run in full | **Exact** |
| OpenAI GPT-4 Turbo / 3.5 Turbo | `cl100k_base` BPE, run in full | **Exact** |
| Anthropic, Google, xAI, DeepSeek, Mistral, Meta, Cohere, Alibaba | `o200k_base` × a per-family factor | Estimate |

Anthropic and xAI do not publish a client-side tokenizer; Gemini, Mistral and Qwen
use SentencePiece-style vocabularies whose rank tables are megabytes each. Rather
than fall back on `characters / 4` — which is blind to code, punctuation density and
script, the three things that actually move a token count — TokenTicks runs the real
o200k BPE and scales the result by a per-family factor. The structure of your text
is preserved; only the vocabulary's efficiency is approximated.

Estimated figures are labelled `estimate` and prefixed `~` everywhere they appear.
The factors live in `src/lib/tokenize.ts` with the reasoning attached to each one.

**Known limitation:** the factors are calibrated on Latin-script text. Vocabularies
diverge hardest on scripts they were not tuned for — measured against `cl100k`, the
same sentence in Cyrillic or Devanagari can cost twice what a flat factor predicts.
When more than 15% of a prompt's letters fall outside the Latin and CJK blocks, the
dashboard says so instead of quietly reporting the estimate at face value. For a
figure you intend to bill against, use the vendor's own counter — Anthropic's
`messages.count_tokens` endpoint, for instance.

### Costs

Rates are per million tokens, as published on the date shown in the footer
(`PRICING_AS_OF` in `src/lib/models.ts`). Anthropic rates are first-party Claude API
rates; other vendors' are their direct-API list prices. Open-weight models (Llama,
Qwen) have no single list price, so they carry a representative serverless-host rate
and are marked `hosted`.

Four assumptions scope every cost figure on the page:

- **Expected output** — a prompt has no price until you say what comes back. On short
  prompts the response usually dominates the bill.
- **Calls per day** — drives the day / month / year projections.
- **Cacheable prefix** and **cache hit rate** — a miss pays the write premium
  (1.25× input on Anthropic), a hit pays the read rate (0.1× input, or a flat
  $0.25/MTok on Claude Fable 5.1). The two are blended by hit rate to give the
  expected cost of a call in steady state.
- **Batch endpoint** — 50% off every token, cache reads and writes included.

The **Levers** card prices each discount independently against flat billing, so you
can see which one is worth its complexity on *your* prompt rather than in general.

Prices move. Verify against the vendor's pricing page before you budget against
anything here.

## What's in it

### Analyse — free, un-gated

Token count, per-call cost, projected monthly spend, context-window pressure,
token length distribution, character composition, repeated tokens, formatting
overhead, and a token-by-token inspector that draws the real BPE boundaries on
your prompt.

### Cache ROI — Pro

Writing to a prompt cache costs 1.25× the base rate and reading costs a tenth, so
whether caching pays depends on the hit rate. Setting the two input costs equal
gives the break-even directly:

```
h* = (P_write − P_base) / (P_write − P_read)
```

At Anthropic's published multipliers that is `0.25 / 1.15` = **21.7%** — below
which caching is a net loss. It depends only on the rates, not on volume or
prompt size, which is why it is stated as a headline number rather than buried in
a chart. The simulator plots cost against hit rate with the crossing marked, and
scales the same shape from 100 to 1,000,000 invocations.

### Trimmer — Pro

Eight rules for the ceremony that accumulates in production prompts: politeness,
role preambles, hedges, verbose connectives, duplicated instructions, decorative
markdown, blank-line runs, trailing whitespace.

Each rule's saving is **measured, not estimated** — the rule is applied on its own
and the result re-tokenised, so the figure beside it is the real token delta. A
rewrite can occasionally cost tokens by splitting a word the vocabulary had
whole, and the tool says so rather than assuming character count is a proxy.

Rules are individually toggleable and split into "safe to remove" and "read
before accepting". Nothing touches a number, a proper noun, a constraint or a
negation.

### Batch — Pro

Drop in a CSV, JSONL or NDJSON file, pick the prompt column (it guesses), and get
the run cost across every candidate model, including batch-endpoint pricing.
Parsed in the browser — the point of the tool is pricing customer prompts, and
uploading them to do that would be a worse promise.

### Proposal — Pro

The current comparison as a branded PDF: recommended model, monthly cost per
model with and without caching, and the assumptions behind both. Rendered
locally with jsPDF.

### Accounts

Email and password, magic link, or **Continue with Google**. A saved estimate
stores token counts and costs plus an optional 280-character excerpt — never the
prompt. See `supabase/README.md` for the Google OAuth setup.

The header carries a profile menu: who you are signed in as, your plan, your
account reference, and the settings behind it — full name, the name the app
addresses you by, email, phone, country, and setting or changing a password. An
account created through Google can set a first password there, which is what
makes it reachable without Google afterwards.

**Account ID.** Each account gets a `TT-XXXXX-XXXXX` reference at sign-up. It
is the thing to quote to support: short enough to read out, generated by the
app, and immutable — the database reverts any attempt to change it, so it is
worth trusting. It is not a credential and showing it grants nothing. The
internal uuid stays internal.

### Saved — account required

Named estimates, with the free tier capped at 3 by a database policy rather than
a client check. Team can mint share links, which expose the project title, model
and cost only.

## Architecture

```
Browser (Vite + React)          Supabase                    Lemon Squeezy
─────────────────────           ────────                    ─────────────
tokenisation, costing,          profiles  ◄── service ──┐   checkout
caching maths, linting,         saved_estimates  role   │   webhooks ──┐
batch parsing, PDF              billing_events          │              │
      │                               ▲                 └── Edge Function
      └────── anon key, RLS ──────────┘                     (HMAC verify,
                                                             idempotent)
```

The client never writes its own tier. `profiles.tier` is written only by the
webhook through the service role; RLS grants the user SELECT on their own profile
and UPDATE on their display name, and a trigger reverts the billing columns for
any non-service-role caller regardless of what the policies allow.

### Security posture

- **Client-side gating is a purchasing prompt, not a lock.** Every paid
  calculation runs in the browser, so it could not be otherwise. The blueprint
  asked for gated content rendered behind `blur-sm`; that is worse than useless —
  the content sits in the DOM for anyone with an element inspector. Locked
  features render a description of what is behind them instead.
- **The limits that matter are in Postgres**, and they are tested rather than
  asserted. `./supabase/tests/run.sh` applies the schema to a throwaway
  PostgreSQL database and checks tenant isolation, the billing-column lock, the
  free cap, the Team-only share gate and the sharing view's column list — 22
  assertions, no Supabase account needed.
- **A service-role key in `VITE_SUPABASE_ANON_KEY` refuses to start the client**
  with an explanation. It is an easy mistake, it is silent, and it would hand
  every visitor full database access.
- **Sharing goes through a view**, so the column list is the security boundary and
  a shared cost figure cannot leak the prompt or the owner.
- **The webhook verifies HMAC over raw bytes**, rejects malformed signatures
  before comparison, and claims each delivery in a ledger so retries are no-ops.

## Design notes

- **Light and dark are both first-class.** Dark is a selected set of steps against a
  dark surface, not an inverted light theme. The toggle wins over the OS setting in
  both directions, and the choice is stamped before first paint so a dark-mode reload
  never flashes white.
- **The categorical palette is validated, not eyeballed.** Both modes clear the
  colourblind-separation, lightness-band, chroma and contrast gates. Three light-mode
  slots sit below 3:1 against the surface, so every chart that uses them ships a
  labelled legend and a table view — colour is never the only channel.
- **Every chart has a table twin**, toggled from the card header.
- **Charts are drawn at measured pixel size.** A viewBox scaled to fit distorts every
  glyph horizontally and makes label-fit arithmetic meaningless; measuring first
  costs one render and makes the geometry exact.
- **Responsive down to 320px** with no horizontal page scroll, verified by
  `npm run visual-check`.

## Layout

```
src/
  lib/
    models.ts        model registry: context windows, rates, tokenizer family
    tokenize.ts      BPE loading, counting, per-family estimate factors
    metrics.ts       text and token statistics
    cost.ts          per-call, cached, batch and projected cost
    cacheSim.ts      break-even maths for prompt caching
    trimmer.ts       the prompt linter's rules and measurement
    batch.ts         CSV / JSONL parsing and dataset forecasting
    proposal.ts      PDF generation (jsPDF, dynamically imported)
    entitlements.ts  the pricing matrix — every gate reads from here
    supabase.ts      typed client, optional, with a service-role guardrail
    auth.ts          session state
    authRedirect.ts  what an auth redirect left in the URL, and what it means
    profile.ts       profile writes and password changes
    profileFields.ts field rules, mirroring the table's check constraints
    countries.ts     ISO 3166-1 alpha-2, named through Intl
    menuPlacement.ts dropdown placement arithmetic, clamped to the viewport
    billing.ts       effective tier and the one line of subscription state
    subscription.ts  plan, entitlements and checkout
    estimates.ts     saved-estimate CRUD
    scale.ts         axis ticks, bar geometry, label fitting
    format.ts        number, currency and percentage formatting
  components/        composer, tabs, charts, tables, dialogs, paid features
  styles/            design tokens, then everything else
supabase/
  migrations/        schema, RLS policies, triggers
                     0007 is the one worth reading: subscriptions are rows,
                     and the account's tier is derived from the live ones
  functions/         the Lemon Squeezy webhook
tests/               unit tests (node:test, run against the TypeScript directly)
scripts/             browser-based layout checks, billing config preflight
```

### Performance

The BPE rank tables are ~2.4MB and ~1.2MB. Both are dynamic imports: the shell
ships at about 96KB gzipped and paints immediately, the primary encoder follows,
and the secondary one loads in the background afterwards — the two legacy OpenAI
counts upgrade from estimate to exact when it lands.

The paid tabs are `React.lazy` chunks, and jsPDF is imported inside the export
handler rather than at module scope. jsPDF pulls in html2canvas and dompurify for
its HTML renderer — about 390KB raw — which would otherwise land in the main
chunk for every visitor who never exports a PDF.

Tokenising is deferred through `useDeferredValue`, so typing stays responsive on
a long paste and the previous numbers stay on screen at reduced opacity while the
next ones compute.

## Adding a model

Add an entry to `MODELS` in `src/lib/models.ts`. `npm test` enforces the registry's
invariants — unique ids, a known tokenizer family, positive rates, output never
cheaper than input, a cache read that is actually a discount, a cache write that is
actually a premium, and a batch discount strictly between 0 and 1.
