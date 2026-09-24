/** The privacy policy: every translation says the same things in the same places. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  POLICIES,
  SECTION_ORDER,
  fill,
  formatEffective,
  langFromTag,
  pickLang,
  placeholders,
  splitLead,
} from '../src/lib/privacy/index.ts';

const en = POLICIES.en;
const langs = Object.keys(POLICIES);

/** Every string a section contains, table cells included. */
function strings(section) {
  return section.blocks.flatMap((b) =>
    typeof b === 'string' ? [b] : 'list' in b ? b.list : [...b.table.head, ...b.table.rows.flat()],
  );
}
const shape = (section) =>
  section.blocks.map((b) =>
    typeof b === 'string' ? 'p' : 'list' in b ? `list:${b.list.length}` : `table:${b.table.head.length}x${b.table.rows.length}`,
  );

test('English is first, and eight languages are published', () => {
  assert.equal(langs[0], 'en');
  assert.deepEqual(langs, ['en', 'hi', 'es', 'fr', 'de', 'pt', 'ja', 'ar']);
});

test('every language has every section, in the governing order', () => {
  for (const lang of langs) {
    assert.deepEqual(POLICIES[lang].sections.map((s) => s.id), SECTION_ORDER, lang);
  }
});

test('every section has the same paragraphs, lists and tables as the English', () => {
  for (const lang of langs) {
    POLICIES[lang].sections.forEach((s, i) => {
      assert.deepEqual(shape(s), shape(en.sections[i]), `${lang} ${s.id}`);
      assert.ok(s.title.trim(), `${lang} ${s.id} has a title`);
    });
  }
});

test('placeholders are the same in every language, section by section', () => {
  for (const lang of langs) {
    POLICIES[lang].sections.forEach((s, i) => {
      const got = strings(s).flatMap(placeholders).sort();
      const want = strings(en.sections[i]).flatMap(placeholders).sort();
      assert.deepEqual(got, want, `${lang} ${s.id}`);
    });
    assert.deepEqual(placeholders(POLICIES[lang].ui.effective), ['effective'], `${lang} ui.effective`);
    for (const [key, value] of Object.entries(POLICIES[lang].ui)) {
      assert.ok(value.trim(), `${lang} ui.${key} is filled in`);
    }
  }
});

test('the terms sit mid-policy, not first or last, with all seven points in every language', () => {
  const at = SECTION_ORDER.indexOf('terms');
  assert.ok(at > 2 && at < SECTION_ORDER.length - 3, `terms at ${at}`);
  for (const lang of langs) {
    const terms = POLICIES[lang].sections.find((s) => s.id === 'terms');
    const items = terms.blocks[0].list;
    assert.equal(items.length, 7, lang);
    // Each opens with a short heading the page sets in bold.
    for (const item of items) assert.ok(splitLead(item), `${lang}: ${item.slice(0, 30)}`);
  }
});

test('the English terms say what was asked of them', () => {
  const t = strings(en.sections.find((s) => s.id === 'terms')).join(' ');
  assert.match(t, /By creating an account.*you accept this policy/);
  assert.match(t, /suspend or close an account used for misconduct/);
  assert.match(t, /Prices, plans and the features they include may change, subject to conditions/);
  assert.match(t, /non-refundable/);
  assert.match(t, /except where the law of your country requires a refund/, 'a no-refund term cannot override consumer law');
  assert.match(t, /temporarily limited or halted by events beyond our reasonable control/);
  assert.match(t, /pandemics, war/);
  assert.match(t, /governed by the laws of India/);
});

test('the English text covers India first, then the other regimes', () => {
  const all = en.sections.flatMap(strings).join(' ');
  for (const needle of [
    'Digital Personal Data Protection Act, 2023',
    'Data Protection Board of India',
    'Information Technology Act, 2000',
    'Grievance Officer',
    'nominate',
    'GDPR',
    'UK GDPR',
    'CCPA',
    'Global Privacy Control',
    'LGPD',
    'PIPEDA',
    'Privacy Act 1988',
    'Standard Contractual Clauses',
  ]) {
    assert.ok(all.includes(needle), needle);
  }
  const ids = SECTION_ORDER;
  assert.ok(ids.indexOf('rights-india') < ids.indexOf('rights-eu'));
});

test('the providers table names every processor, in every language', () => {
  for (const lang of langs) {
    const table = POLICIES[lang].sections.find((s) => s.id === 'providers').blocks.find((b) => b.table).table;
    const names = table.rows.map((r) => r[0]).join(' ');
    for (const p of ['Supabase', 'Lemon Squeezy', 'Resend', 'Zoho Desk', 'Google', 'GitHub']) {
      assert.ok(names.includes(p), `${lang}: ${p}`);
    }
  }
});

test('Arabic reads right to left; everything else left to right', () => {
  for (const lang of langs) assert.equal(POLICIES[lang].dir, lang === 'ar' ? 'rtl' : 'ltr', lang);
});

test('every locale formats the effective date', () => {
  const seen = new Set();
  for (const lang of langs) {
    const { locale } = POLICIES[lang];
    assert.equal(Intl.getCanonicalLocales(locale)[0], locale, `${locale} is canonical`);
    const d = formatEffective('2026-09-24', locale);
    assert.notEqual(d, '2026-09-24', locale);
    assert.ok(d.includes('2026') || /٢٠٢٦/.test(d), `${locale}: ${d}`);
    seen.add(d);
  }
  assert.equal(formatEffective('2026-09-24', 'en-GB'), '24 September 2026');
  assert.ok(seen.size >= 6, 'the formats really differ');
});

test('fill replaces known placeholders and leaves unknown ones visible', () => {
  assert.equal(fill('Write to {{email}}.', { email: 'a@b.c' }), 'Write to a@b.c.');
  assert.equal(fill('{{nope}}', {}), '{{nope}}');
  // Nothing a translation contains is left unfilled once every value is set.
  const values = { operator: 'O', email: 'E', grievance: 'G', address: 'A', effective: 'D' };
  for (const lang of langs) {
    for (const s of POLICIES[lang].sections) {
      for (const str of strings(s)) assert.doesNotMatch(fill(str, values), /\{\{/, `${lang} ${s.id}`);
    }
  }
});

test('language choice: link, then saved choice, then browser, then English', () => {
  assert.equal(langFromTag('pt-BR'), 'pt');
  assert.equal(langFromTag('HI_in'), 'hi');
  assert.equal(langFromTag('xx'), null);
  assert.equal(pickLang({ query: 'ar', stored: 'fr', browser: ['de-DE'] }), 'ar');
  assert.equal(pickLang({ query: 'zz', stored: 'fr', browser: ['de-DE'] }), 'fr');
  assert.equal(pickLang({ stored: null, browser: ['nl-NL', 'ja-JP', 'en'] }), 'ja');
  assert.equal(pickLang({ browser: ['nl-NL'] }), 'en');
  assert.equal(pickLang({}), 'en');
});

test('splitLead finds the heading in each script and nothing else', () => {
  assert.deepEqual(splitLead('Refunds. Plan payments are final.'), ['Refunds.', 'Plan payments are final.']);
  assert.deepEqual(splitLead('返金。プランの支払い'), ['返金。', 'プランの支払い']);
  assert.deepEqual(splitLead('धनवापसी। प्लान'), ['धनवापसी।', 'प्लान']);
  assert.equal(splitLead('No heading here at all'), null);
});
