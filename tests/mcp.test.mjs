/**
 * The MCP server. Two layers: the handler in-process, for the protocol edge
 * cases (notifications, parse errors, unknown methods, path escapes); and the
 * built binary driven by the official SDK client over real stdio, which is the
 * proof that a hand-written server actually interoperates.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer as createHttp } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createServer, TOOLS } from '../cli/src/mcp.ts';
import { ready } from '../cli/src/engine.ts';
import { entitlementsFor } from '../src/lib/entitlements.ts';

const cwd = mkdtempSync(join(tmpdir(), 'tt-mcp-'));
writeFileSync(join(cwd, 'system.md'), 'You are a support agent for Acme. Answer in two sentences.');

const server = (tier) => createServer({ tier, ent: entitlementsFor(tier), cwd, defaultModel: 'claude-sonnet-5' });
const call = (s, name, args, id = 1) => s.handleOne({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

before(async () => {
  await ready();
});

test('initialize echoes a supported protocol version and falls back to ours otherwise', () => {
  const s = server('free');
  const a = s.handleOne({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
  assert.equal(a.result.protocolVersion, '2025-06-18');
  assert.deepEqual(a.result.capabilities, { tools: { listChanged: false } });
  assert.equal(a.result.serverInfo.name, 'tokenticks');
  const b = s.handleOne({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
  assert.equal(b.result.protocolVersion, '2025-11-25');
});

test('notifications get no reply; unknown methods and bad JSON get the right error codes', () => {
  const s = server('free');
  assert.equal(s.handleLine('{"jsonrpc":"2.0","method":"notifications/initialized"}'), null);
  assert.equal(s.handleLine('   '), null);
  assert.equal(JSON.parse(s.handleLine('{"jsonrpc":"2.0","id":7,"method":"resources/list"}')).error.code, -32601);
  const parse = JSON.parse(s.handleLine('{not json'));
  assert.deepEqual([parse.id, parse.error.code], [null, -32700]);
  assert.equal(JSON.parse(s.handleLine('{"jsonrpc":"2.0","id":8,"method":"ping"}')).result.constructor, Object);
  assert.equal(call(s, 'no_such_tool', {}).error.code, -32602);
});

test('every tool declares an object schema and is marked read-only', () => {
  const list = server('team').handleOne({ jsonrpc: '2.0', id: 1, method: 'tools/list' }).result.tools;
  assert.deepEqual(list.map((t) => t.name), TOOLS.map((t) => t.name));
  for (const t of list) {
    assert.equal(t.inputSchema.type, 'object', t.name);
    assert.equal(t.annotations.readOnlyHint, true, t.name);
  }
});

test('on the free plan, gated tools are listed with their plan and refuse with a way forward', () => {
  const s = server('free');
  const list = s.handleOne({ jsonrpc: '2.0', id: 1, method: 'tools/list' }).result.tools;
  assert.match(list.find((t) => t.name === 'trim_prompt').description, /\(Requires Pro\.\)$/);
  const r = call(s, 'trim_prompt', { text: 'Please help.' }).result;
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /Pro or Team plan. Set TOKENTICKS_KEY/);
});

test('count_tokens is never gated, on any model', () => {
  const r = call(server('free'), 'count_tokens', { text: 'Hello world', model: 'gemini-2-5-pro' }).result;
  assert.equal(r.isError, undefined);
  assert.ok(r.structuredContent.tokens > 0);
  assert.equal(r.structuredContent.exact, false);
});

test('compare_models on free prices the free five and names the rest', () => {
  const r = call(server('free'), 'compare_models', { text: 'Hello world', models: ['gpt-5', 'gemini-2-5-pro', 'nope'] }).result.structuredContent;
  assert.deepEqual(r.models.map((m) => m.model), ['gpt-5']);
  assert.deepEqual(r.needsPaidPlan, ['gemini-2-5-pro']);
  assert.deepEqual(r.unknownModels, ['nope']);
});

test('compare_models sorts cheapest first and prices per month from per call', () => {
  const r = call(server('pro'), 'compare_models', { text: 'Hello world', models: ['claude-opus-5', 'claude-haiku-4-5'], calls_per_day: 100 }).result.structuredContent;
  assert.deepEqual(r.models.map((m) => m.model), ['claude-haiku-4-5', 'claude-opus-5']);
  for (const m of r.models) assert.ok(Math.abs(m.monthlyCost - m.costPerCall * 100 * 30) < 0.01);
});

test('path reads a file under the working directory and refuses anything outside it', () => {
  const s = server('free');
  const ok = call(s, 'count_tokens', { path: 'system.md' }).result;
  assert.ok(ok.structuredContent.tokens > 5);
  for (const path of ['../etc/passwd', '/etc/passwd', 'missing.md']) {
    const r = call(s, 'count_tokens', { path }).result;
    assert.equal(r.isError, true, path);
  }
  assert.equal(call(s, 'count_tokens', { path: 'system.md', text: 'x' }).result.isError, true);
  assert.equal(call(s, 'count_tokens', {}).result.isError, true);
});

test('bad arguments come back as tool errors the model can read, not protocol failures', () => {
  const s = server('pro');
  const r = call(s, 'cache_lint', { text: 'x', hit_rate: 3 }).result;
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /hit_rate/);
  assert.equal(call(s, 'count_tokens', { text: 'x', model: 'nope' }).result.isError, true);
});

test('cache_lint on Pro reports the loss and the move', () => {
  const text = 'Now: 2026-09-24T10:15:00Z\n\nYou are the billing assistant for Acme. Refunds over $500 need a manager. Never promise a date.';
  const r = call(server('pro'), 'cache_lint', { text, model: 'claude-opus-5' }).result.structuredContent;
  assert.ok(r.lostTokens > 0);
  assert.equal(r.moves[0].advice, 'Move line 1 (date and time) below line 3');
  assert.ok(r.monthlyLossUsd > 0);
  assert.ok(r.reordered.startsWith('You are the billing'));
});

test('cache_roi reports the published break-even', () => {
  const r = call(server('pro'), 'cache_roi', { model: 'claude-opus-5', cached_tokens: 4000 }).result.structuredContent;
  // Anthropic's 1.25x write / 0.1x read: h* = 0.25 / 1.15.
  assert.ok(Math.abs(r.breakEvenHitRate - 0.2174) < 1e-4);
  assert.ok(r.savedUsd > 0);
});

/* ------------------------------------------------ official client interop -- */

let licence;
const TEAM_KEY = `tt_${'c'.repeat(64)}`;

before(async () => {
  execFileSync(process.execPath, ['cli/build.mjs'], { stdio: 'ignore' });
  licence = createHttp((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const { p_key } = JSON.parse(body);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(p_key === TEAM_KEY ? [{ tier: 'team', public_id: 'TT-INTEROP', key_label: 'ci' }] : []));
    });
  });
  await new Promise((r) => licence.listen(0, '127.0.0.1', r));
});

after(() => licence?.close());

async function connect(env) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(process.cwd(), 'cli/dist/tokenticks.mjs'), 'mcp'],
    cwd,
    env: { PATH: process.env.PATH, TOKENTICKS_CACHE_DIR: join(cwd, '.cache'), ...env },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'tokenticks-test', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

test('the official SDK client connects, lists tools and calls one over stdio', async () => {
  const client = await connect({});
  try {
    const info = client.getServerVersion();
    assert.equal(info.name, 'tokenticks');
    const { tools } = await client.listTools();
    assert.ok(tools.some((t) => t.name === 'compare_models'));
    const r = await client.callTool({ name: 'count_tokens', arguments: { path: 'system.md', model: 'gpt-5' } });
    assert.equal(r.structuredContent.model, 'gpt-5');
    assert.equal(r.structuredContent.exact, true);
    const gated = await client.callTool({ name: 'cache_lint', arguments: { text: 'x' } });
    assert.equal(gated.isError, true);
    await client.ping();
  } finally {
    await client.close();
  }
});

test('with a Team key from the licence server, the gated tools open', async () => {
  const port = licence.address().port;
  const client = await connect({
    TOKENTICKS_KEY: TEAM_KEY,
    TOKENTICKS_API_URL: `http://127.0.0.1:${port}`,
    TOKENTICKS_API_KEY: 'anon',
  });
  try {
    const r = await client.callTool({ name: 'trim_prompt', arguments: { text: 'Please kindly summarise this report for me. Thank you!' } });
    assert.equal(r.isError, undefined);
    assert.ok(r.structuredContent.tokensSaved > 0);
  } finally {
    await client.close();
  }
});
