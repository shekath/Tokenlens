/**
 * The `tokenticks` command.
 *
 * Exit codes are a contract with CI: 0 clean, 1 a check at "error" level
 * failed, 2 the command itself was misused (bad flag, bad config, unknown
 * model). Nothing about the licence ever changes the exit code.
 */

import { parseArgs } from 'node:util';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { entitlementsFor, type Entitlements } from '../../src/lib/entitlements.ts';
import { DEFAULT_COMPARE_IDS, PRICING_AS_OF } from '../../src/lib/models.ts';
import { callCost } from '../../src/lib/cost.ts';
import { APP_URL, VERSION, licenceServer } from './buildinfo.ts';
import { CONFIG_FILE, ConfigError, DEFAULT_CONFIG, isPromptFile, parseConfig, type Config } from './config.ts';
import { MODELS, countDetail, ready, resolveModel, suggestModels } from './engine.ts';
import { cacheDir, nodeDeps, resolveLicence, type Licence } from './licence.ts';
import { effectiveRules, lintFile, UnknownModelError, type FileReport, type Finding } from './lint.ts';
import { changedPromptFiles, priceChanges, toMarkdown } from './diff.ts';
import { serveStdio } from './mcp.ts';

const HELP = `tokenticks ${VERSION} — token counts and LLM cost checks, locally.

Usage: tokenticks <command> [options]

Commands
  count [files...]      Tokens per file for a model (stdin when no file or "-")
  compare [file]        One prompt priced across models, cheapest first
  lint [paths...]       Check prompt files: budgets, waste (Pro), cache order (Pro)
  diff [--base <ref>]   Monthly cost change of prompt edits, as a PR comment (Team)
  mcp                   Run as an MCP server on stdio, for Claude Code, Cursor, …
  models                Model ids and rates
  whoami                Which plan your key resolves to
  init                  Write a starter ${CONFIG_FILE}

Options
  --model <id>          Model for count / compare (default from ${CONFIG_FILE})
  --models <a,b,c>      Models for compare
  --config <file>       Config file (default ./${CONFIG_FILE})
  --format <fmt>        lint: text | json | github    diff: markdown | json | text
  --base <ref>          diff: compare against this ref (default origin/$GITHUB_BASE_REF)
  --output <file>       diff: also write the result to a file
  --json                Machine-readable output (count, compare, models, whoami)
  --key <key>           Licence key (default: $TOKENTICKS_KEY)
  -h, --help            This help
  -v, --version         Version

Prompts are read and counted on this machine and never uploaded. With a key,
the only network call is a licence check, cached for 12 hours; if it fails the
command runs with free features instead of failing.

Keys: ${APP_URL} → profile → CLI & MCP keys.
Exit codes: 0 clean · 1 a check at "error" level failed · 2 usage or config error.`;

class UsageError extends Error {}

interface Io {
  cwd: string;
  env: NodeJS.ProcessEnv;
  out: (s: string) => void;
  err: (s: string) => void;
  stdin: () => string;
}

function loadConfig(io: Io, path: string | undefined): Config {
  const file = path ?? join(io.cwd, CONFIG_FILE);
  if (!existsSync(file)) {
    if (path) throw new ConfigError(`No config file at ${path}.`);
    return DEFAULT_CONFIG;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new ConfigError(`${relative(io.cwd, file) || file} is not valid JSON: ${(e as Error).message}`);
  }
  return parseConfig(raw);
}

async function licence(io: Io, key: string | undefined): Promise<{ lic: Licence; ent: Entitlements }> {
  const lic = await resolveLicence(key ?? io.env.TOKENTICKS_KEY, nodeDeps(licenceServer(io.env), cacheDir(io.env)));
  if (lic.warning) io.err(`tokenticks: ${lic.warning}`);
  return { lic, ent: entitlementsFor(lic.tier) };
}

function modelOrThrow(name: string) {
  const m = resolveModel(name);
  if (!m) {
    const close = suggestModels(name);
    const hint = close.length > 0 ? ` Did you mean: ${close.join(', ')}?` : '';
    throw new UsageError(`Unknown model "${name}".${hint} (tokenticks models lists them all)`);
  }
  return m;
}

const fmtUsd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtInt = (n: number) => n.toLocaleString('en-US');

/** Files under the given paths (or cwd) that the config calls prompts; explicit files always count. */
export function discover(io: Io, paths: string[], config: Config): string[] {
  const found = new Set<string>();
  const rel = (p: string) => relative(io.cwd, p).split(sep).join('/');
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const r = rel(full);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (config.exclude.some((g) => g.endsWith('/**') && (r === g.slice(0, -3) || r.endsWith(`/${g.slice(0, -3)}`)))) continue;
        walk(full);
      } else if (isPromptFile(r, config)) {
        found.add(r);
      }
    }
  };
  if (paths.length === 0) walk(io.cwd);
  for (const p of paths) {
    const full = join(io.cwd, p);
    if (!existsSync(full)) throw new UsageError(`No such file or directory: ${p}`);
    if (statSync(full).isDirectory()) walk(full);
    else found.add(rel(full));
  }
  return [...found].sort();
}

function ghEscape(s: string, prop = false): string {
  let out = s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  if (prop) out = out.replace(/:/g, '%3A').replace(/,/g, '%2C');
  return out;
}

function summaryMarkdown(reports: FileReport[], findings: Finding[]): string {
  const lines = ['### TokenTicks lint', '', '| File | Model | Tokens | Per month | Findings |', '|---|---|---:|---:|---:|'];
  for (const r of reports) {
    const n = findings.filter((f) => f.file === r.file).length;
    lines.push(`| \`${r.file}\` | ${r.model} | ${fmtInt(r.tokens)} | ${r.monthlyUsd === null ? '—' : fmtUsd(r.monthlyUsd)} | ${n} |`);
  }
  return `${lines.join('\n')}\n`;
}

async function cmdLint(io: Io, positionals: string[], opts: Record<string, string | boolean | undefined>): Promise<number> {
  const format = (opts.format as string | undefined) ?? 'text';
  if (!['text', 'json', 'github'].includes(format)) throw new UsageError('--format for lint is text, json or github.');
  const config = loadConfig(io, opts.config as string | undefined);
  modelOrThrow(config.model);
  const { lic, ent } = await licence(io, opts.key as string | undefined);
  const { rules, notices } = effectiveRules({ config, ent });
  await ready();

  const files = discover(io, positionals, config);
  const reports: FileReport[] = [];
  for (const file of files) {
    const text = readFileSync(join(io.cwd, file), 'utf8');
    try {
      reports.push(lintFile(file, text, { config, ent }, rules));
    } catch (e) {
      if (e instanceof UnknownModelError) throw new UsageError(e.message);
      throw e;
    }
  }
  const findings = reports.flatMap((r) => r.findings);
  const errors = findings.filter((f) => f.level === 'error').length;
  const warnings = findings.length - errors;
  // Savings only. A budget overrun is a limit, not a saving, and it overlaps
  // whatever the other checks would remove from the same file.
  const fixable = findings.reduce((s, f) => s + (f.check === 'budget' ? 0 : (f.monthlyUsd ?? 0)), 0);

  if (format === 'json') {
    io.out(JSON.stringify({ tier: lic.tier, files: reports, notices, errors, warnings, fixableMonthlyUsd: fixable }, null, 2));
  } else if (format === 'github') {
    for (const f of findings) {
      const props = [`file=${ghEscape(f.file, true)}`];
      if (f.line !== null) props.push(`line=${f.line}`);
      props.push(`title=${ghEscape(`TokenTicks ${f.check}`, true)}`);
      const worth = f.monthlyUsd ? ` (~${fmtUsd(f.monthlyUsd)}/month)` : '';
      io.out(`::${f.level === 'error' ? 'error' : 'warning'} ${props.join(',')}::${ghEscape(f.message + worth)}`);
    }
    for (const n of notices) io.out(`::notice title=TokenTicks::${ghEscape(n)}`);
    const summary = io.env.GITHUB_STEP_SUMMARY;
    if (summary) appendFileSync(summary, summaryMarkdown(reports, findings));
  } else {
    if (files.length === 0) {
      io.out(`No prompt files found. Files matching ${config.include.join(', ')} are checked; set "include" in ${CONFIG_FILE}.`);
    }
    for (const r of reports) {
      const cost = r.monthlyUsd === null ? 'not priced on this plan' : `${fmtUsd(r.monthlyUsd)}/month`;
      io.out(`${r.file}  (${r.model}, ${fmtInt(r.tokens)} tokens, ${cost})`);
      for (const f of r.findings) {
        const where = f.line === null ? '' : `L${f.line} `;
        const worth = f.monthlyUsd ? `  ~${fmtUsd(f.monthlyUsd)}/mo` : '';
        io.out(`  ${f.level.padEnd(5)}  ${where}${f.check}: ${f.message}${worth}`);
      }
    }
    for (const n of notices) io.out(`note: ${n}`);
    const tail = fixable > 0 ? ` · up to ${fmtUsd(fixable)}/month recoverable` : '';
    io.out(`${errors > 0 ? '✖' : '✔'} ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'} in ${files.length} file${files.length === 1 ? '' : 's'}${tail}`);
  }
  return errors > 0 ? 1 : 0;
}

async function cmdDiff(io: Io, opts: Record<string, string | boolean | undefined>): Promise<number> {
  const format = (opts.format as string | undefined) ?? 'markdown';
  if (!['markdown', 'json', 'text'].includes(format)) throw new UsageError('--format for diff is markdown, json or text.');
  const base = (opts.base as string | undefined) ?? (io.env.GITHUB_BASE_REF ? `origin/${io.env.GITHUB_BASE_REF}` : undefined);
  if (!base) throw new UsageError('diff needs --base <ref> (in a pull-request workflow it defaults to origin/$GITHUB_BASE_REF).');
  const config = loadConfig(io, opts.config as string | undefined);
  modelOrThrow(config.model);
  const { ent } = await licence(io, opts.key as string | undefined);
  if (!ent.features.ciCostDiff) {
    // Nothing on stdout: a workflow posting stdout as a comment must not post an upsell.
    io.err(`tokenticks: diff is part of the Team plan; skipped. Set TOKENTICKS_KEY to a Team key (${APP_URL}).`);
    return 0;
  }
  await ready();
  let changed;
  try {
    changed = changedPromptFiles(base, config, io.cwd);
  } catch (e) {
    throw new UsageError((e as Error).message);
  }
  const result = priceChanges(changed.files, config, base);
  let text: string;
  if (format === 'json') text = JSON.stringify(result, null, 2);
  else if (format === 'markdown') text = toMarkdown(result);
  else {
    text = result.rows.length === 0
      ? `No prompt token changes against ${base}.`
      : [
          ...result.rows.map((r) => `${r.path}: ${r.tokensBefore} → ${r.tokensAfter} tokens (${r.deltaTokens >= 0 ? '+' : ''}${r.deltaTokens}), ${r.deltaMonthlyUsd >= 0 ? '+' : '−'}${fmtUsd(Math.abs(r.deltaMonthlyUsd))}/month`),
          `Total: ${result.deltaMonthlyUsd >= 0 ? '+' : '−'}${fmtUsd(Math.abs(result.deltaMonthlyUsd))}/month`,
        ].join('\n');
  }
  io.out(text);
  if (opts.output) writeFileSync(opts.output as string, `${text}\n`);
  return 0;
}

function readInputs(io: Io, positionals: string[]): Array<{ name: string; text: string }> {
  if (positionals.length === 0 || (positionals.length === 1 && positionals[0] === '-')) {
    return [{ name: '<stdin>', text: io.stdin() }];
  }
  return positionals.map((p) => {
    const full = join(io.cwd, p);
    if (!existsSync(full) || statSync(full).isDirectory()) throw new UsageError(`Not a file: ${p}`);
    return { name: p, text: readFileSync(full, 'utf8') };
  });
}

export async function run(argv: string[], io: Io): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        model: { type: 'string' },
        models: { type: 'string' },
        config: { type: 'string' },
        format: { type: 'string' },
        base: { type: 'string' },
        output: { type: 'string' },
        key: { type: 'string' },
        'output-tokens': { type: 'string' },
        'calls-per-day': { type: 'string' },
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (e) {
    io.err(`tokenticks: ${(e as Error).message}\nRun tokenticks --help for usage.`);
    return 2;
  }
  const { values: opts, positionals } = parsed;
  const [command, ...rest] = positionals;

  if (opts.version) {
    io.out(VERSION);
    return 0;
  }
  if (opts.help || !command) {
    io.out(HELP);
    return command || opts.help ? 0 : 2;
  }

  try {
    switch (command) {
      case 'count': {
        const config = loadConfig(io, opts.config);
        const model = modelOrThrow(opts.model ?? config.model);
        await ready();
        const rows = readInputs(io, rest).map(({ name, text }) => ({ file: name, ...countDetail(text, model) }));
        if (opts.json) io.out(JSON.stringify({ model: model.id, files: rows }, null, 2));
        else {
          for (const r of rows) io.out(`${fmtInt(r.tokens).padStart(10)}  ${r.file}${r.exact ? '' : '  (estimate)'}`);
          if (rows.length > 1) io.out(`${fmtInt(rows.reduce((s, r) => s + r.tokens, 0)).padStart(10)}  total (${model.label})`);
        }
        return 0;
      }
      case 'compare': {
        const config = loadConfig(io, opts.config);
        const { ent } = await licence(io, opts.key);
        await ready();
        const [input] = readInputs(io, rest.slice(0, 1));
        const out = opts['output-tokens'] ? Number(opts['output-tokens']) : config.outputTokens;
        const calls = opts['calls-per-day'] ? Number(opts['calls-per-day']) : config.callsPerDay;
        if (!Number.isFinite(out) || out < 0 || !Number.isFinite(calls) || calls < 0) {
          throw new UsageError('--output-tokens and --calls-per-day must be non-negative numbers.');
        }
        const names = opts.models ? opts.models.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_COMPARE_IDS;
        const models = names.map(modelOrThrow);
        const allowed = models.filter((m) => ent.modelAllowlist === null || ent.modelAllowlist.includes(m.id));
        const locked = models.filter((m) => !allowed.includes(m));
        const rows = allowed
          .map((m) => {
            const d = countDetail(input!.text, m);
            const perCall = callCost(m, d.tokens, out).total;
            return { model: m.id, label: m.label, tokens: d.tokens, exact: d.exact, perCall, perMonth: perCall * calls * 30 };
          })
          .sort((a, b) => a.perMonth - b.perMonth);
        if (opts.json) {
          io.out(JSON.stringify({ outputTokens: out, callsPerDay: calls, pricingAsOf: PRICING_AS_OF, models: rows, needsPaidPlan: locked.map((m) => m.id) }, null, 2));
        } else {
          io.out(`${out} output tokens/call · ${fmtInt(calls)} calls/day · list rates as of ${PRICING_AS_OF}`);
          for (const r of rows) {
            io.out(`${r.label.padEnd(22)} ${fmtInt(r.tokens).padStart(9)} tok${r.exact ? ' ' : '~'}  ${`$${r.perCall.toFixed(5)}`.padStart(11)}/call  ${fmtUsd(r.perMonth).padStart(12)}/month`);
          }
          if (locked.length > 0) io.out(`note: pricing ${locked.map((m) => m.label).join(', ')} needs Pro.`);
        }
        return 0;
      }
      case 'lint':
        return await cmdLint(io, rest, opts);
      case 'diff':
        return await cmdDiff(io, opts);
      case 'mcp': {
        let config = DEFAULT_CONFIG;
        try {
          config = loadConfig(io, opts.config);
        } catch (e) {
          io.err(`tokenticks: ${(e as Error).message} Using defaults.`);
        }
        const { lic, ent } = await licence(io, opts.key);
        await ready();
        const defaultModel = resolveModel(opts.model ?? config.model)?.id ?? DEFAULT_CONFIG.model;
        io.err(`tokenticks MCP server ${VERSION} on stdio · plan: ${lic.tier} · default model: ${defaultModel}`);
        await serveStdio({ tier: lic.tier, ent, cwd: io.cwd, defaultModel });
        return 0;
      }
      case 'models': {
        if (opts.json) io.out(JSON.stringify(MODELS, null, 2));
        else {
          io.out(`Rates in USD per million tokens, as of ${PRICING_AS_OF}.`);
          for (const m of MODELS) {
            io.out(`${m.id.padEnd(24)} ${m.vendor.padEnd(10)} in ${String(m.inputPerM).padStart(6)}  out ${String(m.outputPerM).padStart(6)}  ctx ${fmtInt(m.context)}`);
          }
        }
        return 0;
      }
      case 'whoami': {
        const { lic, ent } = await licence(io, opts.key);
        const on = (Object.keys(ent.features) as Array<keyof typeof ent.features>).filter((f) => ent.features[f]);
        if (opts.json) io.out(JSON.stringify({ tier: lic.tier, source: lic.source, account: lic.publicId, features: on }, null, 2));
        else {
          io.out(`Plan: ${lic.tier}${lic.publicId ? ` (account ${lic.publicId})` : ''}`);
          io.out(`Checked: ${{ none: 'no key set', online: 'just now', cache: 'from cache (under 12 hours old)', grace: 'from cache, server unreachable', offline: 'server unreachable', invalid: 'key not accepted', unconfigured: 'no licence server in this build' }[lic.source]}`);
        }
        return 0;
      }
      case 'init': {
        const file = join(io.cwd, CONFIG_FILE);
        if (existsSync(file)) throw new UsageError(`${CONFIG_FILE} already exists.`);
        const starter = {
          include: ['prompts/**/*.{md,txt,prompt}', '**/*.prompt.md'],
          model: 'claude-sonnet-5',
          callsPerDay: 1000,
          outputTokens: 500,
          cacheHitRate: 0.8,
          budget: { maxTokens: 8000 },
          files: { 'prompts/system*.md': { callsPerDay: 10000 } },
        };
        writeFileSync(file, `${JSON.stringify(starter, null, 2)}\n`);
        io.out(`Wrote ${CONFIG_FILE}. Edit "include" to point at your prompts, then run: tokenticks lint`);
        return 0;
      }
      default:
        throw new UsageError(`Unknown command "${command}". Run tokenticks --help.`);
    }
  } catch (e) {
    if (e instanceof UsageError || e instanceof ConfigError) {
      io.err(`tokenticks: ${e.message}`);
      return 2;
    }
    throw e;
  }
}

export const nodeIo = (): Io => ({
  cwd: process.cwd(),
  env: process.env,
  out: (s) => process.stdout.write(`${s}\n`),
  err: (s) => process.stderr.write(`${s}\n`),
  stdin: () => readFileSync(0, 'utf8'),
});
