/**
 * `.tokenticks.json`: which files are prompts, what they run on, how often, and
 * what counts as a failure.
 *
 * Validation is strict on purpose. A misspelt key ("callsPerday") that was
 * silently ignored would leave a team believing its budget was enforced when
 * it was running on defaults, which is worse than no config at all.
 */

import type { RuleId } from '../../src/lib/trimmer.ts';
import { RULES } from '../../src/lib/trimmer.ts';

export type Level = 'error' | 'warn' | 'off';

export interface FileSettings {
  model: string;
  callsPerDay: number;
  outputTokens: number;
  maxTokens: number | null;
  maxMonthlyUsd: number | null;
}

export interface RuleConfig {
  budget: Level;
  cacheability: Level;
  /** One level for every Trimmer rule, or a level per rule id. */
  trimmer: Level | Partial<Record<RuleId, Level>>;
}

export interface Config {
  include: string[];
  exclude: string[];
  model: string;
  callsPerDay: number;
  outputTokens: number;
  cacheHitRate: number;
  budget: { maxTokens: number | null; maxMonthlyUsd: number | null };
  rules: RuleConfig;
  cache: { ignore: string[]; minConfidence: 'high' | 'medium' };
  /** Glob -> overrides, applied in order; later matches win. */
  files: Record<string, Partial<FileSettings>>;
  /** True when the file set `rules` - which only Team plans honour. */
  customRules: boolean;
}

export const CONFIG_FILE = '.tokenticks.json';

export const DEFAULT_RULES: RuleConfig = { budget: 'error', cacheability: 'warn', trimmer: 'warn' };

export const DEFAULT_CONFIG: Config = {
  include: ['**/*.prompt', '**/*.prompt.md', '**/*.prompt.txt', 'prompts/**/*.{md,txt,prompt}'],
  exclude: ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
  model: 'claude-sonnet-5',
  callsPerDay: 1_000,
  outputTokens: 500,
  cacheHitRate: 0.8,
  budget: { maxTokens: null, maxMonthlyUsd: null },
  rules: DEFAULT_RULES,
  cache: { ignore: [], minConfidence: 'medium' },
  files: {},
  customRules: false,
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const TOP_KEYS = new Set([
  '$schema',
  'include',
  'exclude',
  'model',
  'callsPerDay',
  'outputTokens',
  'cacheHitRate',
  'budget',
  'rules',
  'cache',
  'files',
]);
const FILE_KEYS = new Set(['model', 'callsPerDay', 'outputTokens', 'maxTokens', 'maxMonthlyUsd']);
const LEVELS = new Set(['error', 'warn', 'off']);
const RULE_IDS = new Set<string>(RULES.map((r) => r.id));

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function unknownKeys(obj: Record<string, unknown>, allowed: Set<string>, where: string): void {
  for (const k of Object.keys(obj)) {
    if (!allowed.has(k)) {
      throw new ConfigError(`${where}: unknown key "${k}". Allowed: ${[...allowed].filter((a) => a !== '$schema').join(', ')}.`);
    }
  }
}

function stringList(v: unknown, where: string): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw new ConfigError(`${where} must be a list of strings.`);
  return v as string[];
}

function positive(v: unknown, where: string, allowZero = false): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || (!allowZero && v === 0)) {
    throw new ConfigError(`${where} must be a ${allowZero ? 'non-negative' : 'positive'} number.`);
  }
  return v;
}

function limit(v: unknown, where: string): number | null {
  return v === null || v === undefined ? null : positive(v, where);
}

function level(v: unknown, where: string): Level {
  if (typeof v !== 'string' || !LEVELS.has(v)) throw new ConfigError(`${where} must be "error", "warn" or "off".`);
  return v as Level;
}

function fileSettings(v: unknown, where: string): Partial<FileSettings> {
  if (!isObject(v)) throw new ConfigError(`${where} must be an object.`);
  unknownKeys(v, FILE_KEYS, where);
  const out: Partial<FileSettings> = {};
  if (v.model !== undefined) {
    if (typeof v.model !== 'string') throw new ConfigError(`${where}.model must be a string.`);
    out.model = v.model;
  }
  if (v.callsPerDay !== undefined) out.callsPerDay = positive(v.callsPerDay, `${where}.callsPerDay`, true);
  if (v.outputTokens !== undefined) out.outputTokens = positive(v.outputTokens, `${where}.outputTokens`, true);
  if (v.maxTokens !== undefined) out.maxTokens = limit(v.maxTokens, `${where}.maxTokens`);
  if (v.maxMonthlyUsd !== undefined) out.maxMonthlyUsd = limit(v.maxMonthlyUsd, `${where}.maxMonthlyUsd`);
  return out;
}

/** Parses and validates a config object. Throws ConfigError naming the bad key. */
export function parseConfig(raw: unknown): Config {
  if (!isObject(raw)) throw new ConfigError(`${CONFIG_FILE} must contain a JSON object.`);
  unknownKeys(raw, TOP_KEYS, CONFIG_FILE);
  const c: Config = structuredClone(DEFAULT_CONFIG);

  if (raw.include !== undefined) c.include = stringList(raw.include, 'include');
  if (raw.exclude !== undefined) c.exclude = [...DEFAULT_CONFIG.exclude, ...stringList(raw.exclude, 'exclude')];
  if (raw.model !== undefined) {
    if (typeof raw.model !== 'string') throw new ConfigError('model must be a string.');
    c.model = raw.model;
  }
  if (raw.callsPerDay !== undefined) c.callsPerDay = positive(raw.callsPerDay, 'callsPerDay', true);
  if (raw.outputTokens !== undefined) c.outputTokens = positive(raw.outputTokens, 'outputTokens', true);
  if (raw.cacheHitRate !== undefined) {
    const h = positive(raw.cacheHitRate, 'cacheHitRate', true);
    if (h > 1) throw new ConfigError('cacheHitRate is a share between 0 and 1, e.g. 0.8.');
    c.cacheHitRate = h;
  }
  if (raw.budget !== undefined) {
    if (!isObject(raw.budget)) throw new ConfigError('budget must be an object.');
    unknownKeys(raw.budget, new Set(['maxTokens', 'maxMonthlyUsd']), 'budget');
    c.budget = {
      maxTokens: limit(raw.budget.maxTokens, 'budget.maxTokens'),
      maxMonthlyUsd: limit(raw.budget.maxMonthlyUsd, 'budget.maxMonthlyUsd'),
    };
  }
  if (raw.rules !== undefined) {
    if (!isObject(raw.rules)) throw new ConfigError('rules must be an object.');
    unknownKeys(raw.rules, new Set(['budget', 'cacheability', 'trimmer']), 'rules');
    const r: RuleConfig = { ...DEFAULT_RULES };
    if (raw.rules.budget !== undefined) r.budget = level(raw.rules.budget, 'rules.budget');
    if (raw.rules.cacheability !== undefined) r.cacheability = level(raw.rules.cacheability, 'rules.cacheability');
    if (raw.rules.trimmer !== undefined) {
      if (typeof raw.rules.trimmer === 'string') {
        r.trimmer = level(raw.rules.trimmer, 'rules.trimmer');
      } else if (isObject(raw.rules.trimmer)) {
        const per: Partial<Record<RuleId, Level>> = {};
        for (const [id, v] of Object.entries(raw.rules.trimmer)) {
          if (!RULE_IDS.has(id)) {
            throw new ConfigError(`rules.trimmer: unknown rule "${id}". Rules: ${[...RULE_IDS].join(', ')}.`);
          }
          per[id as RuleId] = level(v, `rules.trimmer.${id}`);
        }
        r.trimmer = per;
      } else {
        throw new ConfigError('rules.trimmer must be a level or an object of rule levels.');
      }
    }
    c.rules = r;
    c.customRules = true;
  }
  if (raw.cache !== undefined) {
    if (!isObject(raw.cache)) throw new ConfigError('cache must be an object.');
    unknownKeys(raw.cache, new Set(['ignore', 'minConfidence']), 'cache');
    if (raw.cache.ignore !== undefined) {
      c.cache.ignore = stringList(raw.cache.ignore, 'cache.ignore');
      for (const p of c.cache.ignore) {
        try {
          new RegExp(p);
        } catch {
          throw new ConfigError(`cache.ignore: "${p}" is not a valid regular expression.`);
        }
      }
    }
    if (raw.cache.minConfidence !== undefined) {
      if (raw.cache.minConfidence !== 'high' && raw.cache.minConfidence !== 'medium') {
        throw new ConfigError('cache.minConfidence must be "high" or "medium".');
      }
      c.cache.minConfidence = raw.cache.minConfidence;
    }
  }
  if (raw.files !== undefined) {
    if (!isObject(raw.files)) throw new ConfigError('files must be an object of glob -> settings.');
    for (const [glob, v] of Object.entries(raw.files)) c.files[glob] = fileSettings(v, `files["${glob}"]`);
  }
  return c;
}

/** The level a Trimmer rule reports at, under a rule config. */
export function trimmerLevel(rules: RuleConfig, id: RuleId): Level {
  if (typeof rules.trimmer === 'string') return rules.trimmer;
  return rules.trimmer[id] ?? DEFAULT_RULES.trimmer as Level;
}

/* ------------------------------------------------------------------ globs -- */

/** Converts a glob to an anchored RegExp over forward-slash relative paths. */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i]!;
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        const slash = glob[i + 2] === '/';
        re += slash ? '(?:.*/)?' : '.*';
        i += slash ? 2 : 1;
      } else {
        re += '[^/]*';
      }
    } else if (ch === '?') {
      re += '[^/]';
    } else if (ch === '{') {
      const end = glob.indexOf('}', i);
      if (end === -1) {
        re += '\\{';
      } else {
        re += `(?:${glob
          .slice(i + 1, end)
          .split(',')
          .map((s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'))
          .join('|')})`;
        i = end;
      }
    } else {
      re += ch.replace(/[.+^$()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

export function matchesAny(path: string, globs: string[]): boolean {
  return globs.some((g) => globToRegExp(g).test(path));
}

export function isPromptFile(path: string, c: Config): boolean {
  return matchesAny(path, c.include) && !matchesAny(path, c.exclude);
}

/** Settings for one file: the defaults, then every matching `files` entry in order. */
export function settingsFor(path: string, c: Config): FileSettings {
  const s: FileSettings = {
    model: c.model,
    callsPerDay: c.callsPerDay,
    outputTokens: c.outputTokens,
    maxTokens: c.budget.maxTokens,
    maxMonthlyUsd: c.budget.maxMonthlyUsd,
  };
  for (const [glob, over] of Object.entries(c.files)) {
    if (globToRegExp(glob).test(path)) Object.assign(s, over);
  }
  return s;
}
