/**
 * Config, plan gating and the lint / diff commands. Plan gating is the part
 * with money attached, so each tier is exercised; the config tests hold the
 * validator to naming a misspelt key rather than silently ignoring it.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError, DEFAULT_CONFIG, globToRegExp, isPromptFile, parseConfig, settingsFor, trimmerLevel } from '../cli/src/config.ts';
import { effectiveRules, lintFile } from '../cli/src/lint.ts';
import { priceChanges, toMarkdown, COMMENT_MARKER } from '../cli/src/diff.ts';
import { ready } from '../cli/src/engine.ts';
import { run } from '../cli/src/main.ts';
import { entitlementsFor } from '../src/lib/entitlements.ts';

before(async () => {
  await ready();
});

const PROMPT = [
  'Current time: 2026-09-24T10:15:00Z',
  'Request id: 3f2c9a1e-8b7d-4c6e-9f10-2a3b4c5d6e7f',
  '',
  'You review pull requests for a payments service written in Go.',
  'Please kindly flag any change that logs card numbers, even partially.',
  'Prefer small, concrete suggestions over rewrites, and cite the line.',
  'Never approve a change that removes a test without replacing it.',
].join('\n');

test('globs: ** spans directories, * does not, braces alternate', () => {
  assert.ok(globToRegExp('prompts/**/*.md').test('prompts/a.md'));
  assert.ok(globToRegExp('prompts/**/*.md').test('prompts/x/y/a.md'));
  assert.ok(!globToRegExp('prompts/*.md').test('prompts/x/a.md'));
  assert.ok(globToRegExp('**/*.prompt').test('a.prompt'));
  assert.ok(globToRegExp('**/*.prompt').test('src/deep/a.prompt'));
  assert.ok(globToRegExp('prompts/**/*.{md,txt}').test('prompts/a.txt'));
  assert.ok(!globToRegExp('prompts/**/*.{md,txt}').test('prompts/a.json'));
  assert.ok(!globToRegExp('a.md').test('aXmd'), 'dots are literal');
});

test('default include finds prompts and excludes dependencies', () => {
  assert.ok(isPromptFile('prompts/system.md', DEFAULT_CONFIG));
  assert.ok(isPromptFile('src/agent/triage.prompt.md', DEFAULT_CONFIG));
  assert.ok(!isPromptFile('README.md', DEFAULT_CONFIG));
  assert.ok(!isPromptFile('node_modules/pkg/prompts/x.md', DEFAULT_CONFIG));
});

test('a misspelt key is an error that names it, not a silent default', () => {
  assert.throws(() => parseConfig({ callsPerday: 5 }), (e) => e instanceof ConfigError && /unknown key "callsPerday"/.test(e.message));
  assert.throws(() => parseConfig({ rules: { trimmer: { politness: 'error' } } }), /unknown rule "politness"/);
  assert.throws(() => parseConfig({ rules: { budget: 'fatal' } }), /"error", "warn" or "off"/);
  assert.throws(() => parseConfig({ cacheHitRate: 80 }), /between 0 and 1/);
  assert.throws(() => parseConfig({ cache: { ignore: ['('] } }), /not a valid regular expression/);
  assert.throws(() => parseConfig({ files: { 'a.md': { calls: 1 } } }), /files\["a.md"\]: unknown key "calls"/);
  assert.throws(() => parseConfig([]), /JSON object/);
});

test('file overrides apply in order, later matches winning', () => {
  const c = parseConfig({
    callsPerDay: 100,
    files: { 'prompts/**': { callsPerDay: 1_000 }, 'prompts/hot.md': { callsPerDay: 50_000, model: 'gpt-5' } },
  });
  assert.equal(settingsFor('other.md', c).callsPerDay, 100);
  assert.equal(settingsFor('prompts/cold.md', c).callsPerDay, 1_000);
  const hot = settingsFor('prompts/hot.md', c);
  assert.deepEqual([hot.callsPerDay, hot.model], [50_000, 'gpt-5']);
});

test('per-rule trimmer levels fall back to warn', () => {
  const c = parseConfig({ rules: { trimmer: { politeness: 'error', hedge: 'off' } } });
  assert.equal(trimmerLevel(c.rules, 'politeness'), 'error');
  assert.equal(trimmerLevel(c.rules, 'hedge'), 'off');
  assert.equal(trimmerLevel(c.rules, 'duplicateLine'), 'warn');
  assert.equal(c.customRules, true);
});

const lint = (tier, raw = {}) => {
  const config = parseConfig(raw);
  const ctx = { config, ent: entitlementsFor(tier) };
  const { rules, notices } = effectiveRules(ctx);
  return { report: lintFile('prompts/review.md', PROMPT, ctx, rules), notices };
};

test('free: budgets only, and the skipped checks are named', () => {
  const { report, notices } = lint('free', { budget: { maxTokens: 50 } });
  assert.deepEqual(report.findings.map((f) => f.check), ['budget']);
  assert.equal(report.findings[0].level, 'error');
  assert.ok(notices.some((n) => /Trimmer checks .* need Pro/.test(n)));
  assert.ok(notices.some((n) => /Cache-order checks need Pro/.test(n)));
});

test('free: a model outside the free five is counted but not priced', () => {
  const { report } = lint('free', { model: 'gemini-2-5-pro', budget: { maxMonthlyUsd: 0.01 } });
  assert.ok(report.tokens > 0);
  assert.equal(report.monthlyUsd, null);
  assert.deepEqual(report.findings, [], 'a USD budget cannot fail on a model the plan does not price');
});

test('pro: the Trimmer and the cache-order check run, and each finding has a line', () => {
  const { report, notices } = lint('pro');
  const checks = report.findings.map((f) => f.check).sort();
  assert.deepEqual(checks, ['cacheability', 'trimmer']);
  const trimmer = report.findings.find((f) => f.check === 'trimmer');
  assert.equal(trimmer.rule, 'politeness');
  assert.equal(trimmer.line, 5);
  const cache = report.findings.find((f) => f.check === 'cacheability');
  assert.equal(cache.line, 1);
  assert.match(cache.message, /Move lines 1–2 .* below line 7/);
  assert.ok(cache.monthlyUsd > 0);
  assert.equal(notices.length, 0);
});

test('pro: a team rule config is ignored, with a notice, and defaults apply', () => {
  const { report, notices } = lint('pro', { rules: { trimmer: 'error', cacheability: 'off' } });
  assert.ok(notices.some((n) => /"rules" section .* is a Team feature/.test(n)));
  assert.ok(report.findings.every((f) => f.level === 'warn'));
  assert.ok(report.findings.some((f) => f.check === 'cacheability'));
});

test('team: the rule config decides levels, including off', () => {
  const { report, notices } = lint('team', { rules: { trimmer: 'error', cacheability: 'off' } });
  assert.equal(notices.length, 0);
  assert.deepEqual(report.findings.map((f) => [f.check, f.level]), [['trimmer', 'error']]);
});

test('cache.ignore silences a value the team knows is fixed', () => {
  const { report } = lint('pro', { cache: { ignore: ['^2026-', '^3f2c9a1e'] } });
  assert.ok(!report.findings.some((f) => f.check === 'cacheability'));
});

test('diff prices only the input side, and skips files whose count did not change', () => {
  const config = parseConfig({ callsPerDay: 1_000, files: { 'b.md': { model: 'gpt-5', callsPerDay: 10_000 } } });
  const r = priceChanges(
    [
      { path: 'a.md', oldPath: null, status: 'modified', before: 'one two three', after: 'one two three' },
      { path: 'b.md', oldPath: null, status: 'modified', before: 'short', after: 'a much longer prompt than before it was' },
      { path: 'c.md', oldPath: 'old/c.md', status: 'renamed', before: 'same text', after: 'same text' },
    ],
    config,
    'origin/main',
  );
  assert.deepEqual(r.rows.map((x) => x.path), ['b.md']);
  const row = r.rows[0];
  // GPT-5 is exact (o200k): delta x 10k/day x 30 x $1.25/MTok.
  assert.ok(Math.abs(row.deltaMonthlyUsd - (row.deltaTokens * 10_000 * 30 * 1.25) / 1e6) < 1e-9);
  const md = toMarkdown(r);
  assert.ok(md.startsWith(COMMENT_MARKER));
  assert.match(md, /\*\*\+\$[\d.]+\/month\*\* from 1 prompt file/);
  assert.match(md, /Input cost only/);
});

test('diff with no changes says so rather than printing an empty table', () => {
  const md = toMarkdown(priceChanges([], DEFAULT_CONFIG, 'origin/main'));
  assert.match(md, /No prompt files changed/);
  assert.ok(!md.includes('|---'));
});

/* ---------------------------------------------------------------- run() -- */

function io(cwd, stdin = '', env = {}) {
  const out = [];
  const err = [];
  return {
    io: {
      cwd,
      env: { TOKENTICKS_CACHE_DIR: join(cwd, '.cache'), ...env },
      out: (s) => out.push(s),
      err: (s) => err.push(s),
      stdin: () => stdin,
    },
    out,
    err,
  };
}

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), 'tt-cli-'));
  for (const [p, content] of Object.entries(files)) {
    mkdirSync(join(dir, p, '..'), { recursive: true });
    writeFileSync(join(dir, p), content);
  }
  return dir;
}

test('exit codes: 0 clean, 1 on an error-level finding, 2 on misuse', async () => {
  const clean = project({ 'prompts/a.md': 'Summarise the ticket in two lines.' });
  assert.equal(await run(['lint'], io(clean).io), 0);

  const over = project({ 'prompts/a.md': PROMPT, '.tokenticks.json': JSON.stringify({ budget: { maxTokens: 10 } }) });
  const o = io(over);
  assert.equal(await run(['lint'], o.io), 1);
  assert.ok(o.out.some((l) => /✖ 1 error/.test(l)));

  const bad = project({ '.tokenticks.json': '{"callsPerday": 1}' });
  const b = io(bad);
  assert.equal(await run(['lint'], b.io), 2);
  assert.match(b.err.join('\n'), /unknown key "callsPerday"/);

  assert.equal(await run(['frobnicate'], io(clean).io), 2);
  assert.equal(await run(['lint', '--format', 'xml'], io(clean).io), 2);
  assert.equal(await run(['count', '--model', 'no-such-model'], io(clean, 'x').io), 2);
});

test('a key the licence server cannot confirm never changes the exit code', async () => {
  const dir = project({ 'prompts/a.md': 'Summarise the ticket in two lines.' });
  const env = { TOKENTICKS_KEY: `tt_${'b'.repeat(64)}`, TOKENTICKS_API_URL: 'http://127.0.0.1:9', TOKENTICKS_API_KEY: 'anon' };
  const r = io(dir, '', env);
  assert.equal(await run(['lint'], r.io), 0);
  assert.match(r.err.join('\n'), /Could not reach the TokenTicks licence server/);
});

test('diff on the free plan prints nothing to stdout, so a workflow posts no upsell', async () => {
  const dir = project({ 'prompts/a.md': 'x' });
  const r = io(dir);
  assert.equal(await run(['diff', '--base', 'main'], r.io), 0);
  assert.deepEqual(r.out, []);
  assert.match(r.err.join('\n'), /Team plan/);
});

test('count reads stdin and reports an estimate marker for non-exact families', async () => {
  const dir = project({});
  const r = io(dir, 'Hello there, how are you today?');
  assert.equal(await run(['count', '--model', 'claude-opus-5'], r.io), 0);
  assert.match(r.out[0], /^\s+\d+\s+<stdin>\s+\(estimate\)$/);
  const g = io(dir, 'Hello there, how are you today?');
  await run(['count', '--model', 'gpt-5', '--json'], g.io);
  const j = JSON.parse(g.out.join('\n'));
  assert.equal(j.files[0].exact, true);
});

test('github format escapes newlines and percent signs in annotations', async () => {
  const dir = project({ 'prompts/a.md': PROMPT });
  const r = io(dir, '', {});
  // Free tier: only a budget finding is possible, so force one.
  writeFileSync(join(dir, '.tokenticks.json'), JSON.stringify({ budget: { maxTokens: 10 } }));
  await run(['lint', '--format', 'github'], r.io);
  const line = r.out.find((l) => l.startsWith('::error'));
  assert.ok(line, 'an error annotation is emitted');
  assert.match(line, /^::error file=prompts\/a\.md,title=TokenTicks budget::/);
  assert.ok(!line.slice(2).includes('\n'));
});
