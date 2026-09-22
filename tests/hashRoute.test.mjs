/**
 * Hash routing.
 *
 * The hash rather than the path because GitHub Pages serves static files and
 * cannot rewrite /docs onto index.html - a path route would 404 on exactly the
 * two things a docs page needs to survive, a reload and a shared link.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashFor, routeFromHash } from '../src/lib/useHashRoute.ts';

test('the pages are reachable by their own hash', () => {
  assert.equal(routeFromHash('#/docs'), 'docs');
  assert.equal(routeFromHash('#/faq'), 'faq');
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
  for (const route of ['app', 'docs', 'faq']) {
    assert.equal(routeFromHash(hashFor(route)), route);
  }
});
