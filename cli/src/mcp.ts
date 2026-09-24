/**
 * `tokenticks mcp`: the engine as Model Context Protocol tools, over stdio.
 *
 * This puts cost answers inside the tool a developer is already using - Claude
 * Code, Cursor, any MCP client - mid-conversation: "what does this system
 * prompt cost on Opus against Haiku at 10k calls a day?" It runs locally, so
 * the product's promise holds here too: prompts are counted on this machine
 * and never sent anywhere. The only network call is the licence check.
 *
 * The protocol is implemented directly rather than through the SDK. For a
 * stdio server with tools only it is a small surface - initialize, ping,
 * tools/list, tools/call - and the SDK's server brings an HTTP stack (express,
 * hono, CORS, OAuth) that every `npx tokenticks lint` in CI would install for
 * nothing. Interoperability is proven instead: the test suite drives this
 * server with the official SDK client.
 */

import { createInterface } from 'node:readline';
import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import type { Entitlements, Feature, Tier } from '../../src/lib/entitlements.ts';
import { requiredTier } from '../../src/lib/entitlements.ts';
import { DEFAULT_COMPARE_IDS, PRICING_AS_OF } from '../../src/lib/models.ts';
import { callCost, utilization } from '../../src/lib/cost.ts';
import { trim } from '../../src/lib/trimmer.ts';
import { analyseCacheability, describeMove, monthlyCacheLoss } from '../../src/lib/cacheability.ts';
import { breakEvenCallCount, breakEvenHitRate, simulate, supportsCaching } from '../../src/lib/cacheSim.ts';
import { MODELS, countDetail, resolveModel, tokenCounter, type Model } from './engine.ts';
import { APP_URL, VERSION } from './buildinfo.ts';

export const SUPPORTED_PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export interface ServerContext {
  tier: Tier;
  ent: Entitlements;
  cwd: string;
  defaultModel: string;
}

type Args = Record<string, unknown>;

class ToolError extends Error {}

interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  feature?: Feature;
  run(args: Args, ctx: ServerContext): Record<string, unknown>;
}

/* ------------------------------------------------------------ arguments -- */

const TEXT_OR_PATH = {
  text: { type: 'string', description: 'The prompt text. Give this or `path`.' },
  path: {
    type: 'string',
    description: 'A file to read instead of `text`, relative to the directory the server was started in.',
  },
};
const MODEL = {
  model: {
    type: 'string',
    description: 'Model id (e.g. "claude-sonnet-5", "gpt-5"), API id, or dated snapshot name. Defaults to the configured model.',
  },
};

function str(args: Args, key: string): string | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') throw new ToolError(`"${key}" must be a string.`);
  return v;
}

function numArg(args: Args, key: string, fallback: number, { min = 0, max = Number.POSITIVE_INFINITY } = {}): number {
  const v = args[key];
  if (v === undefined || v === null) return fallback;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    throw new ToolError(`"${key}" must be a number between ${min} and ${max === Number.POSITIVE_INFINITY ? 'any size' : max}.`);
  }
  return v;
}

/** The prompt, from `text` or a file inside the server's working directory. */
function promptText(args: Args, ctx: ServerContext): string {
  const text = str(args, 'text');
  const path = str(args, 'path');
  if (text !== undefined && path !== undefined) throw new ToolError('Give either "text" or "path", not both.');
  if (text !== undefined) return text;
  if (path === undefined) throw new ToolError('Give the prompt as "text", or a file as "path".');
  const full = resolve(ctx.cwd, path);
  const rel = relative(ctx.cwd, full);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new ToolError(`"${path}" is outside ${ctx.cwd}; only files under the directory the server started in can be read.`);
  }
  let size: number;
  try {
    size = statSync(full).size;
  } catch {
    throw new ToolError(`No file at "${path}".`);
  }
  if (size > MAX_FILE_BYTES) throw new ToolError(`"${path}" is over 5 MB; that is not a prompt.`);
  return readFileSync(full, 'utf8');
}

function modelArg(args: Args, ctx: ServerContext): Model {
  const name = str(args, 'model') ?? ctx.defaultModel;
  const m = resolveModel(name);
  if (!m) throw new ToolError(`Unknown model "${name}". Call list_models for the ids.`);
  return m;
}

function priceable(m: Model, ctx: ServerContext): boolean {
  return ctx.ent.modelAllowlist === null || ctx.ent.modelAllowlist.includes(m.id);
}

function requirePriceable(m: Model, ctx: ServerContext): void {
  if (!priceable(m, ctx)) {
    throw new ToolError(
      `Pricing ${m.label} needs a Pro or Team plan; the free plan prices ${ctx.ent.modelAllowlist!.join(', ')}. ` +
        'Token counts for every model stay free (count_tokens).',
    );
  }
}

const round = (n: number, dp = 6) => Number(n.toFixed(dp));

/* ---------------------------------------------------------------- tools -- */

export const TOOLS: Tool[] = [
  {
    name: 'count_tokens',
    title: 'Count tokens',
    description:
      "Count a prompt's tokens for one model, and how much of its context window that uses. Exact for OpenAI models; a calibrated estimate for others (the result says which). Runs locally.",
    inputSchema: { type: 'object', properties: { ...TEXT_OR_PATH, ...MODEL }, additionalProperties: false },
    run(args, ctx) {
      const text = promptText(args, ctx);
      const m = modelArg(args, ctx);
      const d = countDetail(text, m);
      const u = utilization(d.tokens, m.context);
      return {
        model: m.id,
        tokens: d.tokens,
        exact: d.exact,
        encoding: d.encoding,
        basis: d.basis,
        contextWindow: m.context,
        contextUsed: round(u.fraction, 4),
        contextSeverity: u.severity,
      };
    },
  },
  {
    name: 'compare_models',
    title: 'Compare model costs',
    description:
      'Price the same prompt across models: cost per call and per month at a daily volume, cheapest first. Use it to answer "what would this cost on X instead of Y?".',
    inputSchema: {
      type: 'object',
      properties: {
        ...TEXT_OR_PATH,
        models: { type: 'array', items: { type: 'string' }, description: 'Model ids to compare. Defaults to a cross-vendor shortlist.' },
        output_tokens: { type: 'number', description: 'Expected output tokens per call. Default 500.' },
        calls_per_day: { type: 'number', description: 'Calls per day, for the monthly figure. Default 1000.' },
      },
      additionalProperties: false,
    },
    run(args, ctx) {
      const text = promptText(args, ctx);
      const out = numArg(args, 'output_tokens', 500);
      const calls = numArg(args, 'calls_per_day', 1_000);
      const requested = args.models;
      if (requested !== undefined && (!Array.isArray(requested) || requested.some((x) => typeof x !== 'string'))) {
        throw new ToolError('"models" must be a list of model ids.');
      }
      const names = (requested as string[] | undefined) ?? DEFAULT_COMPARE_IDS;
      const unknown: string[] = [];
      const locked: string[] = [];
      const rows: Array<Record<string, unknown>> = [];
      for (const name of names) {
        const m = resolveModel(name);
        if (!m) {
          unknown.push(name);
          continue;
        }
        if (!priceable(m, ctx)) {
          locked.push(m.id);
          continue;
        }
        const d = countDetail(text, m);
        const c = callCost(m, d.tokens, out);
        rows.push({
          model: m.id,
          label: m.label,
          vendor: m.vendor,
          tokens: d.tokens,
          exact: d.exact,
          costPerCall: round(c.total, 8),
          monthlyCost: round(c.total * calls * 30, 2),
          fitsContext: d.tokens <= m.context,
        });
      }
      rows.sort((a, b) => (a.monthlyCost as number) - (b.monthlyCost as number));
      const result: Record<string, unknown> = {
        outputTokensPerCall: out,
        callsPerDay: calls,
        pricingAsOf: PRICING_AS_OF,
        basis: 'List rates, no caching or batch discount, 30-day month.',
        models: rows,
      };
      if (unknown.length > 0) result.unknownModels = unknown;
      if (locked.length > 0) result.needsPaidPlan = locked;
      return result;
    },
  },
  {
    name: 'list_models',
    title: 'List models and rates',
    description: 'Every model TokenTicks prices, with context window and USD rates per million tokens (input, output, cache read/write).',
    inputSchema: {
      type: 'object',
      properties: { vendor: { type: 'string', description: 'Only this vendor, e.g. "Anthropic".' } },
      additionalProperties: false,
    },
    run(args, ctx) {
      const vendor = str(args, 'vendor')?.toLowerCase();
      const models = MODELS.filter((m) => !vendor || m.vendor.toLowerCase() === vendor).map((m) => ({
        id: m.id,
        apiId: m.apiId,
        label: m.label,
        vendor: m.vendor,
        context: m.context,
        inputPerM: m.inputPerM,
        outputPerM: m.outputPerM,
        cacheReadPerM: m.cacheReadPerM ?? null,
        cacheWritePerM: m.cacheWritePerM ?? null,
        batchDiscount: m.batchDiscount ?? null,
        pricedOnYourPlan: priceable(m, ctx),
      }));
      return { pricingAsOf: PRICING_AS_OF, models };
    },
  },
  {
    name: 'trim_prompt',
    title: 'Trim a prompt',
    description:
      'Find tokens a prompt pays for by accident - politeness, hedges, repeated instructions, decorative markdown - with each rule\'s measured saving and a trimmed version. Read the trimmed text before using it.',
    inputSchema: { type: 'object', properties: { ...TEXT_OR_PATH, ...MODEL }, additionalProperties: false },
    feature: 'trimmer',
    run(args, ctx) {
      const text = promptText(args, ctx);
      const m = modelArg(args, ctx);
      const r = trim(text, tokenCounter(m));
      return {
        model: m.id,
        tokensBefore: r.originalTokens,
        tokensAfter: r.trimmedTokens,
        tokensSaved: r.tokensSaved,
        savedFraction: round(r.savedFraction, 4),
        findings: r.findings.map((f) => ({
          rule: f.rule.id,
          label: f.rule.label,
          severity: f.rule.severity,
          occurrences: f.occurrences,
          tokensSaved: f.tokensSaved,
          why: f.rule.why,
        })),
        trimmed: r.trimmed,
      };
    },
  },
  {
    name: 'cache_lint',
    title: 'Check prompt-cache order',
    description:
      'Find per-call values (timestamps, ids, template variables) placed before stable content, which stop a prompt cache from hitting. Returns the tokens lost, their monthly cost, which blocks to move, and a reordered prompt.',
    inputSchema: {
      type: 'object',
      properties: {
        ...TEXT_OR_PATH,
        ...MODEL,
        calls_per_day: { type: 'number', description: 'Calls per day. Default 1000.' },
        hit_rate: { type: 'number', description: 'Expected cache hit rate, 0-1. Default 0.8.' },
      },
      additionalProperties: false,
    },
    feature: 'cacheLinter',
    run(args, ctx) {
      const text = promptText(args, ctx);
      const m = modelArg(args, ctx);
      const calls = numArg(args, 'calls_per_day', 1_000);
      const hit = numArg(args, 'hit_rate', 0.8, { max: 1 });
      const r = analyseCacheability(text, tokenCounter(m));
      const loss = monthlyCacheLoss(r.lostTokens, calls, m, hit);
      return {
        model: m.id,
        totalTokens: r.totalTokens,
        cacheablePrefixNow: r.prefixTokens,
        cacheablePrefixAfterReorder: r.reorderedPrefixTokens,
        lostTokens: r.lostTokens,
        lostFraction: round(r.lostFraction, 4),
        monthlyLossUsd: loss === null ? null : round(loss, 2),
        modelSupportsCaching: supportsCaching(m),
        volatileValues: r.hits.map((h) => ({ line: h.line, kind: h.kind, confidence: h.confidence, value: h.match })),
        moves: r.moves.map((mv) => ({
          startLine: mv.startLine,
          endLine: mv.endLine,
          advice: describeMove(mv, r.lastStableLine!),
        })),
        reordered: r.moves.length > 0 ? r.reordered : null,
      };
    },
  },
  {
    name: 'cache_roi',
    title: 'Prompt-cache break-even',
    description:
      'Whether prompt caching pays for a workload: cost with and without caching, the break-even hit rate, and how many calls one cache entry must serve.',
    inputSchema: {
      type: 'object',
      properties: {
        ...MODEL,
        cached_tokens: { type: 'number', description: 'Stable prefix tokens (system prompt, tools, documents).' },
        fresh_tokens: { type: 'number', description: 'Tokens that differ every call.' },
        output_tokens: { type: 'number', description: 'Output tokens per call. Default 500.' },
        calls: { type: 'number', description: 'Calls over the period. Default 30000 (about a month at 1000/day).' },
        hit_rate: { type: 'number', description: 'Share of calls that hit a warm cache, 0-1. Default 0.8.' },
      },
      required: ['cached_tokens'],
      additionalProperties: false,
    },
    feature: 'cacheSimulator',
    run(args, ctx) {
      const m = modelArg(args, ctx);
      requirePriceable(m, ctx);
      if (!supportsCaching(m)) throw new ToolError(`${m.label} publishes no prompt-cache rates.`);
      const input = {
        cachedTokens: numArg(args, 'cached_tokens', 0),
        freshTokens: numArg(args, 'fresh_tokens', 0),
        outputTokens: numArg(args, 'output_tokens', 500),
        invocations: numArg(args, 'calls', 30_000),
        hitRate: numArg(args, 'hit_rate', 0.8, { max: 1 }),
      };
      const o = simulate(m, input);
      return {
        model: m.id,
        ...input,
        uncachedCost: round(o.uncached, 2),
        cachedCost: round(o.cached, 2),
        savedUsd: round(-o.delta, 2),
        savedFraction: round(o.savedFraction, 4),
        breakEvenHitRate: round(breakEvenHitRate(m)!, 4),
        breakEvenCallsPerEntry: breakEvenCallCount(m),
      };
    },
  },
];

/* ------------------------------------------------------------- protocol -- */

type Json = Record<string, unknown>;

function rpcError(id: unknown, code: number, message: string): Json {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function gateMessage(tool: Tool): string {
  const tier = requiredTier(tool.feature!);
  const plan = tier === 'pro' ? 'Pro or Team' : 'Team';
  return (
    `${tool.name} is part of the TokenTicks ${plan} plan. Set TOKENTICKS_KEY in this server's environment ` +
    `(create a key under your profile → CLI & MCP keys at ${APP_URL}). count_tokens, compare_models and list_models work on every plan.`
  );
}

export function createServer(ctx: ServerContext) {
  function callTool(params: Json): Json {
    const name = params.name;
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) return { __rpcError: [-32602, `Unknown tool: ${String(name)}`] };
    const args = (params.arguments ?? {}) as Args;
    if (typeof args !== 'object' || Array.isArray(args)) {
      return { __rpcError: [-32602, 'Tool arguments must be an object.'] };
    }
    const fail = (message: string) => ({ content: [{ type: 'text', text: message }], isError: true });
    if (tool.feature && !ctx.ent.features[tool.feature]) return fail(gateMessage(tool));
    try {
      const result = tool.run(args, ctx);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result };
    } catch (err) {
      if (err instanceof ToolError) return fail(err.message);
      return fail(`Internal error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function handleOne(msg: unknown): Json | null {
    if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) return rpcError(null, -32600, 'Invalid request');
    const m = msg as Json;
    const isNotification = !('id' in m);
    if (m.jsonrpc !== '2.0' || typeof m.method !== 'string') {
      // A response from the client (we never send requests) or garbage.
      return isNotification || 'result' in m || 'error' in m ? null : rpcError(m.id, -32600, 'Invalid request');
    }
    if (isNotification) return null; // notifications/initialized, cancelled, …: nothing to answer.
    const params = (m.params ?? {}) as Json;
    const ok = (result: Json) => ({ jsonrpc: '2.0', id: m.id, result });

    switch (m.method) {
      case 'initialize': {
        const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
        return ok({
          protocolVersion: SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'tokenticks', title: 'TokenTicks', version: VERSION },
          instructions:
            `Token counts and LLM cost estimates, computed locally (prompts are never uploaded). Plan: ${ctx.tier}. ` +
            'Use count_tokens for sizes, compare_models for "what would this cost on X", cache_lint when prompt caching underdelivers, trim_prompt to find waste.',
        });
      }
      case 'ping':
        return ok({});
      case 'tools/list':
        return ok({
          tools: TOOLS.map((t) => ({
            name: t.name,
            title: t.title,
            description:
              t.feature && !ctx.ent.features[t.feature]
                ? `${t.description} (Requires ${requiredTier(t.feature) === 'pro' ? 'Pro' : 'Team'}.)`
                : t.description,
            inputSchema: t.inputSchema,
            annotations: { readOnlyHint: true, openWorldHint: false },
          })),
        });
      case 'tools/call': {
        const r = callTool(params);
        if ('__rpcError' in r) {
          const [code, message] = r.__rpcError as [number, string];
          return rpcError(m.id, code, message);
        }
        return ok(r);
      }
      default:
        return rpcError(m.id, -32601, `Method not found: ${m.method}`);
    }
  }

  /** One line of input in, one line of output (or nothing, for a notification). */
  function handleLine(line: string): string | null {
    if (line.trim() === '') return null;
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      return JSON.stringify(rpcError(null, -32700, 'Parse error'));
    }
    if (Array.isArray(msg)) {
      const out = msg.map(handleOne).filter((r): r is Json => r !== null);
      return out.length > 0 ? JSON.stringify(out) : null;
    }
    const r = handleOne(msg);
    return r === null ? null : JSON.stringify(r);
  }

  return { handleLine, handleOne };
}

/** Serve on stdin/stdout until the client closes stdin. Logs go to stderr only. */
export function serveStdio(ctx: ServerContext): Promise<void> {
  const server = createServer(ctx);
  const rl = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY });
  rl.on('line', (line) => {
    const out = server.handleLine(line);
    if (out !== null) process.stdout.write(`${out}\n`);
  });
  return new Promise((done) => rl.on('close', () => done()));
}
