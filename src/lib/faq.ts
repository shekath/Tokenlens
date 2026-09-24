/**
 * FAQ content.
 *
 * Data rather than markup so the page stays a rendering concern and every
 * answer is in one place to check. The rule for what goes in an answer: it has
 * to be true of the build it ships with. An FAQ that flatters the product is
 * worth less than one that tells someone where the edges are.
 */

export interface FaqItem {
  q: string;
  /** Paragraphs. Kept as plain strings - no markup to get wrong. */
  a: string[];
}

export interface FaqSection {
  id: string;
  title: string;
  blurb: string;
  items: FaqItem[];
}

export const FAQ: FaqSection[] = [
  {
    id: 'general',
    title: 'General',
    blurb: 'What TokenTicks is, and what it does with what you paste into it.',
    items: [
      {
        q: 'What does TokenTicks actually do?',
        a: [
          'It counts the tokens in a prompt and prices that prompt across the models you are choosing between — per call, per day, and per month at your own call volume.',
          'The point is the comparison. A prompt that costs almost nothing on one model can cost twenty times as much on another, and the difference is rarely where people expect it to be.',
        ],
      },
      {
        q: 'Do I need an account?',
        a: [
          'No. The token counter and the cost dashboard work with no account at all — paste a prompt and read the numbers.',
          'An account adds saved estimates and the paid features. Nothing about counting is gated behind signing up.',
        ],
      },
      {
        q: 'Is my prompt uploaded anywhere?',
        a: [
          'No. Tokenisation and costing happen entirely in your browser. The prompt text is never sent to our servers, and there is no server that would receive it.',
          'A saved estimate stores the numbers — token counts, cost, the model, your assumptions — plus an optional 280-character excerpt that you can see before you save. It never stores the whole prompt.',
        ],
      },
      {
        q: 'How current are the prices?',
        a: [
          'Every rate carries the date it was published, shown in the footer. Vendors change prices without much notice, so treat the figures as a planning tool and check the vendor’s own pricing page before you commit a budget to them.',
        ],
      },
    ],
  },
  {
    id: 'technical',
    title: 'Technical',
    blurb: 'How the counting works, and where it is exact rather than estimated.',
    items: [
      {
        q: 'Are the token counts exact?',
        a: [
          'For OpenAI models, yes. TokenTicks runs the real BPE tokenisers — o200k_base and cl100k_base — in your browser, so the count is the count.',
          'For everyone else it is an estimate, and it says so. Anthropic, Google, Meta and the rest either do not publish a tokeniser or publish one too large to ship to a browser, so their counts are derived from the OpenAI tokenisation with a per-family scaling factor. Each figure carries a badge saying which it is.',
        ],
      },
      {
        q: 'How accurate are the estimates?',
        a: [
          'The scaling factors come from measurement, not guesswork, and for ordinary English prose they land within a few percent.',
          'They are least reliable on text that is unlike prose: heavy code, dense punctuation, or non-Latin scripts, where tokenisers diverge most. The dashboard warns you when a prompt is more than 15% non-Latin, because that is where an estimate is worth trusting least.',
        ],
      },
      {
        q: 'Why is the first count slightly slow?',
        a: [
          'The tokeniser tables are megabytes of data. They load in the background after the page has painted, and only the one you need — a prompt priced against OpenAI models never downloads the second table at all.',
        ],
      },
      {
        q: 'What do the cache numbers mean?',
        a: [
          'Writing to a prompt cache costs more than a normal input token, and reading from one costs much less. Whether caching saves money depends on your hit rate, and the break-even point is not where most people guess: at Anthropic’s published multipliers it is about 22%.',
          'The Cache ROI tab computes that break-even for any model that publishes cache rates, and shows what it costs you across realistic call volumes.',
        ],
      },
      {
        q: 'Does it work offline, or on a phone?',
        a: [
          'It runs in the browser and keeps working once loaded. The interface is built for a phone as well as a desktop — the dashboard, the charts and the account pages all reflow rather than shrinking.',
        ],
      },
    ],
  },
  {
    id: 'developers',
    title: 'CLI, CI and MCP',
    blurb: 'Running the engine in your repository, your pipeline and your editor.',
    items: [
      {
        q: 'Is there a command-line tool or an MCP server?',
        a: [
          'Yes: tokenticks. It lints prompt files in CI, comments on pull requests with the monthly cost of a prompt change (Team), and runs as an MCP server so Codex, Gemini CLI, VS Code, Claude Code, Cursor or any other MCP tool can count and price prompts mid-conversation. It prices models from every vendor on the dashboard, not just one.',
          'Create a key under the profile menu → CLI & MCP keys, and set it as TOKENTICKS_KEY.',
        ],
      },
      {
        q: 'Does the CLI upload my prompts?',
        a: [
          'No. It runs the same engine as this page, on your machine. The only network call is the licence check: the key goes to our database, the prompt never does.',
        ],
      },
      {
        q: 'Can a licence problem break my build?',
        a: [
          'No. The plan is checked once and cached for 12 hours; if our server cannot be reached, the last confirmed plan is used for up to seven days, and after that the tool runs with free features and prints a warning.',
          'Exit codes come only from the checks you configured. A revoked or mistyped key downgrades features; it never turns a build red.',
        ],
      },
      {
        q: 'What happens to a key when I cancel or delete my account?',
        a: [
          'A key reports your plan as it is now, not as it was when the key was made — cancel and it reports free once the paid period ends, upgrade and the same key picks up the new plan. Deleting your account deletes its keys.',
        ],
      },
    ],
  },
  {
    id: 'subscription',
    title: 'Plans and billing',
    blurb: 'What each plan includes, and exactly what happens when you change one.',
    items: [
      {
        q: 'What do I get for free?',
        a: [
          'Unlimited token counting with no account, five foundational OpenAI and Anthropic models priced, the composition metrics, and up to three saved estimates.',
          'The tokenticks command-line tool and MCP server also work without a key: token counts for every model, prices for the free five, and per-file budgets in CI.',
        ],
      },
      {
        q: 'What happens when I cancel?',
        a: [
          'You keep everything you are paying for until the end of the period you have already paid for. Cancelling stops the renewal; it does not take the product away on the day you click it.',
          'The date is shown in your account before you confirm, and again afterwards. You can resume any time before it passes.',
        ],
      },
      {
        q: 'What if I want to change plan?',
        a: [
          'Use Switch in Plans and billing. It moves your existing subscription and Lemon Squeezy prorates the difference — you are charged only for the change.',
          'Deliberately, it does not sell you a second subscription. Buying again while one is active would mean two subscriptions billing you in parallel, which is easy to do by accident and hard to notice.',
        ],
      },
      {
        q: 'What happens if a payment fails?',
        a: [
          'Nothing immediately. The card is retried for several days, and your account keeps working throughout — a first failed retry is not a reason to lock you out. Your account page shows the failure so you can update the card.',
        ],
      },
      {
        q: 'Who handles the payment?',
        a: [
          'Lemon Squeezy, as merchant of record. It takes the payment, applies the sales tax or VAT for your country, and issues the receipt. No card details ever reach TokenTicks — we store the brand and last four digits only, as Lemon Squeezy reports them.',
        ],
      },
      {
        q: 'What is the account ID for?',
        a: [
          'It identifies your account in a support conversation — short enough to read aloud, and issued by us so it never changes. You will find it in the profile menu.',
          'It is not a password. Showing it to someone grants them nothing.',
        ],
      },
    ],
  },
];
