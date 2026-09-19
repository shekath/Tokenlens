/** The entitlements matrix is the business model in code; these are its invariants. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPARISON,
  ENTITLEMENTS,
  FREE_MODEL_IDS,
  PLANS,
  entitlementsFor,
  requiredTier,
} from '../src/lib/entitlements.ts';
import { MODELS_BY_ID } from '../src/lib/models.ts';

test('every free-tier model id exists in the registry', () => {
  for (const id of FREE_MODEL_IDS) {
    assert.ok(MODELS_BY_ID[id], `${id} is not a real model`);
  }
});

test('the free tier is a strict subset of what Pro unlocks', () => {
  for (const [feature, free] of Object.entries(ENTITLEMENTS.free.features)) {
    if (free) assert.ok(ENTITLEMENTS.pro.features[feature], `pro lost ${feature}`);
  }
});

test('Team is a superset of Pro — no feature is lost by paying more', () => {
  for (const [feature, pro] of Object.entries(ENTITLEMENTS.pro.features)) {
    if (pro) assert.ok(ENTITLEMENTS.team.features[feature], `team is missing ${feature}`);
  }
  assert.ok(ENTITLEMENTS.team.maxSavedEstimates >= ENTITLEMENTS.pro.maxSavedEstimates);
  assert.ok(ENTITLEMENTS.team.maxBatchRows >= ENTITLEMENTS.pro.maxBatchRows);
});

test('limits increase monotonically with price', () => {
  assert.ok(ENTITLEMENTS.free.maxSavedEstimates < ENTITLEMENTS.pro.maxSavedEstimates);
  assert.ok(ENTITLEMENTS.free.maxBatchRows < ENTITLEMENTS.pro.maxBatchRows);
});

test('the free tier gates models; paid tiers do not', () => {
  assert.ok(Array.isArray(ENTITLEMENTS.free.modelAllowlist));
  assert.equal(ENTITLEMENTS.pro.modelAllowlist, null);
  assert.equal(ENTITLEMENTS.team.modelAllowlist, null);
});

test('an unknown or missing tier falls back to free, never to a paid tier', () => {
  assert.equal(entitlementsFor(null).tier, 'free');
  assert.equal(entitlementsFor(undefined).tier, 'free');
  for (const f of Object.values(entitlementsFor(null).features)) assert.equal(f, false);
});

test('requiredTier names the cheapest plan that unlocks a feature', () => {
  assert.equal(requiredTier('cacheSimulator'), 'pro');
  assert.equal(requiredTier('trimmer'), 'pro');
  assert.equal(requiredTier('whiteLabel'), 'team');
  assert.equal(requiredTier('customRateCards'), 'team');
});

test('the free save cap matches the value the RLS policy enforces', async () => {
  const sql = await import('node:fs').then((fs) =>
    fs.readFileSync('supabase/migrations/0001_init.sql', 'utf8'),
  );
  // If these drift, the UI promises one thing and the database enforces another.
  // Matched by shape, not exact text: the helper moved schema and auth.uid()
  // is now wrapped for the query planner, neither of which changes the cap.
  const cap = new RegExp(
    `saved_estimate_count\\(.+\\)\\s*<\\s*${ENTITLEMENTS.free.maxSavedEstimates}\\b`,
  );
  assert.ok(cap.test(sql), 'the SQL cap does not match ENTITLEMENTS.free.maxSavedEstimates');
});

test('every plan has a price, an audience and highlights', () => {
  for (const p of PLANS) {
    assert.ok(p.name.length > 0, p.tier);
    assert.ok(p.audience.length > 0, p.tier);
    assert.ok(p.highlights.length >= 3, p.tier);
    assert.ok(p.monthly >= 0, p.tier);
  }
});

test('annual billing is a discount, not a markup', () => {
  for (const p of PLANS) {
    if (p.annual === null || p.annual === 0 || p.monthly === 0) continue;
    assert.ok(p.annual < p.monthly * 12, `${p.tier}: annual costs more than 12 months`);
  }
});

test('paid plans name the environment variables their checkout needs', () => {
  for (const p of PLANS) {
    if (p.monthly === 0) continue;
    assert.ok(p.variantEnv.monthly.startsWith('VITE_'), p.tier);
  }
});

test('the comparison table covers every plan column', () => {
  for (const row of COMPARISON) {
    assert.ok(row.free.length > 0 && row.pro.length > 0 && row.team.length > 0, row.label);
  }
});

test('the sharing view is not granted to anonymous readers', async () => {
  // A plain grant would let anyone with the anon key dump every shared row;
  // share links are meant to be unlisted, not public.
  const fs = await import('node:fs');
  const sql = fs.readFileSync('supabase/migrations/0001_init.sql', 'utf8');
  assert.ok(
    /revoke all on public\.shared_estimates from anon, authenticated/.test(sql),
    'shared_estimates must not be directly selectable',
  );
  assert.ok(
    /grant execute on function public\.get_shared_estimate\(text\) to anon, authenticated/.test(sql),
    'access should go through a slug lookup',
  );
  assert.ok(
    !/grant select on public\.shared_estimates/.test(sql),
    'a blanket select grant makes shared estimates enumerable',
  );
});

test('publishing a share link is enforced as a Team entitlement in SQL, not just in the UI', async () => {
  const fs = await import('node:fs');
  const sql = fs.readFileSync('supabase/migrations/0001_init.sql', 'utf8');
  assert.ok(
    /is_public = false\s+or\s+\w+\.current_tier\(.+\)\s*=\s*'team'/.test(sql),
    'the update policy must gate is_public on the Team tier',
  );
  assert.ok(ENTITLEMENTS.team.features.shareLinks, 'and the matrix must agree');
  assert.ok(!ENTITLEMENTS.pro.features.shareLinks);
});

test('billing columns are locked against non-service-role callers', async () => {
  const fs = await import('node:fs');
  const sql = fs.readFileSync('supabase/migrations/0001_init.sql', 'utf8');
  for (const column of ['tier', 'subscription_status', 'lemon_subscription_id', 'current_period_end']) {
    assert.ok(
      new RegExp(`new\\.${column}\\s*:=\\s*old\\.${column}`).test(sql),
      `${column} is not reverted for client callers`,
    );
  }
});

test('every SECURITY DEFINER function pins its search_path', async () => {
  const fs = await import('node:fs');
  const sql = fs.readFileSync('supabase/migrations/0001_init.sql', 'utf8');
  // A definer function resolving names through the caller's search_path can be
  // hijacked by a same-named object in a schema the caller controls.
  const definers = sql.split(/create or replace function/i).slice(1).filter((b) => /security definer/i.test(b));
  assert.ok(definers.length >= 4, `expected several definer functions, found ${definers.length}`);
  for (const body of definers) {
    const name = body.trim().split('(')[0];
    assert.ok(/set search_path = public, pg_temp/.test(body), `${name} does not pin search_path`);
  }
});

test('policy helpers live outside the PostgREST-exposed schema', async () => {
  // In `public` these are published at /rest/v1/rpc/ and, being SECURITY
  // DEFINER, bypass RLS - which leaked every user's tier until it was fixed.
  const fs = await import('node:fs');
  const sql = fs.readFileSync('supabase/migrations/0001_init.sql', 'utf8');
  for (const fn of ['current_tier', 'saved_estimate_count']) {
    assert.ok(
      new RegExp(`create or replace function private\\.${fn}\\(`).test(sql),
      `${fn} must be defined in the private schema`,
    );
    assert.ok(
      !new RegExp(`create or replace function public\\.${fn}\\(`).test(sql),
      `${fn} must not also be defined in public`,
    );
  }
  assert.ok(
    /revoke all on function public\.handle_new_user\(\)\s+from public, anon, authenticated/.test(sql),
    'trigger functions should not be callable by clients',
  );
});
