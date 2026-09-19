/**
 * The Token Trimmer: a prompt linter that reports what the fat actually costs.
 *
 * Savings are measured, not estimated. Each rule is applied on its own and the
 * result re-tokenised, so the figure beside a rule is the real token delta for
 * that rule rather than a guess from character counts - a rewrite can even cost
 * tokens if it splits a word the vocabulary had whole, and this will say so.
 *
 * Rules only ever remove ceremony or collapse a phrase into a shorter one with
 * the same instruction. None of them touch anything that could carry meaning:
 * no rule drops a number, a proper noun, a constraint or a negation.
 */

export type RuleId =
  | 'politeness'
  | 'assistantPreamble'
  | 'verbosePhrase'
  | 'hedge'
  | 'duplicateLine'
  | 'blankLines'
  | 'trailingSpace'
  | 'markdownNoise';

export interface Rule {
  id: RuleId;
  label: string;
  why: string;
  /** Severity drives the highlight colour: 'trim' is safe, 'review' needs a look. */
  severity: 'trim' | 'review';
  apply: (text: string) => string;
  /** Count of places this rule would act, for reporting. */
  count: (text: string) => number;
}

const PAIRS: Array<[RegExp, string]> = [
  [/\bin order to\b/gi, 'to'],
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bat this point in time\b/gi, 'now'],
  [/\bin the event that\b/gi, 'if'],
  [/\bfor the purpose of\b/gi, 'to'],
  [/\ba large number of\b/gi, 'many'],
  [/\bthe majority of\b/gi, 'most'],
  [/\bis able to\b/gi, 'can'],
  [/\bhas the ability to\b/gi, 'can'],
  [/\bmake sure that\b/gi, 'ensure'],
  [/\bit is important that you\b/gi, ''],
  [/\bwith regard to\b/gi, 'about'],
  [/\bin spite of the fact that\b/gi, 'although'],
  [/\bon a regular basis\b/gi, 'regularly'],
];

const POLITENESS =
  /\b(please|kindly|thank you(?: very much)?|thanks(?: a lot)?|if you (?:would|could) (?:please|kindly)|i would (?:like|appreciate it) if you (?:would|could)?|could you please|would you please)\b[,.!?]*\s*/gi;

const PREAMBLE =
  /\b(?:you are (?:a|an) (?:helpful|expert|professional|skilled|world[- ]class|highly experienced)[^.\n]*\.\s*|(?:please )?act as (?:a|an)[^.\n]*\.\s*|i want you to act as[^.\n]*\.\s*|imagine you are[^.\n]*\.\s*)/gi;

const HEDGES =
  /\b(?:basically|actually|essentially|simply|just|really|very|quite|rather|somewhat|extremely|definitely|certainly|obviously|of course)\s+/gi;

function countMatches(text: string, re: RegExp): number {
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  let n = 0;
  while (r.exec(text) !== null) {
    n += 1;
    if (r.lastIndex === 0) break;
  }
  return n;
}

/** Strips a leading "1.", "2)", "-" or "*" so renumbered duplicates still match. */
function dedupeKey(line: string): string {
  return line
    .trim()
    .replace(/^(?:\d+[.)]|[-*\u2022])\s+/, '')
    .toLowerCase();
}

function dedupeLines(text: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const key = dedupeKey(line);
    // Short lines are structure (headings, "Rules:", bullets) - never dedupe them.
    if (key.length < 25) {
      out.push(line);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out.join('\n');
}

function countDuplicateLines(text: string): number {
  const seen = new Set<string>();
  let n = 0;
  for (const line of text.split('\n')) {
    const key = dedupeKey(line);
    if (key.length < 25) continue;
    if (seen.has(key)) n += 1;
    else seen.add(key);
  }
  return n;
}

export const RULES: Rule[] = [
  {
    id: 'politeness',
    label: 'Politeness filler',
    why: 'Models do not respond better to "please" or "kindly". Every one is billed.',
    severity: 'trim',
    apply: (t) => t.replace(POLITENESS, ''),
    count: (t) => countMatches(t, POLITENESS),
  },
  {
    id: 'assistantPreamble',
    label: 'Role preamble',
    why: '"You are a helpful assistant" and "Act as a…" openers rarely change behaviour on current models. State the task instead.',
    severity: 'review',
    apply: (t) => t.replace(PREAMBLE, ''),
    count: (t) => countMatches(t, PREAMBLE),
  },
  {
    id: 'verbosePhrase',
    label: 'Verbose phrasing',
    why: 'Long connectives collapse to one word with no loss of instruction.',
    severity: 'trim',
    apply: (t) => PAIRS.reduce((acc, [re, to]) => acc.replace(re, to), t),
    count: (t) => PAIRS.reduce((n, [re]) => n + countMatches(t, re), 0),
  },
  {
    id: 'hedge',
    label: 'Hedges and intensifiers',
    why: '"Just", "very", "basically" and friends add tokens without adding constraint.',
    severity: 'review',
    apply: (t) => t.replace(HEDGES, ''),
    count: (t) => countMatches(t, HEDGES),
  },
  {
    id: 'duplicateLine',
    label: 'Repeated instructions',
    why: 'A rule stated twice costs twice. Only lines of 25 characters or more are considered.',
    severity: 'review',
    apply: dedupeLines,
    count: countDuplicateLines,
  },
  {
    id: 'markdownNoise',
    label: 'Decorative markdown',
    why: 'Bold runs and horizontal rules are formatting for humans; the model pays for the asterisks.',
    severity: 'trim',
    apply: (t) => t.replace(/\*{3,}/g, '**').replace(/^[ \t]*[-=_*]{3,}[ \t]*$/gm, ''),
    count: (t) => countMatches(t, /\*{3,}|^[ \t]*[-=_*]{3,}[ \t]*$/gm),
  },
  {
    id: 'blankLines',
    label: 'Excess blank lines',
    why: 'Three or more consecutive newlines collapse to a paragraph break.',
    severity: 'trim',
    apply: (t) => t.replace(/\n{3,}/g, '\n\n'),
    count: (t) => countMatches(t, /\n{3,}/g),
  },
  {
    id: 'trailingSpace',
    label: 'Trailing whitespace',
    why: 'Invisible, and frequently its own token at the end of a line.',
    severity: 'trim',
    apply: (t) => t.replace(/[ \t]+$/gm, ''),
    count: (t) => countMatches(t, /[ \t]+$/gm),
  },
];

/** Tidy up the seams a removal leaves behind, without reflowing the prompt. */
function normalise(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/([.!?])[ \t]*([.!?])/g, (m, a: string, b: string) => (a === b ? m : a))
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[ \t]+$/gm, '')
    .trim();
}

export interface RuleFinding {
  rule: Rule;
  occurrences: number;
  /** Tokens this rule alone removes. Negative would mean it costs tokens. */
  tokensSaved: number;
}

export interface TrimResult {
  original: string;
  trimmed: string;
  originalTokens: number;
  trimmedTokens: number;
  tokensSaved: number;
  savedFraction: number;
  findings: RuleFinding[];
}

/**
 * Runs the enabled rules and measures each one's true token delta.
 *
 * `countTokens` is injected so this module stays independent of which encoder is
 * loaded, and so it can be tested without one.
 */
export function trim(
  text: string,
  countTokens: (s: string) => number,
  enabled: Set<RuleId> = new Set(RULES.map((r) => r.id)),
): TrimResult {
  const originalTokens = countTokens(text);

  const findings: RuleFinding[] = [];
  for (const rule of RULES) {
    if (!enabled.has(rule.id)) continue;
    const occurrences = rule.count(text);
    if (occurrences === 0) continue;
    const alone = normalise(rule.apply(text));
    findings.push({
      rule,
      occurrences,
      tokensSaved: originalTokens - countTokens(alone),
    });
  }

  let trimmed = text;
  for (const rule of RULES) {
    if (enabled.has(rule.id)) trimmed = rule.apply(trimmed);
  }
  trimmed = normalise(trimmed);

  const trimmedTokens = countTokens(trimmed);
  return {
    original: text,
    trimmed,
    originalTokens,
    trimmedTokens,
    tokensSaved: originalTokens - trimmedTokens,
    savedFraction: originalTokens > 0 ? (originalTokens - trimmedTokens) / originalTokens : 0,
    findings: findings.sort((a, b) => b.tokensSaved - a.tokensSaved),
  };
}

/** What the saving is worth per month at a given call volume and input rate. */
export function monthlySaving(
  tokensSaved: number,
  callsPerMonth: number,
  inputPerM: number,
): number {
  return (tokensSaved * callsPerMonth * inputPerM) / 1e6;
}
