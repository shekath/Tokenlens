/**
 * Hash routing.
 *
 * The hash rather than the path because GitHub Pages serves static files and
 * cannot rewrite /docs onto index.html - a path route would 404 on exactly the
 * two things a docs page needs to survive, a reload and a shared link.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAV, hashFor, routeFromHash } from '../src/lib/useHashRoute.ts';

test('the pages are reachable by their own hash', () => {
  assert.equal(routeFromHash('#/docs'), 'docs');
  assert.equal(routeFromHash('#/faq'), 'faq');
  assert.equal(routeFromHash('#/devtools'), 'devtools');
  assert.equal(routeFromHash('#docs'), 'docs', 'the slash is optional');
  assert.equal(routeFromHash('#/DOCS'), 'docs', 'and the case is not load-bearing');
});

test('anything else is the app', () => {
  for (const hash of ['', '#', '#/', '#/app', '#/nonsense', '#access_token=x']) {
    assert.equal(routeFromHash(hash), 'app', `${hash} should land on the app`);
  }
});

test('a trailing query on the hash does not break the match', () => {
  assert.equal(routeFromHash('#/docs?from=email'), 'docs');
});

test('the hash written back is the one that reads back', () => {
  for (const route of ['app', 'docs', 'devtools', 'faq']) {
    assert.equal(routeFromHash(hashFor(route)), route);
  }
});

test('the navigation lists every route, dashboard first', () => {
  // The top bar and the footer both render NAV, so this is the only place the
  // order and the labels are decided.
  assert.deepEqual(
    NAV.map((item) => item.route),
    ['app', 'docs', 'devtools', 'faq'],
    'the dashboard is the home page and comes before the reference pages',
  );
  for (const item of NAV) {
    assert.ok(item.label.trim(), `${item.route} needs a label`);
    assert.equal(routeFromHash(hashFor(item.route)), item.route);
  }
});

test('a section query lands on the page and names the section', async () => {
  const { sectionFromHash } = await import('../src/lib/useSectionLanding.ts');
  assert.equal(routeFromHash('#/devtools?s=ci'), 'devtools');
  assert.equal(sectionFromHash('#/devtools?s=ci'), 'ci');
  assert.equal(sectionFromHash('#/docs'), null);
  assert.equal(sectionFromHash('#/docs?from=email'), null);
});

test('the privacy policy routes, keeps its language and section, but stays out of the top bar', async () => {
  const { sectionFromHash } = await import('../src/lib/useSectionLanding.ts');
  const { ROUTE_LABELS } = await import('../src/lib/useHashRoute.ts');
  assert.equal(routeFromHash('#/privacy'), 'privacy');
  assert.equal(routeFromHash(hashFor('privacy')), 'privacy');
  assert.equal(routeFromHash('#/privacy?lang=ar&s=terms'), 'privacy');
  assert.equal(sectionFromHash('#/privacy?lang=ar&s=terms'), 'terms');
  assert.ok(!NAV.some((item) => item.route === 'privacy'), 'reached from the footer, not the top bar');
  assert.equal(ROUTE_LABELS.privacy, 'Privacy Policy');
});
