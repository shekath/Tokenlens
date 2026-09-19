/**
 * Trimmer rules. The risk with a prompt linter is not that it saves too little -
 * it is that it quietly changes what the prompt asks for. These tests hold it to
 * removing ceremony only.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, monthlySaving, trim } from '../src/lib/trimmer.ts';
import { encodeBase, loadPrimary } from '../src/lib/tokenize.ts';

const count = (s) => (s.length === 0 ? 0 : encodeBase(s).o200k.length);

before(async () => {
  await loadPrimary();
});

test('politeness filler is removed and the instruction survives', () => {
  const r = trim('Please kindly summarise the report. Thank you!', count);
  assert.ok(/summarise the report/i.test(r.trimmed));
  assert.ok(!/please/i.test(r.trimmed));
  assert.ok(!/kindly/i.test(r.trimmed));
  assert.ok(r.tokensSaved > 0);
});

test('verbose connectives collapse to one word', () => {
  const r = trim('Use the API in order to fetch results due to the fact that it is faster.', count);
  assert.ok(r.trimmed.includes('to fetch'));
  assert.ok(r.trimmed.includes('because'));
  assert.ok(!/in order to|due to the fact/i.test(r.trimmed));
});

test('a repeated long instruction is stated once', () => {
  const line = 'Always confirm the tracking number before giving shipment details.';
  const r = trim(`${line}\nSomething else entirely here.\n${line}`, count);
  assert.equal(r.trimmed.split(line).length - 1, 1);
});

test('short repeated lines are structure and are left alone', () => {
  const r = trim('Rules:\n- a\n- b\nRules:\n- c', count);
  assert.equal(r.trimmed.split('Rules:').length - 1, 2, 'headings must not be deduped');
});

test('numbers, negations and proper nouns are never touched', () => {
  const prompt =
    'Do not quote a delivery date. Escalate to Northwind Logistics if the total exceeds 250 USD or 3 items.';
  const r = trim(prompt, count);
  for (const token of ['Do not', 'Northwind Logistics', '250', '3 items']) {
    assert.ok(r.trimmed.includes(token), `${token} was lost`);
  }
});

test('every rule either saves tokens or leaves the count unchanged', () => {
  const prompt = `Please act as a helpful assistant.

You are a helpful assistant that summarises text.
Kindly summarise the following in order to help the user.
Just be very concise.   

***

Kindly summarise the following in order to help the user.`;
  const r = trim(prompt, count);
  for (const f of r.findings) {
    assert.ok(f.tokensSaved >= 0, `${f.rule.id} increased the token count by ${-f.tokensSaved}`);
  }
  assert.ok(r.tokensSaved > 0);
  assert.ok(r.savedFraction > 0 && r.savedFraction < 1);
});

test('a lean prompt yields no findings and is returned unchanged in substance', () => {
  const lean = 'Summarise the attached report in five bullets. Lead with the revenue figure.';
  const r = trim(lean, count);
  assert.equal(r.tokensSaved, 0);
  assert.equal(r.findings.length, 0);
  assert.equal(r.trimmed, lean);
});

test('disabling a rule removes its effect and its finding', () => {
  const prompt =
    'Please summarise this. Kindly include a title. Thank you very much. Could you please also add tags in order to help.';
  const all = trim(prompt, count);
  const without = trim(prompt, count, new Set(['verbosePhrase']));
  assert.ok(/please/i.test(without.trimmed), 'the politeness rule was off, so "please" should remain');
  assert.ok(/kindly/i.test(without.trimmed));
  assert.ok(without.findings.every((f) => f.rule.id === 'verbosePhrase'));
  assert.ok(without.tokensSaved < all.tokensSaved, `${without.tokensSaved} should be under ${all.tokensSaved}`);
});

test('a rule that saves nothing on this prompt is still reported honestly', () => {
  // Removing a single leading "Please " can net zero tokens, because the word
  // that follows re-tokenises differently at the start of a string. The finding
  // is still listed - with its real measured saving - rather than hidden.
  const r = trim('Please summarise this in order to save time.', count);
  const politeness = r.findings.find((f) => f.rule.id === 'politeness');
  assert.ok(politeness, 'the occurrence should be reported');
  assert.equal(politeness.occurrences, 1);
  assert.ok(politeness.tokensSaved >= 0);
});

test('findings are ranked by what they actually save', () => {
  const prompt = `Please act as a helpful assistant.
Kindly, please, kindly do the thing in order to succeed.
Just really very basically simply do it.`;
  const r = trim(prompt, count);
  for (let i = 1; i < r.findings.length; i += 1) {
    assert.ok(r.findings[i - 1].tokensSaved >= r.findings[i].tokensSaved);
  }
});

test('an empty prompt is handled without NaN', () => {
  const r = trim('', count);
  assert.equal(r.tokensSaved, 0);
  assert.equal(r.savedFraction, 0);
  assert.equal(r.findings.length, 0);
});

test('every rule has a label and an explanation a user can act on', () => {
  for (const rule of RULES) {
    assert.ok(rule.label.length > 3, rule.id);
    assert.ok(rule.why.length > 20, rule.id);
    assert.ok(['trim', 'review'].includes(rule.severity), rule.id);
  }
});

test('rules are idempotent — running the output back through changes nothing', () => {
  const prompt = 'Please kindly do the thing in order to succeed.   \n\n\n\nAnd again.';
  const once = trim(prompt, count);
  const twice = trim(once.trimmed, count);
  assert.equal(twice.trimmed, once.trimmed);
  assert.equal(twice.tokensSaved, 0);
});

test('monthly saving is tokens x volume x rate', () => {
  // 1,000 tokens over 1M calls at $5/M = 1e9 tokens = $5,000
  assert.equal(monthlySaving(1_000, 1_000_000, 5), 5_000);
  assert.equal(monthlySaving(0, 1_000_000, 5), 0);
});
