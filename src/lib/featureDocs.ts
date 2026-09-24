/**
 * The documentation for the paid features.
 *
 * Content as data, so the page is layout and this file is the thing to check
 * for accuracy. Each entry has to describe the build it ships with: the limits
 * are read from the entitlements matrix rather than retyped, because a number
 * repeated in prose is a number that goes stale.
 */

import { ENTITLEMENTS, type Tier } from './entitlements';
import { MODELS } from './models';

export interface FeatureDoc {
  id: string;
  /** Matches the tab it documents, where there is one. */
  title: string;
  tier: Exclude<Tier, 'free'>;
  /** One line, for the card and the banner. */
  tagline: string;
  /** The motif the banner draws. */
  art: 'cache' | 'trim' | 'batch' | 'proposal' | 'models' | 'share';
  /** Screenshot base name under public/docs, or null where there is no tab. */
  shot: string | null;
  what: string[];
  how: { step: string; detail: string }[];
  when: string[];
}

const PRO = ENTITLEMENTS.pro;

export const FEATURE_DOCS: FeatureDoc[] = [
  {
    id: 'models',
    title: 'The full model registry',
    tier: 'pro',
    tagline: `All ${MODELS.length} models across nine vendors, priced side by side.`,
    art: 'models',
    shot: 'dashboard',
    what: [
      `A free account prices five foundational models. Pro opens the whole registry — ${MODELS.length} models across nine vendors, each with its published input, output and cache rates.`,
      'The comparison is the point. The same prompt can differ by more than an order of magnitude between two models that look equivalent on a capability chart.',
    ],
    how: [
      {
        step: 'Paste once, compare everywhere',
        detail:
          'The prompt is tokenised once and priced against every model you are comparing, so the numbers are like for like rather than four separate measurements.',
      },
      {
        step: 'Exact where it can be, honest where it cannot',
        detail:
          'OpenAI models use the real BPE tokeniser and are exact. Everything else is estimated from a measured per-family factor and carries a badge saying so.',
      },
      {
        step: 'Cache-aware from the start',
        detail:
          'Cached and fresh tokens are priced separately, so a figure reflects the way you actually call the model rather than a cold-start worst case.',
      },
    ],
    when: [
      'Choosing between two models where the capability difference is small and the cost difference is not.',
      'Sanity-checking a vendor’s own pricing calculator against your real prompt.',
    ],
  },
  {
    id: 'cache',
    title: 'Cache ROI simulator',
    tier: 'pro',
    tagline: 'Find out whether prompt caching pays, before you build for it.',
    art: 'cache',
    shot: 'cache',
    what: [
      'Writing to a prompt cache costs more than an ordinary input token; reading from one costs much less. Whether the trade pays depends on your hit rate, and the break-even is not where most people guess — around 22% at Anthropic’s published multipliers.',
      'This computes that break-even for any model that publishes cache rates, and shows the cost curves either side of it.',
    ],
    how: [
      {
        step: 'Set your cached share and hit rate',
        detail:
          'How much of the prompt is cacheable, and how often you expect to hit it. Both are sliders, and every figure on the page moves with them.',
      },
      {
        step: 'Read the break-even',
        detail:
          'h* = (write − base) / (write − read). Below it, caching costs you money; above it, it saves. The number is shown against your model’s own rates.',
      },
      {
        step: 'Check it at your volume',
        detail:
          'Cost curves from a hundred to a million invocations, because a rounding difference per call is a budget line at scale.',
      },
    ],
    when: [
      'Before engineering a caching layer, to find out whether it is worth the complexity.',
      'When a long system prompt is repeated across many calls — the case where caching usually wins.',
    ],
  },
  {
    id: 'order',
    title: 'Cache order',
    tier: 'pro',
    tagline: 'Why a prompt cache that should be hitting is not.',
    art: 'cache',
    shot: null,
    what: [
      'Prompt caching is a prefix match. A provider reuses the cached part of a prompt only if every token before the cache point is identical, so one value that changes per call — a timestamp, a request id, a {{user_name}} — stops everything after it from caching, however stable.',
      'The Cache ROI tab says whether caching pays. This says why it is not paying: it finds the per-call values, measures the stable tokens they lock out, and prices the loss at your call volume.',
    ],
    how: [
      {
        step: 'Find the values that change',
        detail:
          'Template placeholders, UUIDs and clock times are flagged as near-certain; bare dates, Unix timestamps and long hex ids as possible. Untick any that are fixed in your prompt and the numbers update.',
      },
      {
        step: 'Measure the prefix, not a guess',
        detail:
          'The cacheable prefix is measured to the character — the text before the first per-call value — and re-measured after moving those blocks to the end, so the difference is a real token count.',
      },
      {
        step: 'Reorder, blocks kept whole',
        detail:
          'The suggested prompt moves whole blocks (runs of lines, code fences never split), not single lines out of the middle of a list. Read it before using it: only you know whether an instruction depended on coming first.',
      },
    ],
    when: [
      'Caching is switched on and the bill barely moved.',
      'A system prompt starts with "Today is …" or the user’s name, and runs thousands of tokens after it.',
    ],
  },
  {
    id: 'trimmer',
    title: 'Token Trimmer',
    tier: 'pro',
    tagline: 'Find the tokens you are paying for by accident.',
    art: 'trim',
    shot: 'trimmer',
    what: [
      'Production prompts accumulate politeness, hedging, duplicated rules and decorative markdown. None of it changes the output much, and all of it is billed on every call.',
      'The Trimmer finds that text, prices it at your real call volume, and gives you a cleaned prompt you can read before you accept it.',
    ],
    how: [
      {
        step: 'Eight rules, each measured',
        detail:
          'Every suggestion is re-tokenised to find what it actually saves, rather than estimated from character counts. A rule that saves nothing is not shown.',
      },
      {
        step: 'See the diff, keep control',
        detail:
          'The cleaned prompt is shown next to the original. Nothing is applied until you say so, and you can take the savings without taking the rewrite.',
      },
      {
        step: 'Priced at scale',
        detail:
          'What the saving is worth per call, at 100,000 calls, and at a million — where a few tokens per call stops being rounding.',
      },
    ],
    when: [
      'Before a prompt goes into production and starts running at volume.',
      'On an old prompt that has been edited by several people and grown in the process.',
    ],
  },
  {
    id: 'batch',
    title: 'Batch forecasting',
    tier: 'pro',
    tagline: 'Price a dataset before you run it through anything.',
    art: 'batch',
    shot: 'batch',
    what: [
      `Drop in the CSV or JSONL you are about to push through a pipeline and see what it will cost across every model you are considering — up to ${PRO.maxBatchRows.toLocaleString()} rows on Pro, unlimited on Team.`,
      'The file is parsed in your browser. It is never uploaded.',
    ],
    how: [
      {
        step: 'CSV, JSONL or NDJSON',
        detail:
          'Pick the column that holds the prompt. The parser handles quoted fields and embedded newlines rather than splitting on commas and hoping.',
      },
      {
        step: 'Every candidate model at once',
        detail:
          'The run cost is shown per model, including batch-endpoint pricing where the vendor offers it — which is typically half.',
      },
      {
        step: 'Export the working',
        detail: 'CSV export on Pro, so the forecast can go into a spreadsheet someone else owns.',
      },
    ],
    when: [
      'Before a bulk classification, extraction or summarisation job.',
      'When deciding whether a job is worth running on a larger model at all.',
    ],
  },
  {
    id: 'proposal',
    title: 'PDF cost proposals',
    tier: 'pro',
    tagline: 'Hand a client a number they can sign off.',
    art: 'proposal',
    shot: 'proposal',
    what: [
      'Turns the current comparison into a branded PDF: projected monthly burn, the model you recommend, the alternatives, and the assumptions behind all of it.',
      'Rendered in your browser. The project details never leave your machine.',
    ],
    how: [
      {
        step: 'Your details, their name',
        detail: 'Company and client on the cover, so it arrives looking like your document rather than a tool’s export.',
      },
      {
        step: 'The assumptions travel with the number',
        detail:
          'Call volume, output length and cached share are printed alongside the cost, because a figure without its assumptions is not reviewable.',
      },
      {
        step: 'White-label on Team',
        detail: 'Team removes the TokenTicks marks entirely.',
      },
    ],
    when: [
      'Quoting an AI feature to a client who needs a running-cost line.',
      'Taking a build-or-buy decision to someone who signs the budget.',
    ],
  },
  {
    id: 'share',
    title: 'Custom rate cards and sharing',
    tier: 'team',
    tagline: 'For the models you host, and the people you answer to.',
    art: 'share',
    shot: null,
    what: [
      'Team adds rate cards for models that are not on any public price list — fine-tuned deployments, negotiated enterprise rates, or something you host yourself.',
      'It also mints share links for saved estimates. A link exposes the project title, the model and the cost, and nothing else: not the prompt, not the metadata, not who owns it.',
    ],
    how: [
      {
        step: 'Price what you actually pay',
        detail: 'Enter your own input, output and cache rates and the whole dashboard prices against them.',
      },
      {
        step: 'Share a number, not a prompt',
        detail:
          'The share view is a separate database view that cannot return the prompt excerpt or the owner — enforced in SQL, not by hiding a field in the interface.',
      },
      {
        step: 'Unlimited batch and team-wide rules',
        detail: 'No row cap on batch runs, and Trimmer rules your whole team shares.',
      },
    ],
    when: [
      'Running fine-tuned or self-hosted models whose costs are yours, not a vendor’s.',
      'Circulating a cost estimate to people who should see the figure and not the prompt.',
    ],
  },
  {
    id: 'devtools',
    title: 'CLI, CI checks and MCP server',
    tier: 'pro',
    tagline: 'The same engine, where your prompts actually live.',
    art: 'trim',
    shot: null,
    what: [
      'The tokenticks command-line tool runs this engine against the prompt files in your repository: in a terminal, in CI, and — as an MCP server — inside Codex, Gemini CLI, VS Code, Claude Code, Cursor or any other MCP tool, so an assistant can answer “what does this prompt cost on Haiku instead?” mid-conversation.',
      'It runs on your machine. Prompts are read and counted locally and never uploaded; the only network call is a licence check, cached for 12 hours.',
    ],
    how: [
      {
        step: 'Every plan: counts and budgets',
        detail:
          'Token counts for every model, prices for the five free models, and a token or monthly budget per prompt file that fails the build when it is exceeded.',
      },
      {
        step: 'Pro: Trimmer and cache-order checks',
        detail:
          'The same waste rules and cache-order check as the app, as inline pull-request annotations with a dollar figure on each, and as MCP tools.',
      },
      {
        step: 'Team: your rules, and the cost of every change',
        detail:
          'Set which checks fail the build for your whole team, and have every pull request that edits a prompt get a comment with its monthly cost change.',
      },
    ],
    when: [
      'Prompts live in a repository and change through pull requests.',
      'You want an assistant to price a prompt without pasting it into a website.',
      'Keys: profile menu → CLI & MCP keys. A licence problem never fails a build — it falls back to free features and says so.',
    ],
  },
  {
    id: 'reconcile',
    title: 'Spend reconciliation',
    tier: 'team',
    tagline: 'What you estimated, what you were billed, and why they differ.',
    art: 'batch',
    shot: null,
    what: [
      'Drop in a usage export from your provider and set it against the estimates you saved. The variance is split into a volume effect (more or fewer calls than planned) and a per-call effect (each call cost more or less), and the two add up to the total exactly.',
      'The export is parsed in your browser and never uploaded.',
    ],
    how: [
      {
        step: 'Map the columns',
        detail:
          'Model, tokens, requests and cost are matched by name, and the mapping is shown for you to correct: exports differ between providers and change without notice.',
      },
      {
        step: 'Choose the estimates',
        detail:
          'Tick the saved estimates that describe the workload and the daily volume each assumed. Estimates saved from now on remember it.',
      },
      {
        step: 'Read the causes',
        detail:
          'More calls, bigger prompts, longer answers, a model nobody planned for, or an estimate with no usage at all — named, largest first.',
      },
    ],
    when: [
      'The first real invoice arrives and does not match the proposal.',
      'Deciding whether to fix volume (rate limits, batching) or cost per call (shorter prompts, a cheaper model).',
    ],
  },
];
