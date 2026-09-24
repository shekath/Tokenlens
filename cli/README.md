# tokenticks

Token counts and LLM cost checks for the prompts in your repository — in CI, in
pull requests, and inside your AI editor over MCP. The same engine as the
[TokenTicks web app](https://shekath.github.io/Tokenlens/), run locally:
**prompts are read and counted on your machine and never uploaded.**

```sh
npx tokenticks lint                 # check prompt files against budgets and waste rules
npx tokenticks diff --base origin/main   # monthly cost change of your prompt edits
npx tokenticks mcp                  # MCP server for Codex, Gemini CLI, VS Code, Claude Code, Cursor…
```

## What each plan runs

| | Free | Pro | Team |
|---|---|---|---|
| `count`, `compare`, `models` | ✓ (prices 5 models) | ✓ all models | ✓ |
| `lint`: token and monthly budgets | ✓ | ✓ | ✓ |
| `lint`: Trimmer waste rules | | ✓ | ✓ |
| `lint`: cache-order check | | ✓ | ✓ |
| `lint`: your own rule levels (`rules`) | | | ✓ |
| `diff`: pull-request cost change | | | ✓ |
| MCP: `count_tokens`, `compare_models`, `list_models` | ✓ | ✓ | ✓ |
| MCP: `trim_prompt`, `cache_lint`, `cache_roi` | | ✓ | ✓ |

Without a key everything runs on the free plan. To unlock more, create a key in
the web app (profile menu → **CLI & MCP keys**) and set it as `TOKENTICKS_KEY`.

**A licence problem never fails your build.** The key is checked once and cached
for 12 hours. If the licence server can't be reached, the last confirmed plan is
used for up to 7 days; after that, or with a bad key, commands run with free
features and print a warning. Exit codes come only from the checks themselves.

## Commands

```
tokenticks count [files...]      tokens per file (stdin when no file)   --model <id>
tokenticks compare [file]        one prompt across models, cheapest first   --models a,b,c
tokenticks lint [paths...]       --format text | json | github
tokenticks diff [--base <ref>]   --format markdown | json | text   --output <file>
tokenticks mcp                   MCP server on stdio
tokenticks models | whoami | init
```

Exit codes: `0` clean · `1` a check at `"error"` level failed · `2` bad usage or config.

## `.tokenticks.json`

`tokenticks init` writes a starter. Every key is optional; unknown keys are an
error, so a typo can't silently leave a budget unenforced.

```jsonc
{
  "include": ["prompts/**/*.{md,txt,prompt}", "**/*.prompt.md"],
  "exclude": ["fixtures/**"],
  "model": "claude-sonnet-5",        // any id from `tokenticks models`
  "callsPerDay": 1000,               // drives every monthly figure
  "outputTokens": 500,
  "cacheHitRate": 0.8,               // for pricing the cache-order check
  "budget": { "maxTokens": 8000, "maxMonthlyUsd": 500 },
  "files": {                         // per-file overrides; later matches win
    "prompts/system*.md": { "callsPerDay": 20000, "maxTokens": 12000 },
    "prompts/batch/**": { "model": "claude-haiku-4-5" }
  },
  "cache": {
    "ignore": ["^2025-01-01$"],      // values you know are fixed (regex)
    "minConfidence": "medium"        // "high" skips bare dates and hex ids
  },
  "rules": {                         // Team: your own levels, "error" | "warn" | "off"
    "budget": "error",
    "cacheability": "error",
    "trimmer": { "politeness": "error", "hedge": "off" }
  }
}
```

### The cache-order check

Prompt caching is a prefix match: one value that changes per call — a
timestamp, a request id, a `{{user_name}}` — stops everything after it from
caching, however stable. `lint` finds those values, measures the stable tokens
they lock out, prices the loss at your volume, and tells you which block to move:

```
warn  L1 cacheability: Move lines 1–2 (date and time, uuid) below line 7.
      58 stable tokens sit after a per-call value and cannot be cached (92% of the cacheable prefix).  ~$46.63/mo
```

## In GitHub Actions

Add `TOKENTICKS_KEY` as a repository secret, then:

```yaml
name: Prompt cost
on:
  pull_request:
    paths: ["prompts/**", "**/*.prompt.md", ".tokenticks.json"]

permissions:
  contents: read
  pull-requests: write

jobs:
  tokenticks:
    runs-on: ubuntu-latest
    env:
      TOKENTICKS_KEY: ${{ secrets.TOKENTICKS_KEY }}
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0 # diff needs the base branch's history

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
            else await github.rest.issues.createComment({ owner, repo, issue_number, body });
```

`--format github` turns findings into inline annotations and writes a table to
the job summary. `diff` defaults to `origin/$GITHUB_BASE_REF`; it writes no file
on plans without it, so the comment step is skipped rather than posting an
upsell. Pull requests from forks don't receive secrets, so they run on the free plan.

## As an MCP server

MCP is an open standard, so this works in any MCP client. The server command is
always `npx -y tokenticks mcp` with `TOKENTICKS_KEY` in its environment.

**OpenAI Codex** (CLI and IDE extension)

```sh
codex mcp add tokenticks --env TOKENTICKS_KEY=tt_… -- npx -y tokenticks mcp
```

or in `~/.codex/config.toml`:

```toml
[mcp_servers.tokenticks]
command = "npx"
args = ["-y", "tokenticks", "mcp"]
env = { TOKENTICKS_KEY = "tt_…" }
```

**Gemini CLI**

```sh
gemini mcp add -s user -e TOKENTICKS_KEY=tt_… tokenticks npx tokenticks mcp
```

or `mcpServers` in `~/.gemini/settings.json`, same shape as the Cursor example
below. Keep the key in `env`: Gemini CLI withholds environment variables with
`KEY` in the name from MCP servers unless they are set there.

**VS Code** (GitHub Copilot agent mode), `.vscode/mcp.json`: VS Code prompts
for the key once and stores it securely, so it never lands in the repository.

```json
{
  "inputs": [
    { "type": "promptString", "id": "tokenticks-key", "description": "TokenTicks key", "password": true }
  ],
  "servers": {
    "tokenticks": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "tokenticks", "mcp"],
      "env": { "TOKENTICKS_KEY": "${input:tokenticks-key}" }
    }
  }
}
```

**Claude Code**

```sh
claude mcp add tokenticks -e TOKENTICKS_KEY=tt_… -- npx -y tokenticks mcp
```

**Cursor** (`.cursor/mcp.json`) and **Claude Desktop** (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "tokenticks": {
      "command": "npx",
      "args": ["-y", "tokenticks", "mcp"],
      "env": { "TOKENTICKS_KEY": "tt_…" }
    }
  }
}
```

Then ask things like *"compare prompts/system.md on GPT-5, Gemini 2.5 Pro and
Claude Sonnet 5 at 10k calls a day"* or *"why isn't my prompt cache hitting?"*. The
server reads files only under the directory it was started in, and the default
model comes from `.tokenticks.json` there.

## Building from source

```sh
npm install
VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… node cli/build.mjs   # → cli/dist/tokenticks.mjs
```

Without the two variables the build works but has no licence server, so every
command runs on the free plan. Rates are list prices as of the date `tokenticks
models` prints; token counts are exact for OpenAI models and calibrated
estimates elsewhere (Anthropic, for one, publishes no client tokenizer).

## Releasing

Releases are published by `.github/workflows/publish-cli.yml` when a tag
`cli-v<version>` is pushed. It needs an `NPM_TOKEN` repository **secret** and the
same `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` repository **variables** the
site build uses.

```sh
cd cli && npm version patch --no-git-tag-version     # e.g. 0.1.0 -> 0.1.1
cd .. && git commit -am "tokenticks 0.1.1" && git push
git tag cli-v0.1.1 && git push origin cli-v0.1.1
```

Before publishing, the workflow refuses to continue if the tag doesn't match
`cli/package.json`, if the version is already on npm, if the Supabase variables
are missing, if the key is a service-role key, or if the built bundle lacks the
licence server. It runs the full test suite, including the MCP interop tests, then
publishes with npm provenance when the repository is public. Run it by hand from
the Actions tab for a dry run that publishes nothing.

