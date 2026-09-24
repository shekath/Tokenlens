/**
 * The model sync's policy. An automatic update that gets this wrong changes
 * the prices every customer sees, so each rule - what applies on its own, what
 * waits for a person, what is never touched - is pinned here against small
 * hand-written upstream fixtures, with no network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_AUTO_ADDITIONS, VENDOR_RULES, modelKey, planSync, renderDataFile, renderReport } from '../scripts/modelSync.ts';
import { MODELS } from '../src/lib/models.ts';

const TODAY = '2026-09-24';
const chat = (provider, input, output, extra = {}) => ({
  litellm_provider: provider,
  mode: 'chat',
  input_cost_per_token: input / 1e6,
  output_cost_per_token: output / 1e6,
  ...extra,
});

const gpt5 = { id: 'gpt-5', apiId: 'gpt-5', label: 'GPT-5', vendor: 'OpenAI', tokenizer: 'o200k', context: 400_000, maxOutput: 128_000, inputPerM: 1.25, outputPerM: 10, batchDiscount: 0.5 };
const sonnet = { id: 'claude-sonnet-5', apiId: 'claude-sonnet-5', label: 'Claude Sonnet 5', vendor: 'Anthropic', tokenizer: 'claude', context: 1_000_000, inputPerM: 2, outputPerM: 10 };
const llama = { id: 'llama-4-scout', apiId: 'meta-llama/llama-4-scout', label: 'Llama 4 Scout', vendor: 'Meta', tokenizer: 'llama', context: 128_000, inputPerM: 0.1, outputPerM: 0.3, hostedRate: true };
const mistral = { id: 'mistral-large-2', apiId: 'mistral-large-latest', label: 'Mistral Large 2', vendor: 'Mistral', tokenizer: 'mistral', context: 131_072, inputPerM: 2, outputPerM: 6 };

test('model keys ignore vendor prefixes, snapshot dates, -latest and dots', () => {
  assert.equal(modelKey('gemini/gemini-2.5-pro'), 'gemini-2-5-pro');
  assert.equal(modelKey('claude-haiku-4-5-20251001'), 'claude-haiku-4-5');
  assert.equal(modelKey('gpt-4o-mini-2024-07-18'), 'gpt-4o-mini');
  assert.equal(modelKey('mistral/mistral-large-latest'), 'mistral-large');
});

test('an unchanged source changes nothing', () => {
  const plan = planSync([gpt5], { 'gpt-5': chat('openai', 1.25, 10, { max_input_tokens: 400_000 }) }, TODAY);
  assert.deepEqual(plan.changes, []);
  assert.deepEqual(plan.safe, [gpt5]);
});

test('a small price change applies on its own, cache rates with it', () => {
  const plan = planSync([sonnet], { 'claude-sonnet-5': chat('anthropic', 2.4, 12, { cache_read_input_token_cost: 0.24e-6, cache_creation_input_token_cost: 3e-6 }) }, TODAY);
  const [c] = plan.changes;
  assert.equal(c.kind, 'price');
  assert.equal(c.review, null);
  assert.deepEqual([plan.safe[0].inputPerM, plan.safe[0].outputPerM, plan.safe[0].cacheReadPerM, plan.safe[0].cacheWritePerM], [2.4, 12, 0.24, 3]);
});

test('a move of 50% or more waits for a person, and so does everything else about that model', () => {
  const plan = planSync([mistral], { 'mistral/mistral-large-latest': chat('mistral', 0.5, 1.5, { max_input_tokens: 262_144 }) }, TODAY);
  assert.equal(plan.changes.length, 2);
  for (const c of plan.changes) assert.ok(c.review, `${c.kind} should be held`);
  assert.match(plan.changes.find((c) => c.kind === 'context').review, /held with this model's other change/);
  assert.deepEqual(plan.safe, [mistral], 'the safe registry is untouched');
  assert.equal(plan.all[0].inputPerM, 0.5, 'the review registry carries the change');
});

test('upstream disagreeing with itself is held, not guessed', () => {
  const plan = planSync([gpt5], { 'gpt-5': chat('openai', 1.3, 10), 'gpt-5-2025-08-07': chat('openai', 1.25, 11) }, TODAY);
  assert.match(plan.changes[0].review, /different prices/);
});

test('a zero price is never applied', () => {
  const plan = planSync([gpt5], { 'gpt-5': chat('openai', 0, 10) }, TODAY);
  assert.ok(plan.changes[0].review);
});

test('a larger context applies; a smaller one waits', () => {
  const bigger = planSync([sonnet], { 'claude-sonnet-5': chat('anthropic', 2, 10, { max_input_tokens: 2_000_000 }) }, TODAY);
  assert.equal(bigger.changes[0].review, null);
  assert.equal(bigger.safe[0].context, 2_000_000);
  const smaller = planSync([gpt5], { 'gpt-5': chat('openai', 1.25, 10, { max_input_tokens: 272_000 }) }, TODAY);
  assert.match(smaller.changes[0].review, /smaller than we list/);
  assert.equal(smaller.safe[0].context, 400_000);
});

test('hosted open-weight models are never touched', () => {
  const plan = planSync([llama], { 'meta-llama/llama-4-scout': chat('together_ai', 9, 9) }, TODAY);
  assert.deepEqual(plan.changes, []);
  // Even under a vendor the sync covers: a host's rate is not the vendor's list price.
  const hostedMistral = { ...mistral, id: 'mistral-small-oss', apiId: 'mistral-small-oss', hostedRate: true };
  const again = planSync([hostedMistral], { 'mistral/mistral-small-oss': chat('mistral', 5, 5) }, TODAY);
  assert.deepEqual(again.changes, []);
});

test('a model the source drops is reported, never removed', () => {
  const plan = planSync([gpt5, sonnet], { 'gpt-5': chat('openai', 1.25, 10) }, TODAY);
  assert.deepEqual(plan.missing, ['claude-sonnet-5']);
  assert.equal(plan.safe.length, 2);
});

test('new models are added only when they fit a product family', () => {
  const upstream = {
    'gpt-5.4-mini': chat('openai', 0.75, 4.5, { max_input_tokens: 272_000, max_output_tokens: 128_000 }),
    'gpt-5.4-mini-2026-03-17': chat('openai', 0.75, 4.5),
    'gpt-5.6-cyber': chat('openai', 9, 9),
    'gpt-4o-search-preview': chat('openai', 2.5, 10),
    'ft:gpt-4.1-2025-04-14': chat('openai', 3, 12),
    'gemini/gemini-3.1-pro-preview': chat('gemini', 2, 12, { max_input_tokens: 1_048_576 }),
    'gemini/lyria-3-pro-preview': chat('gemini', 1, 1),
    'claude-opus-5-5': chat('anthropic', 4, 20, { cache_creation_input_token_cost: 5e-6, cache_read_input_token_cost: 0.4e-6 }),
    'xai/grok-4.20': chat('xai', 1.25, 2.5),
    'xai/grok-4.20-reasoning-latest': chat('xai', 1.25, 2.5),
    'deepseek/deepseek-v4-pro': chat('deepseek', 1.32, 3.96),
    'mistral/mistral-medium-3.5': chat('mistral', 0.4, 2),
    'mistral/mistral-medium-3-5': chat('mistral', 0.4, 2),
    'mistral/mistral-large-2512': chat('mistral', 0.5, 1.5),
    'text-embedding-3-large': { litellm_provider: 'openai', mode: 'embedding', input_cost_per_token: 1.3e-7 },
  };
  const plan = planSync([gpt5], upstream, TODAY);
  const added = plan.changes.filter((c) => c.kind === 'added');
  assert.deepEqual(
    added.map((c) => [c.id, c.label]).sort(),
    [
      ['claude-opus-5-5', 'Claude Opus 5.5'],
      ['deepseek-v4-pro', 'DeepSeek V4 Pro'],
      ['gemini-3-1-pro-preview', 'Gemini 3.1 Pro (preview)'],
      ['gpt-5-4-mini', 'GPT-5.4 mini'],
      ['grok-4-20', 'Grok 4.20'],
      ['mistral-medium-3-5', 'Mistral Medium 3.5'],
    ],
  );
  assert.ok(added.every((c) => c.review === null), 'six is under the flood limit');
  const mini = plan.safe.find((m) => m.id === 'gpt-5-4-mini');
  assert.deepEqual(
    [mini.apiId, mini.vendor, mini.tokenizer, mini.context, mini.maxOutput, mini.batchDiscount],
    ['gpt-5.4-mini', 'OpenAI', 'o200k', 272_000, 128_000, 0.5],
  );
  const opus = plan.safe.find((m) => m.id === 'claude-opus-5-5');
  assert.deepEqual([opus.tokenizer, opus.cacheReadPerM, opus.cacheWritePerM], ['claude', 0.4, 5]);
  // Variants are reported for a person, dated and fine-tuned ids are not.
  assert.ok(plan.unmatched.includes('OpenAI: gpt-5.6-cyber'));
  assert.ok(plan.unmatched.includes('Google: lyria-3-pro-preview'));
  assert.ok(!plan.unmatched.some((u) => /2512|ft:|latest|2026-03-17/.test(u)), plan.unmatched.join(', '));
});

test('legacy GPT-4 is added with the cl100k tokenizer, not o200k', () => {
  const plan = planSync([gpt5], { 'gpt-4': chat('openai', 30, 60, { max_input_tokens: 8192 }) }, TODAY);
  assert.equal(plan.safe.find((m) => m.id === 'gpt-4').tokenizer, 'cl100k');
});

test('a deprecated model is not added', () => {
  const plan = planSync([gpt5], { 'o3-mini': chat('openai', 1.1, 4.4, { deprecation_date: '2026-01-01' }) }, TODAY);
  assert.equal(plan.changes.length, 0);
});

test('a flood of new models is held, unless a catch-up raises the limit on purpose', () => {
  const upstream = {};
  for (let i = 0; i <= MAX_AUTO_ADDITIONS; i += 1) upstream[`gpt-${10 + i}`] = chat('openai', 1, 2);
  const plan = planSync([gpt5], upstream, TODAY);
  assert.equal(plan.changes.length, MAX_AUTO_ADDITIONS + 1);
  assert.ok(plan.changes.every((c) => /new models in one run/.test(c.review)));
  assert.equal(plan.safe.length, 1);
  const catchUp = planSync([gpt5], upstream, TODAY, 50);
  assert.ok(catchUp.changes.every((c) => c.review === null));
});

test('every vendor rule\'s label reads like a product name', () => {
  const cases = {
    Anthropic: ['claude-haiku-5', 'Claude Haiku 5'],
    OpenAI: ['o5-mini', 'o5-mini'],
    Google: ['gemini-4-flash-lite', 'Gemini 4 Flash-Lite'],
    xAI: ['grok-5-fast', 'Grok 5 fast'],
    DeepSeek: ['deepseek-v5', 'DeepSeek V5'],
    Mistral: ['mistral-small-4', 'Mistral Small 4'],
  };
  for (const rule of VENDOR_RULES) {
    const [id, label] = cases[rule.vendor];
    assert.ok(rule.family.test(id), `${id} fits ${rule.vendor}`);
    assert.equal(rule.label(id), label);
  }
});

test('the data file round-trips: rendered, imported, identical, and stable', async () => {
  const { writeFileSync, mkdtempSync, symlinkSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'tt-models-'));
  // The data file imports only a type from ./models.ts, which type stripping erases.
  symlinkSync(join(process.cwd(), 'src/lib/models.ts'), join(dir, 'models.ts'));
  const text = renderDataFile(MODELS, '2026-09-24');
  writeFileSync(join(dir, 'models.data.ts'), text);
  const back = await import(join(dir, 'models.data.ts'));
  assert.equal(back.PRICING_AS_OF, '2026-09-24');
  assert.deepEqual(back.MODEL_DATA, MODELS.map((m) => JSON.parse(JSON.stringify(m))));
  assert.equal(renderDataFile(back.MODEL_DATA, '2026-09-24'), text, 'rendering is deterministic');
});

test('the committed data file is exactly what the renderer writes', async () => {
  const { readFileSync } = await import('node:fs');
  const { MODEL_DATA, PRICING_AS_OF } = await import('../src/lib/models.data.ts');
  assert.equal(readFileSync('src/lib/models.data.ts', 'utf8'), renderDataFile(MODEL_DATA, PRICING_AS_OF),
    'hand-edit models.data.ts in the same format, or the next sync rewrites the difference');
});

test('the report separates what was applied from what was held', () => {
  const plan = planSync([gpt5, mistral], {
    'gpt-5': chat('openai', 1.3, 10),
    'mistral/mistral-large-latest': chat('mistral', 0.5, 1.5),
    'gpt-5.6-cyber': chat('openai', 9, 9),
  }, TODAY);
  const safe = renderReport(plan, 'safe', 'test');
  assert.match(safe, /1 update applied/);
  assert.match(safe, /`gpt-5`/);
  assert.ok(!safe.includes('mistral-large-2'));
  const review = renderReport(plan, 'all', 'test');
  assert.match(review, /### Model list: 1 change needs a look/);
  assert.match(review, /mistral-large-2/);
  assert.match(review, /gpt-5\.6-cyber/);
});
