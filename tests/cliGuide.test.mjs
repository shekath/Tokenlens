/**
 * The developer guide is pasted into terminals and CI files by customers, so
 * every snippet is held to the real tool here: a command, flag, model id or
 * config key that the CLI does not accept fails this suite rather than a
 * customer's first attempt.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CODEX_TOML,
  MIXED_VENDOR_CONFIG,
  VSCODE_JSON,
  EXAMPLE_CONFIG,
  GUIDE_STEPS,
  KEY_PLACEHOLDER,
  MCP_JSON,
  TEAM_RULES_CONFIG,
  TROUBLESHOOTING,
  WORKFLOW_YAML,
} from '../src/lib/cliGuide.ts';
import { parseConfig } from '../cli/src/config.ts';
import { ready, resolveModel } from '../cli/src/engine.ts';
import { run } from '../cli/src/main.ts';
import { TOOLS } from '../cli/src/mcp.ts';

before(async () => {
  await ready();
});

const mainSrc = readFileSync('cli/src/main.ts', 'utf8');
const COMMANDS = [...mainSrc.matchAll(/case '([a-z]+)':/g)].map((m) => m[1]);
const OPTIONS = [...mainSrc.slice(mainSrc.indexOf('options: {')).matchAll(/^\s+'?([a-z-]+)'?: \{ type:/gm)].map((m) => m[1]);

const allCode = GUIDE_STEPS.flatMap((s) => s.snippets.map((sn) => ({ step: s.id, ...sn })));
const commandLines = allCode
  .filter((s) => s.kind === 'command' || (s.kind === 'file' && s.file?.endsWith('.yml')))
  .flatMap((s) => s.code.split('\n'))
  .filter((l) => /\btokenticks\s+[a-z]/.test(l) && !l.trim().startsWith('#'));

test('the guide knows the real command list', () => {
  assert.deepEqual(COMMANDS.sort(), ['compare', 'count', 'diff', 'init', 'lint', 'mcp', 'models', 'whoami']);
  assert.ok(OPTIONS.includes('calls-per-day') && OPTIONS.includes('models'));
});

test('every tokenticks command in the guide exists', () => {
  assert.ok(commandLines.length >= 8, 'the guide shows the commands');
  for (const line of commandLines) {
    // The last "tokenticks <word>": in "gemini mcp add … tokenticks npx
    // tokenticks mcp" the first is the server's name, the last the command.
    const cmd = [...line.matchAll(/\btokenticks\s+([a-z]+)/g)].at(-1)[1];
    assert.ok(COMMANDS.includes(cmd), `"${cmd}" in: ${line}`);
  }
});

/** The part of a line from "tokenticks <command>" on - other tools' flags (codex --env) come before it. */
const cliPart = (line) => {
  const m = line.match(new RegExp(`\\btokenticks\\s+(${COMMANDS.join('|')})\\b(.*)$`));
  return m ? m[0] : '';
};

test('every flag in the guide is an option the CLI accepts', () => {
  for (const line of commandLines) {
    for (const [, flag] of cliPart(line).matchAll(/--([a-z-]+)/g)) {
      assert.ok(OPTIONS.includes(flag), `--${flag} in: ${line}`);
    }
  }
});

test('every model id in the guide resolves', () => {
  const ids = new Set();
  for (const line of commandLines) {
    for (const [, v] of line.matchAll(/--models? ([\w.,-]+)/g)) v.split(',').forEach((id) => ids.add(id));
  }
  for (const cfg of [EXAMPLE_CONFIG, MIXED_VENDOR_CONFIG]) {
    for (const [, id] of cfg.matchAll(/"model": "([^"]+)"/g)) ids.add(id);
  }
  assert.ok(ids.size >= 4);
  for (const id of ids) assert.ok(resolveModel(id), id);
});

test('the example configs pass the CLI\'s own validator', () => {
  const c = parseConfig(JSON.parse(EXAMPLE_CONFIG));
  assert.equal(c.callsPerDay, 1000);
  assert.equal(c.budget.maxTokens, 8000);
  const rules = parseConfig(JSON.parse(TEAM_RULES_CONFIG));
  assert.equal(rules.customRules, true);
});

test('the MCP config is valid JSON with the placeholder key, never a real one', () => {
  const j = JSON.parse(MCP_JSON);
  assert.deepEqual(j.mcpServers.tokenticks.args, ['-y', 'tokenticks', 'mcp']);
  assert.equal(j.mcpServers.tokenticks.env.TOKENTICKS_KEY, KEY_PLACEHOLDER);
  for (const s of allCode) assert.ok(!/tt_[0-9a-f]{64}/.test(s.code), `a real-shaped key in ${s.label}`);
});

test('the MCP tools the guide names are the ones the server exposes', () => {
  const note = GUIDE_STEPS.find((s) => s.id === 'mcp').notes.join(' ');
  for (const t of TOOLS) assert.ok(note.includes(t.name), t.name);
});

test('the workflow pins the action versions this repository runs on', () => {
  const ours = readFileSync('.github/workflows/publish-cli.yml', 'utf8');
  for (const action of ['actions/checkout', 'actions/setup-node']) {
    const want = ours.match(new RegExp(`${action}@(v\\d+)`))[1];
    assert.match(WORKFLOW_YAML, new RegExp(`${action}@${want}\\b`), action);
  }
  assert.match(WORKFLOW_YAML, /fetch-depth: 0/);
  assert.match(WORKFLOW_YAML, /<!-- tokenticks-diff -->/);
});

test('the whoami sample matches what the command prints', async () => {
  const out = [];
  await run(['whoami'], { cwd: process.cwd(), env: {}, out: (s) => out.push(s), err: () => {}, stdin: () => '' });
  const sample = GUIDE_STEPS.find((s) => s.id === 'terminal').snippets.find((s) => s.kind === 'output').code;
  assert.match(out[0], /^Plan: free$/);
  assert.match(sample.split('\n')[0], /^Plan: (free|pro|team)/);
  assert.match(sample.split('\n')[1], /^Checked: /);
  assert.match(out[1], /^Checked: /);
});

test('each troubleshooting message is text the CLI really prints', () => {
  const sources = ['cli/src/licence.ts', 'cli/src/diff.ts', 'cli/src/lint.ts'].map((f) => readFileSync(f, 'utf8')).join('\n');
  for (const t of TROUBLESHOOTING) {
    const probe = t.message.replace(/\s*…$/, '').replace(/"/g, '"');
    assert.ok(sources.includes(probe), t.message);
  }
});

test('step ids are unique and every step says something', () => {
  const ids = GUIDE_STEPS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of GUIDE_STEPS) assert.ok(s.intro.length > 0, s.id);
});

test('the mixed-vendor config parses and really spans vendors', () => {
  const c = parseConfig(JSON.parse(MIXED_VENDOR_CONFIG));
  const vendors = new Set([c.model, ...Object.values(c.files).map((f) => f.model).filter(Boolean)].map((id) => resolveModel(id).vendor));
  assert.ok(vendors.size >= 3, [...vendors].join(', '));
});

test('the five-vendor compare example names five different vendors', () => {
  const line = GUIDE_STEPS.find((s) => s.id === 'models').snippets[0].code;
  const ids = line.match(/--models ([\w.,-]+)/)[1].split(',');
  assert.equal(new Set(ids.map((id) => resolveModel(id).vendor)).size, 5);
});

const mcpTabs = GUIDE_STEPS.find((s) => s.id === 'mcp').snippets.filter((s) => s.group === 'mcp-client');

test('the MCP step has a tab for every tool the guide promises', () => {
  assert.deepEqual([...new Set(mcpTabs.map((s) => s.tab))], ['Codex', 'Gemini CLI', 'VS Code', 'Claude Code', 'Cursor', 'Claude Desktop']);
  // Grouped snippets must be consecutive, or they would render as two tab rows.
  const snippets = GUIDE_STEPS.find((s) => s.id === 'mcp').snippets;
  const first = snippets.findIndex((s) => s.group);
  const last = snippets.findLastIndex((s) => s.group);
  assert.ok(snippets.slice(first, last + 1).every((s) => s.group === 'mcp-client'));
});

test('every MCP client launches the same server command', () => {
  for (const s of mcpTabs) {
    if (s.kind === 'command') assert.match(s.code, /npx (-y )?tokenticks mcp$/, s.tab);
  }
  assert.match(CODEX_TOML, /^\[mcp_servers\.tokenticks\]$/m);
  assert.match(CODEX_TOML, /^command = "npx"$/m);
  assert.match(CODEX_TOML, /^args = \["-y", "tokenticks", "mcp"\]$/m);
  assert.match(CODEX_TOML, /^env = \{ TOKENTICKS_KEY = "tt_your_key_here" \}$/m);
});

test('codex puts its own flags before "--" and the server command after it', () => {
  const codex = mcpTabs.find((s) => s.tab === 'Codex' && s.kind === 'command').code;
  assert.match(codex, /^codex mcp add tokenticks --env TOKENTICKS_KEY=\S+ -- npx -y tokenticks mcp$/);
});

test('the gemini command leaves -y off, so gemini cannot read it as its own flag', () => {
  const gem = mcpTabs.find((s) => s.tab === 'Gemini CLI' && s.kind === 'command').code;
  assert.match(gem, /^gemini mcp add -s user -e TOKENTICKS_KEY=\S+ tokenticks npx tokenticks mcp$/);
  const file = mcpTabs.find((s) => s.tab === 'Gemini CLI' && s.kind === 'file');
  assert.match(file.note, /env/);
});

test('VS Code prompts for the key instead of storing it in a committable file', () => {
  const j = JSON.parse(VSCODE_JSON);
  assert.equal(j.inputs[0].password, true);
  assert.equal(j.servers.tokenticks.type, 'stdio');
  assert.deepEqual(j.servers.tokenticks.args, ['-y', 'tokenticks', 'mcp']);
  assert.equal(j.servers.tokenticks.env.TOKENTICKS_KEY, `\${input:${j.inputs[0].id}}`);
  assert.ok(!VSCODE_JSON.includes(KEY_PLACEHOLDER));
});
