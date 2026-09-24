/**
 * `tokenticks diff`: what a change to the prompts costs per month.
 *
 * Review is the one moment a cost is cheap to question - after merge it is a
 * line on an invoice. So the output is written for a pull-request comment: one
 * headline, one row per changed prompt, and the assumptions it rests on.
 *
 * Only the input side is priced. Editing a prompt changes what is sent on every
 * call; what comes back is a property of the task, and guessing it would put
 * a made-up number in the headline.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { settingsFor, isPromptFile, type Config } from './config.ts';
import { countTokens, resolveModel } from './engine.ts';

export interface ChangedFile {
  path: string;
  /** Path at the base, when the file was renamed. */
  oldPath: string | null;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  before: string;
  after: string;
}

export interface DiffRow {
  path: string;
  status: ChangedFile['status'];
  model: string;
  modelLabel: string;
  callsPerDay: number;
  tokensBefore: number;
  tokensAfter: number;
  deltaTokens: number;
  /** Input cost per month, after minus before. */
  deltaMonthlyUsd: number;
}

export interface DiffResult {
  rows: DiffRow[];
  deltaMonthlyUsd: number;
  base: string;
}

export function priceChanges(files: ChangedFile[], config: Config, base: string): DiffResult {
  const rows: DiffRow[] = [];
  for (const f of files) {
    const s = settingsFor(f.path, config);
    const model = resolveModel(s.model);
    if (!model) throw new Error(`${f.path}: unknown model "${s.model}".`);
    const before = countTokens(f.before, model);
    const after = countTokens(f.after, model);
    // A rename or a whitespace-neutral edit costs nothing; a ±0 row is noise.
    if (before === after) continue;
    const delta = after - before;
    rows.push({
      path: f.path,
      status: f.status,
      model: model.id,
      modelLabel: model.label,
      callsPerDay: s.callsPerDay,
      tokensBefore: before,
      tokensAfter: after,
      deltaTokens: delta,
      deltaMonthlyUsd: (delta * s.callsPerDay * 30 * model.inputPerM) / 1e6,
    });
  }
  rows.sort((a, b) => Math.abs(b.deltaMonthlyUsd) - Math.abs(a.deltaMonthlyUsd));
  return { rows, deltaMonthlyUsd: rows.reduce((s, r) => s + r.deltaMonthlyUsd, 0), base };
}

/** Hidden marker so a workflow can find and update its own comment. */
export const COMMENT_MARKER = '<!-- tokenticks-diff -->';

function money(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : '±';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function signed(n: number): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toLocaleString('en-US')}`;
}

export function toMarkdown(r: DiffResult): string {
  const lines = [COMMENT_MARKER, '### TokenTicks — prompt cost change', ''];
  if (r.rows.length === 0) {
    lines.push(`No prompt files changed their token count against \`${r.base}\`.`);
    return lines.join('\n');
  }
  const perCall = r.rows.reduce((s, x) => s + x.deltaTokens, 0);
  const files = `${r.rows.length} prompt file${r.rows.length === 1 ? '' : 's'}`;
  lines.push(`**${money(r.deltaMonthlyUsd)}/month** from ${files} (${signed(perCall)} tokens per call in total).`, '');
  lines.push('| File | Model | Tokens | Δ tokens | Calls/day | Δ per month |', '|---|---|---:|---:|---:|---:|');
  for (const x of r.rows) {
    const tokens = x.status === 'added' ? `new → ${x.tokensAfter.toLocaleString('en-US')}` : x.status === 'deleted' ? `${x.tokensBefore.toLocaleString('en-US')} → removed` : `${x.tokensBefore.toLocaleString('en-US')} → ${x.tokensAfter.toLocaleString('en-US')}`;
    lines.push(
      `| \`${x.path}\` | ${x.modelLabel} | ${tokens} | ${signed(x.deltaTokens)} | ${x.callsPerDay.toLocaleString('en-US')} | ${money(x.deltaMonthlyUsd)} |`,
    );
  }
  lines.push(
    '',
    `<sub>Input cost only, at list rates with no caching, over 30 days at the call volumes in \`.tokenticks.json\`. Compared against \`${r.base}\`. Output tokens depend on the task, not the prompt edit, so they are not guessed.</sub>`,
  );
  return lines.join('\n');
}

/* ------------------------------------------------------------------- git -- */

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Prompt files that differ between the merge base with `base` and the working tree. */
export function changedPromptFiles(base: string, config: Config, cwd: string): { files: ChangedFile[]; mergeBase: string } {
  let mergeBase: string;
  try {
    mergeBase = git(['merge-base', base, 'HEAD'], cwd).trim();
  } catch {
    throw new Error(
      `Could not find a common ancestor with "${base}". In CI, check out with full history (actions/checkout: fetch-depth: 0) and pass an existing ref, e.g. --base origin/main.`,
    );
  }
  const out = git(['diff', '--name-status', '-M', '-z', mergeBase, '--'], cwd);
  const parts = out.split('\0').filter((p) => p.length > 0);
  const files: ChangedFile[] = [];
  const show = (path: string) => {
    try {
      return git(['show', `${mergeBase}:${path}`], cwd);
    } catch {
      return '';
    }
  };
  const read = (path: string) => {
    const full = `${cwd}/${path}`;
    return existsSync(full) ? readFileSync(full, 'utf8') : '';
  };
  for (let i = 0; i < parts.length; ) {
    const code = parts[i]!;
    i += 1;
    if (code.startsWith('R') || code.startsWith('C')) {
      const oldPath = parts[i]!;
      const path = parts[i + 1]!;
      i += 2;
      if (!isPromptFile(path, config) && !isPromptFile(oldPath, config)) continue;
      files.push({ path, oldPath, status: 'renamed', before: show(oldPath), after: read(path) });
      continue;
    }
    const path = parts[i]!;
    i += 1;
    if (!isPromptFile(path, config)) continue;
    const status = code === 'A' ? 'added' : code === 'D' ? 'deleted' : 'modified';
    files.push({
      path,
      oldPath: null,
      status,
      before: status === 'added' ? '' : show(path),
      after: status === 'deleted' ? '' : read(path),
    });
  }
  return { files, mergeBase };
}
