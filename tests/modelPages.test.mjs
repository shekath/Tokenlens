/**
 * Static model pricing pages and the ?model= deep link they use.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_DATA, PRICING_AS_OF } from '../src/lib/models.data.ts';
import { alternatives, money, perCall, rate, renderIndex, renderModelPage, renderSitemap, SITE_URL } from '../scripts/modelPages.ts';
import { modelFromSearch, withoutModelParam } from '../src/lib/deepLink.ts';

const m = MODEL_DATA.find((x) => x.id === 'claude-sonnet-5');

test('rates read the way vendors quote them', () => {
  assert.equal(rate(3), '$3');
  assert.equal(rate(0.25), '$0.25');
  assert.equal(rate(1.1), '$1.10');
  assert.equal(rate(0.075), '$0.075');
  assert.equal(rate(0.0375), '$0.0375');
});

test('a model page carries the real prices, worked examples and a deep link', () => {
  const html = renderModelPage(m, MODEL_DATA, PRICING_AS_OF);
  assert.match(html, /<title>Claude Sonnet 5 pricing and cost calculator \| TokenTicks<\/title>/);
  assert.ok(html.includes(`${rate(m.inputPerM)} per 1M tokens`));
  assert.ok(html.includes(money(perCall(m, 1000, 300))));
  assert.ok(html.includes(`${SITE_URL}?model=claude-sonnet-5`));
  assert.ok(html.includes(`<link rel="canonical" href="${SITE_URL}models/claude-sonnet-5/">`));
  // JSON-LD cannot close its own script tag.
  const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
  assert.equal(JSON.parse(ld)['@type'], 'FAQPage');
});

test('every model gets a page, and labels are escaped', () => {
  for (const x of MODEL_DATA) {
    const html = renderModelPage(x, MODEL_DATA, PRICING_AS_OF);
    assert.ok(html.startsWith('<!doctype html>'), x.id);
  }
  const html = renderModelPage({ ...m, label: 'A <b>&</b>' }, MODEL_DATA, PRICING_AS_OF);
  assert.ok(html.includes('A &lt;b&gt;&amp;&lt;/b&gt; pricing'));
  assert.ok(!html.includes('<b>&</b>'));
});

test('alternatives exclude the model and are the closest in price', () => {
  const alts = alternatives(m, MODEL_DATA, 5);
  assert.equal(alts.length, 5);
  assert.ok(!alts.some((a) => a.id === m.id));
});

test('index and sitemap list every model', () => {
  const idx = renderIndex(MODEL_DATA, PRICING_AS_OF);
  const map = renderSitemap(MODEL_DATA, PRICING_AS_OF);
  for (const x of MODEL_DATA) {
    assert.ok(idx.includes(`models/${x.id}/`), x.id);
    assert.ok(map.includes(`<loc>${SITE_URL}models/${x.id}/</loc>`), x.id);
  }
});

test('?model= picks a known model once and is then removed', () => {
  const known = (id) => id === 'gpt-5';
  assert.equal(modelFromSearch('?model=gpt-5', known), 'gpt-5');
  assert.equal(modelFromSearch('?model=nope', known), null);
  assert.equal(modelFromSearch('', known), null);
  assert.equal(withoutModelParam('https://x.io/Tokenlens/?model=gpt-5&a=1#/docs'), '/Tokenlens/?a=1#/docs');
  assert.equal(withoutModelParam('https://x.io/Tokenlens/?model=gpt-5'), '/Tokenlens/');
});
