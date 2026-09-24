/**
 * The developer guide on the Docs page: the tokenticks CLI, CI checks, the MCP
 * server and licence keys, as numbered steps with copyable code.
 *
 * Content as data, like featureDocs.ts, and for a stronger reason: every
 * snippet here is something a customer will paste into a terminal or a CI
 * file. tests/cliGuide.test.mjs holds each one to the real tool - every
 * command and flag exists, every model id resolves, the example config passes
 * the CLI's own validator, the JSON parses, and the workflow pins the same
 * action versions this repository's own workflows run on. A guide that drifts
 * from the tool fails the build instead of a customer's first try.
 */

export type GuidePlan = 'free' | 'pro' | 'team';

export interface Snippet {
  /** Shown in the block's header: what this is, and where it runs. */
  label: string;
  /** 'command' is typed into a terminal, 'file' is saved as a file, 'output' is what comes back. */
  kind: 'command' | 'file' | 'output';
  /** For kind 'file': the path to save it at. */
  file?: string;
  code: string;
  /**
   * Consecutive snippets sharing a group render as one tabbed block, one tab
   * per distinct `tab` value - six MCP clients as six tabs rather than a wall.
   */
  group?: string;
  tab?: string;
  /** A line under the block, for a caveat specific to this snippet. */
  note?: string;
}

export interface GuideStep {
  id: string;
  title: string;
  /** The cheapest plan this step does anything useful on. */
  plan: GuidePlan;
  intro: string[];
  snippets: Snippet[];
  notes?: string[];
}

/** Placeholder for the customer's key in every snippet. Never a real key. */
export const KEY_PLACEHOLDER = 'tt_your_key_here';

export const GUIDE_INTRO = [
  'tokenticks is the TokenTicks engine as a command-line tool. It checks the prompt files in your repository in a terminal and in CI, comments on pull requests with what a prompt change costs per month, and runs as an MCP server so Codex, Gemini CLI, VS Code, Claude Code, Cursor or any other MCP tool can count and price prompts mid-conversation — for models from OpenAI, Google, Anthropic and six more vendors.',
  'It runs on your machine. Prompts are read and counted locally and never uploaded; the only network call is a licence check, which sends the key and nothing else.',
];

/** What each plan runs, for the table at the top of the guide. */
export const GUIDE_PLANS: Array<{ feature: string; free: string; pro: string; team: string }> = [
  { feature: 'Token counts (count), any model', free: '✓', pro: '✓', team: '✓' },
  { feature: 'Cost comparison (compare)', free: '5 models', pro: 'All models', team: 'All models' },
  { feature: 'Token and monthly budgets (lint)', free: '✓', pro: '✓', team: '✓' },
  { feature: 'Trimmer waste checks (lint)', free: '—', pro: '✓', team: '✓' },
  { feature: 'Cache-order checks (lint)', free: '—', pro: '✓', team: '✓' },
  { feature: 'Your own rule levels in CI', free: '—', pro: '—', team: '✓' },
  { feature: 'Pull-request cost comments (diff)', free: '—', pro: '—', team: '✓' },
  { feature: 'MCP: count, compare, list models', free: '✓', pro: '✓', team: '✓' },
  { feature: 'MCP: trim, cache order, cache ROI', free: '—', pro: '✓', team: '✓' },
];

export const EXAMPLE_CONFIG = `{
  "include": ["prompts/**/*.{md,txt,prompt}"],
  "model": "claude-sonnet-5",
  "callsPerDay": 1000,
  "outputTokens": 500,
  "budget": { "maxTokens": 8000, "maxMonthlyUsd": 500 },
  "files": {
    "prompts/support-bot.md": { "callsPerDay": 20000 },
    "prompts/nightly/**": { "model": "claude-haiku-4-5" }
  }
}`;

export const TEAM_RULES_CONFIG = `{
  "rules": {
    "budget": "error",
    "cacheability": "error",
    "trimmer": { "politeness": "error", "hedge": "off" }
  }
}`;

export const WORKFLOW_YAML = `name: Prompt cost
on:
  pull_request:
    paths: ["prompts/**", ".tokenticks.json"]

permissions:
  contents: read
  pull-requests: write

jobs:
  tokenticks:
    runs-on: ubuntu-latest
    env:
      TOKENTICKS_KEY: \${{ secrets.TOKENTICKS_KEY }}
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0 # diff compares against the base branch

      - uses: actions/setup-node@v7
        with:
          node-version: 22

      - name: Lint prompts
        run: npx -y tokenticks lint --format github

      - name: Price the change
        if: always()
        run: npx -y tokenticks diff --output cost.md

      - name: Comment on the pull request
        if: always() && hashFiles('cost.md') != ''
        uses: actions/github-script@v9
        with:
          script: |
            const body = require('fs').readFileSync('cost.md', 'utf8');
            const marker = '<!-- tokenticks-diff -->';
            const { owner, repo } = context.repo;
            const issue_number = context.issue.number;
            const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number });
            const mine = comments.find((c) => c.body && c.body.includes(marker));
            if (mine) await github.rest.issues.updateComment({ owner, repo, comment_id: mine.id, body });
            else await github.rest.issues.createComment({ owner, repo, issue_number, body });`;

/** Prompts spread across vendors: each file prices on the model it runs on. */
export const MIXED_VENDOR_CONFIG = `{
  "include": ["prompts/**/*.md"],
  "model": "gpt-5-mini",
  "callsPerDay": 5000,
  "files": {
    "prompts/support-bot.md": { "model": "claude-sonnet-5" },
    "prompts/summariser.md": { "model": "gemini-2-5-flash" },
    "prompts/router.md": { "model": "gpt-5-nano", "callsPerDay": 50000 }
  }
}`;

export const CODEX_TOML = `[mcp_servers.tokenticks]
command = "npx"
args = ["-y", "tokenticks", "mcp"]
env = { TOKENTICKS_KEY = "${KEY_PLACEHOLDER}" }`;

export const VSCODE_JSON = `{
  "inputs": [
    {
      "type": "promptString",
      "id": "tokenticks-key",
      "description": "TokenTicks key",
      "password": true
    }
  ],
  "servers": {
    "tokenticks": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "tokenticks", "mcp"],
      "env": { "TOKENTICKS_KEY": "\${input:tokenticks-key}" }
    }
  }
}`;

export const MCP_JSON = `{
  "mcpServers": {
    "tokenticks": {
      "command": "npx",
      "args": ["-y", "tokenticks", "mcp"],
      "env": { "TOKENTICKS_KEY": "${KEY_PLACEHOLDER}" }
    }
  }
}`;

export const GUIDE_STEPS: GuideStep[] = [
  {
    id: 'key',
    title: 'Create a key',
    plan: 'free',
    intro: [
      'A key tells the tool which plan you are on. Open the profile menu (your name, top right) → CLI & MCP keys, name the key after where it will live — "GitHub Actions", "Laptop" — and select Create key.',
      'Copy it straight away: it is shown once, and we store only a hash of it, so it cannot be shown again. If you lose it, revoke it and create another.',
    ],
    snippets: [],
    notes: [
      'No key is needed for the free features — token counts, the five free models and budgets. Without one, everything runs on the free plan.',
      'Use one key per place it runs, so a single CI secret or laptop can be revoked without touching the others.',
    ],
  },
  {
    id: 'terminal',
    title: 'Run it in a terminal',
    plan: 'free',
    intro: [
      'You need Node.js 20 or newer. There is nothing to install first: npx fetches tokenticks the first time and runs it. Set your key for the session, then check which plan it resolves to.',
    ],
    snippets: [
      {
        label: 'macOS / Linux',
        kind: 'command',
        code: `export TOKENTICKS_KEY=${KEY_PLACEHOLDER}\nnpx tokenticks whoami`,
      },
      {
        label: 'Windows PowerShell',
        kind: 'command',
        code: `$env:TOKENTICKS_KEY="${KEY_PLACEHOLDER}"\nnpx tokenticks whoami`,
      },
      {
        label: 'What you should see',
        kind: 'output',
        code: 'Plan: team (account TT-XXXXX-XXXXX)\nChecked: just now',
      },
      {
        label: 'Count a prompt, then price it across models',
        kind: 'command',
        code: [
          '# Tokens in one file, for one model',
          'npx tokenticks count prompts/support-bot.md --model claude-sonnet-5',
          '',
          '# The same prompt on three models at 10,000 calls a day, cheapest first',
          'npx tokenticks compare prompts/support-bot.md --models claude-opus-5,claude-haiku-4-5,gpt-5 --calls-per-day 10000',
        ].join('\n'),
      },
    ],
    notes: ['npx tokenticks --help lists every command and option. npx tokenticks models lists the model ids.'],
  },
  {
    id: 'models',
    title: 'Price models from any vendor',
    plan: 'free',
    intro: [
      'tokenticks is not tied to one AI company. It prices OpenAI, Anthropic, Google, xAI, DeepSeek, Mistral, Meta, Cohere and Alibaba models from the same list as the dashboard — the full table is below. Use the id in the first column wherever a command or config asks for a model.',
      'OpenAI counts are exact: OpenAI publishes its tokenizer and it runs here in full. Every other vendor is a calibrated estimate from the same tokenizer, and the output says so. Dated snapshot names such as gpt-4o-mini-2024-07-18 or claude-sonnet-5-20260801 are accepted too.',
    ],
    snippets: [
      {
        label: 'One prompt, five vendors, cheapest first',
        kind: 'command',
        code: 'npx tokenticks compare prompts/support-bot.md --models gpt-5,gemini-2-5-pro,claude-sonnet-5,grok-4,deepseek-v3 --calls-per-day 10000',
      },
      {
        label: 'Count for a specific model',
        kind: 'command',
        code: [
          '# Exact: OpenAI publishes its tokenizer',
          'npx tokenticks count prompts/system.md --model gpt-5',
          '',
          '# Calibrated estimate for Gemini and every other vendor',
          'npx tokenticks count prompts/system.md --model gemini-2-5-flash',
        ].join('\n'),
      },
      { label: 'Every model id with its rates', kind: 'command', code: 'npx tokenticks models' },
      {
        label: 'Prompts that run on different vendors, in one repository',
        kind: 'file',
        file: '.tokenticks.json',
        code: MIXED_VENDOR_CONFIG,
      },
    ],
    notes: [
      'The free plan prices five models (marked in the table); counts work for all of them. Pro and Team price every model.',
      'Using Codex or GitHub Copilot? They run on OpenAI models, so price your prompts with the OpenAI ids. Vendor variants that are not in the table, such as coding-tuned models, are not priced yet.',
    ],
  },
  {
    id: 'config',
    title: 'Tell it where your prompts are',
    plan: 'free',
    intro: [
      'In the root of your repository, create a starter config, then edit it: which files are prompts, the model they run on, how often they are called, and the budgets they must stay under. The call volume drives every monthly figure the tool reports.',
    ],
    snippets: [
      { label: 'Create the starter file', kind: 'command', code: 'npx tokenticks init' },
      { label: 'Example', kind: 'file', file: '.tokenticks.json', code: EXAMPLE_CONFIG },
    ],
    notes: [
      'Entries under "files" override the defaults for matching paths; later matches win.',
      'Unknown keys are an error, so a typo such as "callsPerday" cannot silently leave a budget unenforced.',
    ],
  },
  {
    id: 'lint',
    title: 'Check prompts before they ship',
    plan: 'free',
    intro: [
      'lint checks every prompt file against your budgets on every plan. On Pro it also runs the Trimmer and the cache-order check, each finding with the line it is on and what it costs per month.',
    ],
    snippets: [
      { label: 'Run the checks', kind: 'command', code: 'npx tokenticks lint' },
      {
        label: 'Example output (Pro)',
        kind: 'output',
        code: [
          'prompts/support-bot.md  (claude-sonnet-5, 125 tokens, $3,150.00/month)',
          '  warn   L5 trimmer: Politeness filler (2×): 2 tokens removable. …  ~$2.40/mo',
          '  warn   L1 cacheability: Move lines 1–2 (date and time, uuid) below line 7. …  ~$46.63/mo',
          '✔ 0 errors, 2 warnings in 1 file · up to $49.03/month recoverable',
        ].join('\n'),
      },
      {
        label: 'Team: decide which checks fail the build',
        kind: 'file',
        file: '.tokenticks.json (add to it)',
        code: TEAM_RULES_CONFIG,
      },
    ],
    notes: [
      'Exit codes: 0 clean, 1 a check at "error" level failed, 2 a bad command or config. Budgets are errors by default; the Trimmer and cache-order checks are warnings unless a Team config says otherwise.',
      'A licence problem never changes the exit code. If the key cannot be checked, the tool runs with free features and prints a warning.',
    ],
  },
  {
    id: 'ci',
    title: 'Add it to GitHub Actions',
    plan: 'free',
    intro: [
      'First store the key as a secret: in your repository, Settings → Secrets and variables → Actions → New repository secret, named TOKENTICKS_KEY.',
      'Then add this workflow. It annotates pull requests with findings on every plan, and on Team it posts one comment with the monthly cost change of the prompt edits, updated on each push.',
    ],
    snippets: [{ label: 'Workflow', kind: 'file', file: '.github/workflows/prompt-cost.yml', code: WORKFLOW_YAML }],
    notes: [
      'fetch-depth: 0 is needed: the cost comparison reads the base branch\'s version of each prompt.',
      'On plans without pull-request comments, the diff step writes nothing, so the comment step is skipped rather than posting an upsell.',
      'Pull requests from forks do not receive secrets, so they run on the free plan.',
    ],
  },
  {
    id: 'mcp',
    title: 'Use it inside your AI tool (MCP)',
    plan: 'free',
    intro: [
      'MCP is an open standard, so tokenticks works in any tool that supports it — OpenAI Codex, Gemini CLI, VS Code with GitHub Copilot, Claude Code, Cursor and Claude Desktop among them. It gives your assistant tools to count, compare and — on Pro — trim and check cache order, without you pasting prompts anywhere. It reads files only inside the folder it was started in.',
      'Pick your tool. Where there are two ways, either one is enough.',
    ],
    snippets: [
      {
        group: 'mcp-client',
        tab: 'Codex',
        label: 'Add it with one command',
        kind: 'command',
        code: `codex mcp add tokenticks --env TOKENTICKS_KEY=${KEY_PLACEHOLDER} -- npx -y tokenticks mcp`,
      },
      {
        group: 'mcp-client',
        tab: 'Codex',
        label: 'Or add it to the config file',
        kind: 'file',
        file: '~/.codex/config.toml',
        code: CODEX_TOML,
        note: 'The same config serves the Codex CLI and the Codex IDE extension.',
      },
      {
        group: 'mcp-client',
        tab: 'Gemini CLI',
        label: 'Add it with one command',
        kind: 'command',
        code: `gemini mcp add -s user -e TOKENTICKS_KEY=${KEY_PLACEHOLDER} tokenticks npx tokenticks mcp`,
      },
      {
        group: 'mcp-client',
        tab: 'Gemini CLI',
        label: 'Or add it to the settings file',
        kind: 'file',
        file: '~/.gemini/settings.json',
        code: MCP_JSON,
        note: 'Put the key in "env" as shown. Gemini CLI withholds environment variables with KEY in the name from MCP servers unless they are set there, so an exported TOKENTICKS_KEY alone would not reach tokenticks.',
      },
      {
        group: 'mcp-client',
        tab: 'VS Code',
        label: 'Workspace config (GitHub Copilot agent mode)',
        kind: 'file',
        file: '.vscode/mcp.json',
        code: VSCODE_JSON,
        note: 'VS Code asks for the key the first time the server starts and stores it securely, so the key never sits in a file you might commit. For every workspace, run "MCP: Open User Configuration" and paste the same config there.',
      },
      {
        group: 'mcp-client',
        tab: 'Claude Code',
        label: 'Add it with one command',
        kind: 'command',
        code: `claude mcp add tokenticks -e TOKENTICKS_KEY=${KEY_PLACEHOLDER} -- npx -y tokenticks mcp`,
      },
      { group: 'mcp-client', tab: 'Cursor', label: 'Project config', kind: 'file', file: '.cursor/mcp.json', code: MCP_JSON },
      {
        group: 'mcp-client',
        tab: 'Claude Desktop',
        label: 'App config',
        kind: 'file',
        file: 'claude_desktop_config.json',
        code: MCP_JSON,
        note: 'Open it from Claude Desktop: Settings → Developer → Edit Config.',
      },
      {
        label: 'Then ask things like',
        kind: 'output',
        code: [
          'Compare prompts/support-bot.md on GPT-5, Gemini 2.5 Pro and Claude Sonnet 5 at 10k calls a day.',
          'Why isn\'t my prompt cache hitting on prompts/agent.md?',
          'Trim prompts/system.md and show me what it would save.',
        ].join('\n'),
      },
    ],
    notes: [
      'Restart the tool after adding the server. The tools appear as count_tokens, compare_models, list_models, trim_prompt, cache_lint and cache_roi.',
      'Any other MCP client works the same way: have it run npx -y tokenticks mcp with TOKENTICKS_KEY in its environment.',
    ],
  },
  {
    id: 'manage',
    title: 'Manage your keys',
    plan: 'free',
    intro: [
      'The CLI & MCP keys panel lists each key by name and its first characters, with when it was last used. Revoke a key there the moment it is no longer needed or may have leaked.',
    ],
    snippets: [],
    notes: [
      'A key always reports your plan as it is now: upgrade and the same key picks up the new plan; cancel and it reports free once the paid period ends.',
      'A revoked key stops working at the next check — at once on a fresh CI runner, within 12 hours on a machine that checked recently.',
      'Deleting your account deletes its keys.',
    ],
  },
];

export const TROUBLESHOOTING: Array<{ message: string; fix: string }> = [
  {
    message: 'Could not reach the TokenTicks licence server',
    fix: 'The check could not get through — usually a network or firewall rule. If this machine confirmed your plan in the last 7 days, that plan is used; otherwise the free features run. Nothing fails because of it.',
  },
  {
    message: 'TOKENTICKS_KEY was not recognised or has been revoked',
    fix: 'The key was revoked or mistyped. Create a new one under CLI & MCP keys and update the secret or variable holding it.',
  },
  {
    message: 'TOKENTICKS_KEY is not a TokenTicks key',
    fix: 'The value is not a key at all — often a copy that lost characters. Keys start with tt_ and are 67 characters long.',
  },
  {
    message: 'Could not find a common ancestor with …',
    fix: 'diff needs the base branch\'s history. Check out with fetch-depth: 0, as in the workflow above.',
  },
  {
    message: 'The "rules" section of .tokenticks.json is a Team feature',
    fix: 'On Pro, the default levels are used instead. Nothing fails; the rules take effect on Team.',
  },
];
