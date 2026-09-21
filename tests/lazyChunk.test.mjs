/**
 * Recognising a stale code-split chunk.
 *
 * The paid tabs are dynamic imports. Every deploy re-hashes their filenames, so
 * a browser holding the previous index.html asks for files that are gone - and
 * with no boundary above it, that rejection blanked the whole app on the
 * features someone had just paid for.
 *
 * Recovery hinges on recognising the rejection, and every engine words it
 * differently. These are the real strings.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksStale } from '../src/lib/lazyChunk.ts';

test('the wording each browser uses is recognised', () => {
  const real = [
    // Chrome / Edge
    'TypeError: Failed to fetch dynamically imported module: https://x/assets/CacheSimulator-CS7U0Sqx.js',
    // Firefox
    'error loading dynamically imported module: https://x/assets/Batch-abc.js',
    // Safari
    'TypeError: Importing a module script failed.',
    // Webpack-era bundlers, still seen in the wild
    'ChunkLoadError: Loading chunk 7 failed.',
    // A plain network failure on the same request
    'TypeError: Failed to fetch',
  ];
  for (const message of real) {
    assert.ok(looksStale(new Error(message)), `not recognised: ${message}`);
  }
});

test('an ordinary render error is not mistaken for one', () => {
  // These must reach the boundary and be shown, not trigger a page reload:
  // reloading cannot fix a bug in the component, and doing it silently would
  // hide the only evidence of what went wrong.
  const unrelated = [
    "TypeError: Cannot read properties of undefined (reading 'map')",
    'RangeError: Maximum call stack size exceeded',
    'Error: Rendered fewer hooks than expected',
  ];
  for (const message of unrelated) {
    assert.ok(!looksStale(new Error(message)), `wrongly treated as stale: ${message}`);
  }
});

test('a non-Error rejection is handled rather than crashing the check', () => {
  assert.equal(looksStale('Failed to fetch dynamically imported module'), true);
  assert.equal(looksStale(undefined), false);
  assert.equal(looksStale(null), false);
  assert.equal(looksStale({ weird: true }), false);
});
