/**
 * The licence decision table. The property that matters most is the negative
 * one: no licence failure ever produces anything but a working free tier -
 * and a key the server rejects is not rescued by a stale cache.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRESH_MS, GRACE_MS, resolveLicence } from '../cli/src/licence.ts';

const KEY = `tt_${'a'.repeat(64)}`;
const HOUR = 3_600_000;

function deps({ cache = null, answer = { tier: 'pro', publicId: 'TT-1' }, configured = true, now = 1_000 * HOUR } = {}) {
  const calls = { check: 0, written: null, cleared: 0 };
  let stored = cache;
  return {
    calls,
    get stored() {
      return stored;
    },
    configured,
    now: () => now,
    // Opaque on purpose: a stand-in that embedded the key would make the
    // "key never reaches the cache" assertion test the stub, not the code.
    hash: (k) => (k === KEY ? 'HASH-1' : 'HASH-2'),
    readCache: () => stored,
    writeCache: (e) => {
      stored = e;
      calls.written = e;
    },
    clearCache: () => {
      stored = null;
      calls.cleared += 1;
    },
    check: async () => {
      calls.check += 1;
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

const cached = (tier, ageMs, now = 1_000 * HOUR) => ({ keyHash: 'HASH-1', tier, publicId: 'TT-1', checkedAt: now - ageMs });

test('no key: free, silently, with no network call', async () => {
  const d = deps();
  const l = await resolveLicence(undefined, d);
  assert.deepEqual([l.tier, l.source, l.warning], ['free', 'none', null]);
  assert.equal(d.calls.check, 0);
});

test('a malformed key is free with a warning and never sent anywhere', async () => {
  const d = deps();
  const l = await resolveLicence('sk-live-123', d);
  assert.equal(l.tier, 'free');
  assert.equal(l.source, 'invalid');
  assert.match(l.warning, /not a TokenTicks key/);
  assert.equal(d.calls.check, 0);
});

test('a fresh cache answers without the network', async () => {
  const d = deps({ cache: cached('team', FRESH_MS - 1) });
  const l = await resolveLicence(KEY, d);
  assert.deepEqual([l.tier, l.source], ['team', 'cache']);
  assert.equal(d.calls.check, 0);
});

test('a cache for a different key is ignored', async () => {
  const d = deps({ cache: { ...cached('team', 1), keyHash: 'HASH-OTHER' } });
  const l = await resolveLicence(KEY, d);
  assert.deepEqual([l.tier, l.source], ['pro', 'online']);
});

test('a stale cache is refreshed online, and the answer cached by hash', async () => {
  const d = deps({ cache: cached('team', FRESH_MS + 1) });
  const l = await resolveLicence(KEY, d);
  assert.deepEqual([l.tier, l.source, l.publicId], ['pro', 'online', 'TT-1']);
  assert.equal(d.calls.written.keyHash, 'HASH-1');
  assert.ok(!JSON.stringify(d.calls.written).includes(KEY), 'the key itself is never written to the cache');
});

test('server unreachable within the grace period: the cached plan, with a warning', async () => {
  const d = deps({ cache: cached('team', GRACE_MS - HOUR), answer: new Error('ETIMEDOUT') });
  const l = await resolveLicence(KEY, d);
  assert.deepEqual([l.tier, l.source], ['team', 'grace']);
  assert.match(l.warning, /Could not reach .*ETIMEDOUT.*team plan confirmed 7 days ago/);
});

test('server unreachable past the grace period: free, with a warning that says nothing fails', async () => {
  const d = deps({ cache: cached('team', GRACE_MS + HOUR), answer: new Error('ECONNREFUSED') });
  const l = await resolveLicence(KEY, d);
  assert.deepEqual([l.tier, l.source], ['free', 'offline']);
  assert.match(l.warning, /nothing fails because of this/);
});

test('server unreachable and no cache at all: free', async () => {
  const l = await resolveLicence(KEY, deps({ answer: new Error('offline') }));
  assert.deepEqual([l.tier, l.source], ['free', 'offline']);
});

test('a revoked key is free at once: the grace period covers outages, not revocations', async () => {
  const d = deps({ cache: cached('team', FRESH_MS + 1), answer: null });
  const l = await resolveLicence(KEY, d);
  assert.deepEqual([l.tier, l.source], ['free', 'invalid']);
  assert.match(l.warning, /not recognised or has been revoked/);
  assert.equal(d.calls.cleared, 1);
  assert.equal(d.stored, null);
});

test('a build with no licence server still honours a recent cache, else runs free', async () => {
  const withCache = await resolveLicence(KEY, deps({ configured: false, cache: cached('pro', FRESH_MS + 1) }));
  assert.deepEqual([withCache.tier, withCache.source], ['pro', 'grace']);
  const d = deps({ configured: false });
  const bare = await resolveLicence(KEY, d);
  assert.deepEqual([bare.tier, bare.source], ['free', 'unconfigured']);
  assert.equal(d.calls.check, 0);
});

test('an answer with a tier this version does not know is not trusted', async () => {
  const l = await resolveLicence(KEY, deps({ answer: { tier: 'enterprise', publicId: null } }));
  assert.equal(l.tier, 'free');
});

test('a cache entry from the future (clock skew) is not treated as fresh', async () => {
  const d = deps({ cache: cached('team', -HOUR) });
  const l = await resolveLicence(KEY, d);
  assert.equal(l.source, 'online');
});
