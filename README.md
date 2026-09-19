# TokenTicks

Paste a prompt, see what it costs — on Claude, GPT, Gemini, Grok, DeepSeek, Mistral,
Llama, Command and Qwen, side by side.

TokenTicks is a single-page dashboard that tokenises whatever you paste, prices it
against ~30 models, and shows the metrics that explain *why* the number is what it
is: token length distribution, character composition, repetition, formatting
overhead, context-window pressure, and what caching or a batch endpoint would
actually save you.

Everything runs in the browser. Your prompt is never uploaded.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # production bundle into dist/
npm run preview    # serve the built bundle on :4173
npm test           # 61 unit tests: cost math, tokenisation, metrics, formatting, scales
npm run visual-check   # layout/overflow checks in a real browser (needs `npm run preview` running)
```

`dist/` is a static bundle with no backend — host it anywhere that serves files.

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

## What's on the dashboard

- **Headline** — token count, cost per call, projected monthly spend, and what the
  current assumptions are saving versus flat billing.
- **Cost and tokens per model** — the same text is a different number of tokens on
  every vendor's vocabulary, so cost rankings and token rankings do not always agree.
- **Where the money goes** — per-call split across cached prefix, fresh input and output.
- **Context windows** — how full each model's window is, and how much room is left for
  history, tools, retrieved documents and the response.
- **Prompt anatomy** — token length distribution, character composition, most-repeated
  tokens, vocabulary ratio, formatting overhead, bytes per token.
- **Token by token** — the actual BPE boundaries drawn on your prompt, with
  whitespace-heavy tokens highlighted. Usually the fastest way to see where a prompt
  is spending.
- **Every model** — the full registry, sortable on any column.

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
    models.ts      model registry: context windows, rates, tokenizer family
    tokenize.ts    BPE loading, counting, per-family estimate factors
    metrics.ts     text and token statistics
    cost.ts        per-call, cached, batch and projected cost
    scale.ts       axis ticks, bar geometry, label fitting
    format.ts      number, currency and percentage formatting
    samples.ts     example prompts
    useTheme.ts    theme choice and persisted state
    useEncoders.ts post-paint tokenizer loading
  components/      composer, assumptions, charts, tables, inspector
  styles/          design tokens, then everything else
tests/             unit tests (node:test, run against the TypeScript directly)
scripts/           browser-based layout checks
```

### Performance

The BPE rank tables are ~2.4MB and ~1.2MB. Both are dynamic imports: the shell ships
at about 86KB gzipped and paints immediately, the primary encoder follows, and the
secondary one loads in the background afterwards — the two legacy OpenAI counts
upgrade from estimate to exact when it lands. Tokenising is deferred through
`useDeferredValue`, so typing stays responsive on a long paste and the previous
numbers stay on screen at reduced opacity while the next ones compute.

## Adding a model

Add an entry to `MODELS` in `src/lib/models.ts`. `npm test` enforces the registry's
invariants — unique ids, a known tokenizer family, positive rates, output never
cheaper than input, a cache read that is actually a discount, a cache write that is
actually a premium, and a batch discount strictly between 0 and 1.
